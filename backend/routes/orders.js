import express from 'express';
import Order from '../models/Order.js';
import Inventory from '../models/Inventory.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import nodemailer from 'nodemailer';

const router = express.Router();

const BULK_THRESHOLD = 20;
const BULK_PAYMENT_RATIO = 0.5;

function toOrderDto(order) {
  const o = order.toObject ? order.toObject({ virtuals: true }) : order;
  const customer = o.customer && typeof o.customer === 'object' ? o.customer : null;
  
  // Calculate totalPrice from items if missing or zero
  let totalPrice = o.totalPrice || 0;
  if (!totalPrice && o.items && o.items.length > 0) {
    totalPrice = o.items.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
  }
  
  return {
    id: o._id,
    customerId: customer?._id || o.customer,
    customerName: customer?.name,
    customerEmail: customer?.email,
    recipientName: o.recipientName,
    items: (o.items || []).map((it) => ({
      sku: it.sku,
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      customization: it.customization
    })),
    totalQty: o.totalQty,
    totalPrice: totalPrice,
    isBulk: o.isBulk,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    paidAmount: o.paidAmount,
    requiredPayment: o.requiredPayment,
    shippingAddress: o.shippingAddress,
    contactPhone: o.contactPhone,
    notes: o.notes,
    paymentDetails: o.paymentDetails,
    paymongoPaymentId: o.paymongoPaymentId,
    paymongoSourceId: o.paymongoSourceId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  };
}

// Get all orders (admin only)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, q } = req.query;
    const normalizedStatus = typeof status === 'string' ? status.trim() : '';
    const normalizedQ = typeof q === 'string' ? q.trim() : '';

    const pipeline = [];

    if (normalizedStatus && normalizedStatus !== 'all') {
      pipeline.push({ $match: { status: normalizedStatus } });
    }

    pipeline.push({
      $lookup: {
        from: 'users',
        localField: 'customer',
        foreignField: '_id',
        as: 'customer'
      }
    });
    pipeline.push({ $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } });
    pipeline.push({ $addFields: { orderIdStr: { $toString: '$_id' } } });

    if (normalizedQ) {
      pipeline.push({
        $match: {
          $or: [
            { orderIdStr: { $regex: normalizedQ, $options: 'i' } },
            { 'customer.name': { $regex: normalizedQ, $options: 'i' } },
            { 'customer.email': { $regex: normalizedQ, $options: 'i' } }
          ]
        }
      });
    }

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({
      $project: {
        _id: 1,
        customer: 1,
        items: 1,
        totalQty: 1,
        totalPrice: 1,
        isBulk: 1,
        status: 1,
        paymentMethod: 1,
        paymentStatus: 1,
        paidAmount: 1,
        requiredPayment: 1,
        shippingAddress: 1,
        contactPhone: 1,
        notes: 1,
        paymentDetails: 1,
        paymongoPaymentId: 1,
        paymongoSourceId: 1,
        createdAt: 1,
        updatedAt: 1
      }
    });

    const orders = await Order.aggregate(pipeline);
    res.json(orders.map(toOrderDto));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get my orders (customer)
router.get('/my', authMiddleware, async (req, res) => {
  const orders = await Order.find({ customer: req.user.userId })
    .sort({ createdAt: -1 })
    .populate('customer');
  res.json(orders.map(toOrderDto));
});

// Get order by id (customer owner or admin)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'admin' && String(order.customer?._id || order.customer) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(toOrderDto(order));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create order (customer)
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('POST /orders called with body:', req.body);
    const { items, shippingAddress, contactPhone, notes, paymentMethod, paymentDetails } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items are required' });
    }
    if (!shippingAddress || !String(shippingAddress).trim()) {
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    const skus = items.map((it) => it.sku);
    const inventoryDocs = await Inventory.find({ sku: { $in: skus }, isActive: true });
    const inventoryBySku = new Map(inventoryDocs.map((inv) => [inv.sku, inv]));

    for (const it of items) {
      if (!it?.sku) return res.status(400).json({ message: 'Item SKU is required' });
      const qty = Number(it.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ message: 'Invalid quantity' });
      const inv = inventoryBySku.get(it.sku);
      if (!inv) return res.status(400).json({ message: `Invalid SKU: ${it.sku}` });
      // Check stock availability
      if (inv.stock < qty) {
        return res.status(400).json({ 
          message: `Insufficient stock for ${inv.name}. Available: ${inv.stock}, Requested: ${qty}` 
        });
      }
    }

    const totalQty = items.reduce((sum, it) => sum + Number(it.quantity), 0);
    const isBulk = totalQty >= BULK_THRESHOLD;

    let totalPrice = 0;
    const orderItems = [];
    for (const it of items) {
      const qty = Number(it.quantity);
      const inv = inventoryBySku.get(it.sku);
      totalPrice += qty * inv.price;
      orderItems.push({
        sku: inv.sku,
        name: inv.name,
        quantity: qty,
        unitPrice: inv.price,
        customization: it.customization
      });
    }

    const order = new Order({
      customer: req.user.userId,
      items: orderItems,
      totalQty,
      totalPrice,
      isBulk,
      shippingAddress: String(shippingAddress).trim(),
      contactPhone: contactPhone ? String(contactPhone).trim() : undefined,
      notes: notes ? String(notes).trim() : undefined,
      paymentMethod: paymentMethod || 'cod',
      status: 'pending',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'awaiting_payment', // Mark as awaiting for e-wallet payments
      requiredPayment: isBulk ? totalPrice * BULK_PAYMENT_RATIO : totalPrice,
      paidAmount: 0, // Will be updated after successful payment
      paymentDetails: {
        ...paymentDetails,
        ewalletPhone: paymentDetails?.phoneNumber // Store e-wallet phone for verification
      }
    });

    console.log('Order object before save:', JSON.stringify(order, null, 2));
    await order.save();
    console.log('Order saved successfully');

    // Send notifications only for COD orders initially
    // E-wallet notifications will be sent after successful payment
    if (paymentMethod === 'cod') {
      try {
        const notificationService = req.app.get('notificationService');
        if (notificationService) {
          // Notify customer of order confirmation
          await notificationService.notifyOrderConfirmation(order, req.user.userId);
          // Notify admins of new order
          await notificationService.notifyNewOrder(order);
          console.log('Notifications sent successfully for COD order');
        }
      } catch (notifErr) {
        console.error('Notification error (non-fatal):', notifErr.message);
      }
    } else {
      console.log('E-wallet order created - notifications will be sent after payment confirmation');
    }

    // Deduct stock only for COD orders
    // E-wallet orders will have stock deducted after payment confirmation
    if (paymentMethod === 'cod') {
      for (const it of items) {
        const inv = inventoryBySku.get(it.sku);
        if (inv.stock < Number(it.quantity)) {
          // Should not happen due to earlier check, but safety check
          console.warn(`Insufficient stock for ${it.sku}`);
        }
        inv.stock -= Number(it.quantity);
        inv.reservedStock = (inv.reservedStock || 0) + Number(it.quantity);
        await inv.save();
        console.log(`Stock deducted for COD order ${it.sku}: -${it.quantity}, remaining: ${inv.stock}, reserved: ${inv.reservedStock}`);
      }
    } else {
      console.log('Stock reserved for e-wallet order - will be deducted after payment confirmation');
    }

    const user = await User.findById(req.user.userId);
    if (user && isBulk) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: user.email,
          subject: 'Bulk Order Confirmation',
          text: `Your bulk order (${order._id}) has been received. Total items: ${totalQty}, Total price: ₱${totalPrice.toFixed(2)}. 50% payment (₱${(totalPrice * BULK_PAYMENT_RATIO).toFixed(2)}) is required to proceed.`
        });
      } catch (mailErr) {
        console.error('Failed to send bulk order email:', mailErr);
      }
    }

    res.status(201).json(toOrderDto(order));
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update order status (admin only)
router.put('/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'approved', 'in_production', 'ready', 'completed', 'rejected', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });
    
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    
    const previousStatus = order.status;
    
    // Handle inventory adjustments based on status changes
    if (status === 'rejected' || status === 'cancelled') {
      // Restore stock for rejected/cancelled orders
      if (previousStatus !== 'rejected' && previousStatus !== 'cancelled') {
        for (const item of order.items) {
          const inv = await Inventory.findOne({ sku: item.sku });
          if (inv) {
            inv.stock += item.quantity;
            inv.reservedStock = Math.max(0, (inv.reservedStock || 0) - item.quantity);
            await inv.save();
            console.log(`Stock restored for ${item.sku}: +${item.quantity}`);
          }
        }
      }
    }
    
    // Update order status
    order.status = status;
    await order.save();
    
    // Populate customer before sending notification
    await order.populate('customer');
    
    // Send notification for status update
    try {
      const notificationService = req.app.get('notificationService');
      console.log('=== ORDER STATUS UPDATE ===');
      console.log('Notification service available:', !!notificationService);
      console.log('Order customer:', order.customer);
      
      if (notificationService && order.customer) {
        const customerId = order.customer._id ? order.customer._id.toString() : order.customer.toString();
        console.log('Sending status notification to customer:', customerId);
        console.log('Status change:', previousStatus, '->', status);
        
        const notif = await notificationService.notifyOrderStatusUpdate(
          order, 
          customerId, 
          previousStatus, 
          status
        );
        
        console.log('Status notification result:', notif ? 'SUCCESS' : 'FAILED');
        if (notif) {
          console.log('Notification ID:', notif._id);
          console.log('Notification user field:', notif.user);
        }
      } else {
        console.log('Skipping notification - service or customer missing');
      }
    } catch (notifErr) {
      console.error('Status notification error (non-fatal):', notifErr.message);
      console.error(notifErr.stack);
    }
    
    res.json(toOrderDto(order));
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
