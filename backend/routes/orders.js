import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Inventory from '../models/Inventory.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import OrderAuditLog from '../models/OrderAuditLog.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import nodemailer from 'nodemailer';
import {
  validateOrderStock,
  reserveStockForOrder,
  releaseReservedForOrder,
  consumeReservedForOrder,
  restockReturnForOrder,
} from '../services/inventory.js';
import {
  sendOrderPlaced,
  sendOrderStatusUpdate,
  sendRefundIssued,
} from '../services/customerMail.js';
import {
  validateCoupon,
  redeemCoupon,
  releaseCouponForOrder,
} from '../services/coupons.js';
import {
  URGENCY_TIERS,
  classifyUrgency,
  calculateRushFee,
  checkCapacity,
  getTierAvailability,
  quoteDelivery,
} from '../services/urgency.js';
import { markRecovered } from '../services/abandonedCart.js';
import { uploadImage } from '../services/imageUpload.js';
import { sendPushToUser, getPushContentForStatus } from '../services/pushNotification.js';

const router = express.Router();

/**
 * Snapshot the calling admin for audit rows. Pulled once per request to
 * avoid repeated User lookups inside loops.
 */
async function actorSnapshot(req) {
  let name = '';
  try {
    const u = await User.findById(req.user.userId).select('name');
    if (u) name = u.name;
  } catch {
    /* non-fatal */
  }
  return {
    performedBy: req.user.userId,
    performedByName: name,
    performedByRole: req.user.role || '',
  };
}

/**
 * Single source of truth for status-change side-effects.
 *
 * Behavior depends on what state the order was in:
 *   - If reservation was active (no payment yet) → release reservation
 *   - If stock was already deducted (paid/shipped) → restock as a "return"
 *
 * Both paths write an audit row via the inventory service.
 */
async function restoreInventoryFor(order, actor = null, reason = 'Status change') {
  // If the order's stock was already deducted (approved/shipped/etc.), restore
  // it as a return movement. Otherwise just release the reservation.
  const wasFulfilled = order.inventoryConsumed ||
                        ['shipped', 'delivered', 'completed'].includes(order.status) ||
                        order.paymentStatus === 'paid';

  if (wasFulfilled) {
    await restockReturnForOrder({ order, actor, reason });
  } else {
    await releaseReservedForOrder({ order, actor, reason });
  }
}

const BULK_THRESHOLD = 20;
const BULK_PAYMENT_RATIO = 0.5;

/**
 * Single source of truth for customer-facing notifications fired on each
 * status transition. Used by:
 *   - PUT /orders/:id/status       (admin)
 *   - POST /orders/bulk-status     (admin)
 *   - POST /production/:id/qc-approve  (admin, via dynamic import)
 *   - POST /production/:id/advance     (admin/staff, via dynamic import)
 *
 * Centralising this avoids the loophole where a status that flips through
 * the production routes silently skips the customer-notification path.
 */
export async function notifyCustomerOfStatus(order, to, reason) {
  try {
    const { default: Notification } = await import('../models/Notification.js');
    const map = {
      approved: { title: 'Order approved', message: 'Your order is queued for production.', priority: 'normal', type: 'order_status_update' },
      in_production: { title: 'In production', message: 'A staff member started working on your order.', priority: 'normal', type: 'order_status_update' },
      ready: { title: 'Order ready', message: 'Your order passed quality check and is being prepared.', priority: 'high', type: 'order_status_update' },
      out_for_delivery: { title: 'Out for delivery', message: 'Your order is on its way!', priority: 'high', type: 'order_status_update' },
      for_pickup: { title: 'Ready for pickup', message: 'Your order is ready at the store.', priority: 'high', type: 'order_status_update' },
      completed: { title: 'Order completed', message: 'Thank you! Please rate each item on your order page.', priority: 'high', type: 'order_completed' },
      cancelled: { title: 'Order cancelled', message: reason || 'See your order details.', priority: 'high', type: 'order_cancelled' },
      rejected: { title: 'Order rejected', message: reason || 'See your order details.', priority: 'high', type: 'order_cancelled' },
      shipped: { title: 'Shipped', message: 'Your order has been shipped.', priority: 'high', type: 'order_status_update' },
      delivered: { title: 'Delivered', message: 'Your order has been delivered.', priority: 'high', type: 'order_completed' },
    };
    const m = map[to];
    if (!m) return;
    await Notification.create({
      type: m.type,
      title: m.title,
      message: String(m.message).slice(0, 240),
      target: 'customer',
      user: order.customer,
      relatedData: { orderId: String(order._id), status: to, amount: order.totalPrice },
      priority: m.priority,
    });

    // Mirror every status change into the order's chat thread as a
    // `kind: 'system'` message so the customer (and admin/staff opening the
    // same chat) see the whole journey in one conversation — no need to
    // bounce between the bell, the timeline, and the chat.
    try {
      const { postSystemMessage } = await import('./chat.js');
      const friendlyBody = reason
        ? `${m.title}: ${m.message} — Reason: ${reason}`
        : `${m.title}: ${m.message}`;
      await postSystemMessage({
        orderId: order._id,
        body: friendlyBody,
        meta: { status: to, reason: reason || null },
      });
    } catch { /* non-fatal */ }
  } catch (e) { /* non-fatal */ }
}

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
      customization: it.customization,
      // Surface design-snapshot booleans on the item directly so admin tables
      // can flag custom line items without parsing the nested customization.
      isCustomized: !!(it.customization && it.customization.isCustomized),
      hasDesignPreview: !!(it.customization && it.customization.previewImage),
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
    couponCode: o.couponCode || '',
    couponName: o.couponName || '',
    couponType: o.couponType || '',
    discountAmount: o.discountAmount || 0,
    subtotalBeforeDiscount: o.subtotalBeforeDiscount || 0,
    refundedAmount: o.refundedAmount || 0,
    refundedAt: o.refundedAt,
    // Reason fields (panel revision #12) so the customer sees exactly why.
    rejectionReason: o.rejectionReason || '',
    cancellationReason: o.cancellationReason || '',
    cancelledAt: o.cancelledAt,
    completedAt: o.completedAt,
    deliveryMethod: o.deliveryMethod || 'delivery',
    // Delivery / urgency snapshot
    requestedDeliveryDate: o.requestedDeliveryDate,
    urgencyTier: o.urgencyTier || 'standard',
    rushFeeAmount: o.rushFeeAmount || 0,
    leadTimeDays: o.leadTimeDays || 0,
    productionPriority: o.productionPriority,
    productionStage: o.productionStage,
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
        requestedDeliveryDate: 1,
        urgencyTier: 1,
        rushFeeAmount: 1,
        leadTimeDays: 1,
        productionPriority: 1,
        productionStage: 1,
        couponCode: 1,
        discountAmount: 1,
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
    const {
      items,
      shippingAddress,
      contactPhone,
      notes,
      paymentMethod,
      paymentDetails,
      couponCode,
      requestedDeliveryDate, // ISO date string from the customer
      deliveryMethod,        // 'delivery' | 'pickup' (panel revision #11)
    } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Items are required' });
    }
    if (!shippingAddress || !String(shippingAddress).trim()) {
      return res.status(400).json({ message: 'Shipping address is required' });
    }

    const skus = items.map((it) => it.sku);
    const inventoryDocs = await Inventory.find({ sku: { $in: skus }, isActive: true });
    const inventoryBySku = new Map(inventoryDocs.map((inv) => [inv.sku, inv]));

    // Pre-flight: validate SKUs exist + quantities are positive
    for (const it of items) {
      if (!it?.sku) return res.status(400).json({ message: 'Item SKU is required' });
      const qty = Number(it.quantity);
      if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ message: 'Invalid quantity' });
      const inv = inventoryBySku.get(it.sku);
      if (!inv) return res.status(400).json({ message: `Invalid SKU: ${it.sku}` });
    }

    // Atomic AVAILABLE stock check (stock - reservedStock >= needed). Two
    // shoppers trying to grab the last unit of the same SKU now race-safely
    // resolve via the conditional $inc in reserveStockForOrder.
    const stockCheck = await validateOrderStock(items);
    if (!stockCheck.ok) {
      return res.status(400).json({
        message: 'Insufficient stock for one or more items',
        errors: stockCheck.errors,
      });
    }

    const totalQty = items.reduce((sum, it) => sum + Number(it.quantity), 0);
    const isBulk = totalQty >= BULK_THRESHOLD;

    let subtotalBeforeDiscount = 0;
    const orderItems = [];
    for (const it of items) {
      const qty = Number(it.quantity);
      const inv = inventoryBySku.get(it.sku);
      subtotalBeforeDiscount += qty * inv.price;

      // ─── Offload large design previews to Cloudinary ──────────────────
      // In production, base64 previews bloat MongoDB; we upload and replace
      // the data URL with a CDN URL. In dev (Cloudinary not configured),
      // uploadImage returns the input unchanged so the snapshot still
      // works for local testing.
      let customization = it.customization || {};
      if (
        customization.previewImage &&
        typeof customization.previewImage === 'string' &&
        customization.previewImage.startsWith('data:')
      ) {
        try {
          const url = await uploadImage(customization.previewImage, {
            folder: 'designs/orders',
            tags: [inv.sku, 'design-preview'],
          });
          customization = { ...customization, previewImage: url };
        } catch (err) {
          console.warn('Design preview upload failed (keeping base64):', err.message);
        }
      }

      orderItems.push({
        sku: inv.sku,
        name: inv.name,
        quantity: qty,
        unitPrice: inv.price,
        customization,
      });
    }

    // ─── Apply coupon (if any) ──────────────────────────────────────────
    // Validate the customer-supplied code against the full eligibility
    // matrix BEFORE we save the order. Discount is computed pure-functionally
    // and frozen into the order — even if the coupon is later edited, this
    // order's discount won't change.
    // ─── Classify urgency from requested delivery date ──────────────────
    // Done BEFORE discount logic so the rush fee gets included in the
    // pre-discount subtotal — coupons then discount the *combined* total,
    // which matches what the customer sees in the checkout preview.
    let urgencySnapshot = {
      tier: 'standard',
      leadTimeDays: 0,
      rushFee: 0,
      productionPriority: 'medium',
      requestedDeliveryDate: null,
    };
    if (requestedDeliveryDate) {
      const cls = classifyUrgency(requestedDeliveryDate);
      if (!cls.ok) {
        return res.status(400).json({
          message: `Delivery date error: ${cls.reason}`,
          deliveryDateError: true,
        });
      }
      // Soft capacity guard — race-checked again right before save below.
      const cap = await checkCapacity(cls.tier, requestedDeliveryDate);
      if (!cap.ok) {
        return res.status(409).json({
          message: cap.reason,
          deliveryDateError: true,
          tierSaturated: true,
        });
      }
      const rushFee = calculateRushFee(subtotalBeforeDiscount, cls.tier);
      urgencySnapshot = {
        tier: cls.tier,
        leadTimeDays: cls.leadTimeDays,
        rushFee,
        productionPriority: cls.productionPriority,
        requestedDeliveryDate: new Date(requestedDeliveryDate),
      };
      // Fold the rush fee into the subtotal so coupon math sees the right base.
      subtotalBeforeDiscount += rushFee;
    }

    let totalPrice = subtotalBeforeDiscount;
    let appliedCoupon = null;
    let discountAmount = 0;
    if (couponCode && String(couponCode).trim()) {
      const cv = await validateCoupon({
        code: couponCode,
        cartItems: orderItems,
        customerId: req.user.userId,
      });
      if (!cv.valid) {
        return res.status(400).json({
          message: `Coupon error: ${cv.reason}`,
          couponError: cv.code,
        });
      }
      appliedCoupon = cv.coupon;
      discountAmount = cv.discount.amount || 0;
      totalPrice = Math.max(0, subtotalBeforeDiscount - discountAmount);
    }

    const order = new Order({
      customer: req.user.userId,
      items: orderItems,
      totalQty,
      totalPrice,
      subtotalBeforeDiscount,
      isBulk,
      shippingAddress: String(shippingAddress).trim(),
      contactPhone: contactPhone ? String(contactPhone).trim() : undefined,
      notes: notes ? String(notes).trim() : undefined,
      paymentMethod: paymentMethod || 'cod',
      status: 'pending',
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'awaiting_payment', // Mark as awaiting for e-wallet payments
      requiredPayment: isBulk ? totalPrice * BULK_PAYMENT_RATIO : totalPrice,
      paidAmount: 0, // Will be updated after successful payment
      // Coupon snapshot — frozen at placement so future coupon edits don't
      // retroactively change this order's discount.
      couponCode: appliedCoupon?.code || '',
      couponName: appliedCoupon?.name || '',
      couponType: appliedCoupon?.type || '',
      discountAmount,
      // Urgency snapshot — frozen at placement. productionPriority drives
      // the admin queue sort order automatically via existing indexes.
      requestedDeliveryDate: urgencySnapshot.requestedDeliveryDate,
      urgencyTier: urgencySnapshot.tier,
      rushFeeAmount: urgencySnapshot.rushFee,
      leadTimeDays: urgencySnapshot.leadTimeDays,
      productionPriority: urgencySnapshot.productionPriority,
      // Pickup vs delivery (panel revision #11) — drives the post-Ready pipeline.
      deliveryMethod: deliveryMethod === 'pickup' ? 'pickup' : 'delivery',
      paymentDetails: {
        ...paymentDetails,
        ewalletPhone: paymentDetails?.phoneNumber // Store e-wallet phone for verification
      }
    });

    console.log('Order object before save:', JSON.stringify(order, null, 2));
    await order.save();
    console.log('Order saved successfully');

    // Mark any active abandoned-cart row as recovered so the sweeper stops
    // emailing the customer about a cart they just converted. Non-fatal.
    try {
      await markRecovered(req.user.userId, order._id);
    } catch (err) {
      console.warn('markRecovered failed (non-fatal):', err.message);
    }

    // ─── Redeem the coupon AFTER the order is saved ────────────────────
    // Race-safe atomic increment of usedCount. If the global limit was just
    // claimed by another customer between our validate() and this redeem(),
    // we get GLOBAL_LIMIT back — roll back the whole order so we don't
    // discount without consuming a slot.
    if (appliedCoupon) {
      try {
        await redeemCoupon({
          coupon: appliedCoupon,
          order,
          customer: req.user.userId,
          discountAmount,
          subtotal: subtotalBeforeDiscount,
        });
      } catch (err) {
        // Roll back — release stock reservation too
        console.error('Coupon redeem failed, rolling back order:', err.message);
        await Order.findByIdAndDelete(order._id);
        return res.status(409).json({
          message: err.code === 'GLOBAL_LIMIT'
            ? 'This coupon just reached its limit — please remove it and retry'
            : 'Could not apply coupon — please retry',
          couponError: err.code || 'REDEEM_FAILED',
        });
      }
    }

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

    // Rush-order admin alert (panel revision #7). Fired whenever urgency tier
    // is rush or priority so the manager sees a high-priority notification
    // immediately — not buried in the standard new-order list.
    if (['rush', 'priority'].includes(urgencySnapshot.tier)) {
      try {
        const { default: Notification } = await import('../models/Notification.js');
        await Notification.create({
          type: 'rush_order',
          title: `⚡ Rush order placed (#${String(order._id).slice(-6)})`,
          message: `${totalQty} item(s) — lead time ${urgencySnapshot.leadTimeDays} day(s). Rush fee ₱${urgencySnapshot.rushFee}.`,
          target: 'admin',
          relatedData: { orderId: String(order._id), amount: order.totalPrice, status: urgencySnapshot.tier },
          priority: 'urgent',
        });
      } catch (e) { /* non-fatal */ }
    }

    // Trigger real-time admin notification via Socket.io
    try {
      const io = req.app.get('io');
      if (io) {
        // Emit new order event to all connected admin clients
        io.emit('order:new', {
          id: order._id,
          orderNumber: order.orderNumber || `CM-${order._id.toString().slice(-8)}`,
          totalAmount: order.totalPrice,
          items: order.items,
          customerName: req.user.name,
          customerEmail: req.user.email,
          createdAt: order.createdAt,
          paymentMethod: order.paymentMethod,
          isBulk: order.isBulk
        });
        console.log('Real-time order notification sent via Socket.io');
      }
    } catch (socketErr) {
      console.error('Socket.io notification error (non-fatal):', socketErr.message);
    }

    // RESERVE stock for ALL orders (COD + e-wallet). Stock is not actually
    // deducted until payment is confirmed (e-wallet webhook) or the order is
    // marked shipped (admin status change). Until then, reserved stock just
    // prevents other shoppers from claiming the same units.
    //
    // Writes a StockMovement of type 'reservation' so the inventory page
    // shows the activity. Race-safe via the conditional $inc inside.
    const reservation = await reserveStockForOrder({
      order,
      actor: { userId: req.user.userId, name: req.user.name, role: req.user.role },
    });
    if (reservation.failed.length > 0) {
      // Extremely rare — someone else grabbed the last units between our
      // validateOrderStock() check and the reserve call. Roll back the
      // order so we don't sell phantom stock.
      await Order.findByIdAndDelete(order._id);
      return res.status(409).json({
        message: 'Stock was claimed by another order just now. Please retry.',
        skus: reservation.failed,
      });
    }
    console.log(`Reserved stock for ${reservation.reserved} items on order ${order._id}`);
    // Write order audit log for the create event so timeline starts cleanly
    await OrderAuditLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'created',
      to: order.status,
      note: `${order.totalQty} units / ${paymentMethod}`,
      performedBy: req.user.userId,
      performedByName: req.user.name || '',
      performedByRole: req.user.role || '',
    }).catch(() => {});

    // Kick off the chat thread with a welcoming system message so the
    // customer can see the chat is live and ready for questions.
    try {
      const { postSystemMessage } = await import('./chat.js');
      await postSystemMessage({
        orderId: order._id,
        body: `Welcome! Your order #${String(order._id).slice(-6)} has been received. You can message us here any time about this order — production updates will also appear in this thread automatically.`,
        meta: { status: 'pending' },
      });
    } catch { /* non-fatal */ }

    // Fire customer confirmation email — best-effort, never blocks the
    // order from being placed. The mail helper logs but doesn't throw.
    sendOrderPlaced({
      user: await User.findById(req.user.userId).select('name email').lean(),
      order,
    }).catch((err) => console.error('Order-placed email failed:', err?.message));

    const user = await User.findById(req.user.userId);
    if (user && isBulk) {
      try {
        // Port 587 + STARTTLS — Render free tier blocks 465.
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: Number(process.env.SMTP_PORT) || 587,
          secure: false,
          requireTLS: true,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          socketTimeout: 15000,
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

/**
 * Customer self-cancel (panel revision #10).
 *
 * The customer can cancel their own order, but only BEFORE production starts.
 * Once status hits in_production, ready, out_for_delivery, for_pickup, etc.
 * the cancel button is disabled in the UI and this route returns 409. A
 * reason is required so the admin sees why.
 */
router.post('/:id/customer-cancel', authMiddleware, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      return res.status(400).json({ message: 'A reason is required to cancel.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'Not your order' });
    }

    const { CUSTOMER_CANCEL_LOCKED_STATUSES } = await import('../models/Order.js');
    if (CUSTOMER_CANCEL_LOCKED_STATUSES.includes(order.status)) {
      return res.status(409).json({
        message: 'This order can no longer be cancelled because production has already started. Please contact support if you need help.',
        locked: true,
      });
    }

    // Loophole guard #4: a fully-paid order can't be self-cancelled — that
    // would leave money in our pocket with no refund flag. Customer must
    // contact support so admin can issue the refund through the right
    // channel (PayMongo, manual etc.) and update the order accordingly.
    if (order.paymentStatus === 'paid' || (order.paidAmount && order.paidAmount > 0)) {
      return res.status(409).json({
        message: 'This order has already been paid. Please message the store to request a refund — we\'ll cancel and refund it together.',
        paidLocked: true,
      });
    }

    const previousStatus = order.status;
    const actor = await actorSnapshot(req);

    await restoreInventoryFor(order, { userId: req.user.userId, name: req.user.name, role: 'customer' }, 'Customer self-cancel');
    if (order.inventoryConsumed) {
      order.inventoryConsumed = false;
      order.inventoryConsumedAt = null;
    }
    if (order.couponCode) {
      await releaseCouponForOrder({ order, reason: 'Customer cancelled' }).catch(() => {});
    }

    order.status = 'cancelled';
    order.cancellationReason = cleanReason;
    order.cancelledAt = new Date();
    order.cancelledBy = req.user.userId;
    await order.save();

    await OrderAuditLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'cancelled',
      from: previousStatus,
      to: 'cancelled',
      reason: cleanReason,
      note: 'Customer self-cancel',
      ...actor,
    }).catch(() => {});

    // Loophole guard #5: notify admin so the manager sees the bell + can
    // verify inventory was released. Plus mirror the customer notification
    // path so the customer's own bell shows the cancellation event.
    try {
      const { default: Notification } = await import('../models/Notification.js');
      await Notification.create({
        type: 'order_cancelled',
        title: 'Customer cancelled an order',
        message: `Order #${String(order._id).slice(-6)} — reason: ${cleanReason.slice(0, 180)}`,
        target: 'admin',
        relatedData: { orderId: String(order._id), status: 'cancelled', amount: order.totalPrice },
        priority: 'high',
      });
    } catch { /* non-fatal */ }
    await notifyCustomerOfStatus(order, 'cancelled', cleanReason);

    res.json(toOrderDto(order));
  } catch (err) {
    console.error('Customer-cancel error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update order status (admin only)
router.put('/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, reason, note } = req.body;
    const allowed = [
      'pending', 'approved', 'in_production', 'ready',
      'out_for_delivery', 'for_pickup', 'completed',
      'shipped', 'delivered', 'rejected', 'cancelled',
    ];
    if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    // Panel revision #12: a reason MUST be provided when rejecting or
    // cancelling. We store it on rejectionReason/cancellationReason so the
    // customer can see exactly why in their order history + notification.
    if ((status === 'rejected' || status === 'cancelled')) {
      const cleanReason = (reason || '').trim();
      if (!cleanReason) {
        return res.status(400).json({
          message: `A reason is required when ${status === 'rejected' ? 'rejecting' : 'cancelling'} an order.`,
        });
      }
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Loophole guard #1: enforce delivery-method ↔ post-Ready status pairing.
    // A pickup-method order must NOT be flipped to out_for_delivery, and a
    // delivery-method order must NOT be flipped to for_pickup. Either is a
    // human mistake but would leave the customer waiting for the wrong thing.
    if (status === 'out_for_delivery' && order.deliveryMethod === 'pickup') {
      return res.status(400).json({
        message: 'This is a pickup order — use "Ready for pickup" instead of "Out for delivery".',
      });
    }
    if (status === 'for_pickup' && order.deliveryMethod === 'delivery') {
      return res.status(400).json({
        message: 'This is a delivery order — use "Out for delivery" instead of "Ready for pickup".',
      });
    }

    const previousStatus = order.status;
    if (previousStatus === status) {
      return res.json(toOrderDto(order));
    }

    const actor = await actorSnapshot(req);

    // Inventory side-effects on status transitions:
    //   pending → approved: CONSUME stock (deduct real on-hand, log a 'sale'
    //                       movement). Approval is the commitment point —
    //                       admin has accepted the order so stock should
    //                       reflect that immediately, not wait for shipping.
    //   approved → in_production/ready/shipped/delivered: no-op if already
    //                       consumed at approval; otherwise consume now.
    //   any → cancelled/rejected: restore (release reservation OR reverse the
    //                       sale if it was already consumed) + release coupon.
    //   shipped/delivered → returned/cancelled: restock as customer return.
    const consumeStatuses = ['approved', 'in_production', 'ready', 'shipped', 'delivered', 'completed'];
    if ((status === 'rejected' || status === 'cancelled') &&
        previousStatus !== 'rejected' && previousStatus !== 'cancelled') {
      await restoreInventoryFor(order, { userId: req.user.userId, name: actor.performedByName, role: req.user.role }, `Status ${previousStatus} → ${status}`);
      // If stock was already consumed, the restoreInventoryFor path needs
      // to know — flip the flag back so future activity is consistent.
      if (order.inventoryConsumed) {
        order.inventoryConsumed = false;
        order.inventoryConsumedAt = null;
      }
      if (order.couponCode) {
        await releaseCouponForOrder({ order, reason: `Order ${status}` }).catch((err) =>
          console.error('Coupon release failed:', err.message)
        );
      }
    } else if (consumeStatuses.includes(status) && !order.inventoryConsumed) {
      // First time we cross into the committed-fulfilment zone — convert
      // reservation into real stock deduction and log a 'sale' movement per
      // SKU. Marking the order means subsequent transitions skip this step.
      await consumeReservedForOrder({
        order,
        actor: { userId: req.user.userId, name: actor.performedByName, role: req.user.role },
        reason: `Order ${status} (#${String(order._id).slice(-6)})`,
      });
      order.inventoryConsumed = true;
      order.inventoryConsumedAt = new Date();
    }

    // ─── Auto-assign on approval ──────────────────────────────────────
    // If the system has auto-assign enabled and an order is transitioning
    // into approved/in_production WITHOUT an existing assignee, pick the
    // production_staff user with the lowest current load. Falls back
    // silently when no staff exists — admin can still assign manually.
    if ((status === 'approved' || status === 'in_production') && !order.assignedTo) {
      try {
        const { default: SystemConfig } = await import('../models/SystemConfig.js');
        const cfg = await SystemConfig.getOrCreate();
        if (cfg.autoAssignEnabled) {
          const candidates = await User.find({ role: 'production_staff', status: 'active' })
            .select('_id name')
            .lean();
          if (candidates.length > 0) {
            // Count active+queued tasks per candidate
            const ids = candidates.map((c) => c._id);
            const Order = (await import('../models/Order.js')).default;
            const loadAgg = await Order.aggregate([
              {
                $match: {
                  assignedTo: { $in: ids },
                  status: { $in: ['approved', 'in_production'] },
                  blockerStatus: { $ne: 'active' },
                },
              },
              { $group: { _id: '$assignedTo', n: { $sum: 1 } } },
            ]);
            const loadMap = Object.fromEntries(loadAgg.map((r) => [String(r._id), r.n]));
            // Pick lowest load; tie-break alphabetically by name for determinism
            const ranked = [...candidates].sort((a, b) => {
              const la = loadMap[String(a._id)] || 0;
              const lb = loadMap[String(b._id)] || 0;
              if (la !== lb) return la - lb;
              return (a.name || '').localeCompare(b.name || '');
            });
            order.assignedTo = ranked[0]._id;
            // Audit row so admin can see this was algorithmic, not manual
            try {
              const ProductionLog = (await import('../models/ProductionLog.js')).default;
              await ProductionLog.create({
                order: order._id,
                orderRef: String(order._id).slice(-6),
                type: 'assigned',
                to: ranked[0]._id,
                note: `Auto-assigned to ${ranked[0].name} (lowest load)`,
                performedBy: req.user.userId,
                performedByName: actor.performedByName,
                performedByRole: req.user.role,
              });
            } catch {/* non-fatal */}
          }
        }
      } catch (err) {
        console.warn('Auto-assign skipped:', err.message);
      }
    }

    order.status = status;
    // Persist the structured reason fields (panel revision #12) so the
    // customer's order history shows exactly why.
    if (status === 'rejected') {
      order.rejectionReason = (reason || '').trim();
    }
    if (status === 'cancelled') {
      order.cancellationReason = (reason || '').trim();
      order.cancelledAt = new Date();
      order.cancelledBy = req.user.userId;
    }
    if (status === 'completed') {
      order.completedAt = new Date();
    }
    await order.save();

    await OrderAuditLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: status === 'cancelled' ? 'cancelled' : 'status_changed',
      from: previousStatus,
      to: status,
      reason: reason || '',
      note: note || '',
      ...actor,
    }).catch((err) => console.error('Audit log write failed:', err.message));

    // Customer-facing structured notification — one helper covers every
    // status transition so the bell + email stays consistent regardless of
    // which route flipped the status.
    await notifyCustomerOfStatus(order, status, reason);

    // Customer-facing status-change email — best-effort, non-blocking
    User.findById(order.customer).select('name email').lean()
      .then((customer) => sendOrderStatusUpdate({ user: customer, order, from: previousStatus, to: status }))
      .catch((err) => console.error('Status email failed:', err?.message));

    // Mobile push notification — fire-and-forget, never blocks the response
    const pushContent = getPushContentForStatus(status);
    if (pushContent) {
      const customerId = order.customer?._id ?? order.customer;
      sendPushToUser(customerId, {
        ...pushContent,
        data: { orderId: String(order._id), screen: 'OrderDetails' },
      });
    }
    
    // Populate customer for downstream socket emit (no notification here —
    // notifyCustomerOfStatus above already handled the bell + chat + email.
    // Calling notifyOrderStatusUpdate too created DUPLICATE notifications,
    // verified live via auditPipeline.js: customer was getting two bell rings
    // per transition ("Order approved" + "Order APPROVED"). Removed.)
    await order.populate('customer');
    
    res.json(toOrderDto(order));
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/orders/stats/summary  (admin)
 *
 * Top-line KPI tiles for the orders dashboard. Computed in one aggregation
 * pipeline to keep the dashboard snappy.
 */
router.get('/stats/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setUTCHours(23, 59, 59, 999);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [todayCount, todayRevenueAgg, pendingCount, awaitingPaymentCount, refundedAgg, byStatus, byPayment] =
      await Promise.all([
        Order.countDocuments({ createdAt: { $gte: startOfToday, $lte: endOfToday } }),
        Order.aggregate([
          { $match: { createdAt: { $gte: startOfToday, $lte: endOfToday }, paymentStatus: 'paid' } },
          { $group: { _id: null, total: { $sum: '$totalPrice' } } },
        ]),
        Order.countDocuments({ status: 'pending' }),
        Order.countDocuments({ paymentStatus: { $in: ['awaiting_payment', 'partial'] } }),
        Order.aggregate([
          { $match: { refundedAt: { $gte: sevenDaysAgo } } },
          { $group: { _id: null, total: { $sum: '$refundedAmount' }, count: { $sum: 1 } } },
        ]),
        Order.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        Order.aggregate([
          { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
        ]),
      ]);

    res.json({
      todayCount,
      todayRevenue: todayRevenueAgg[0]?.total || 0,
      pendingCount,
      awaitingPaymentCount,
      refunded7d: {
        amount: refundedAgg[0]?.total || 0,
        count: refundedAgg[0]?.count || 0,
      },
      byStatus,
      byPayment,
    });
  } catch (err) {
    console.error('Order stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/orders/bulk-status  (admin)
 * Body: { orderIds: [], status, reason? }
 *
 * Applies a status change to many orders in one call. Each order writes its
 * own audit row (typed as `bulk_action` so admins can filter for them).
 * Inventory restore runs per-order so the side-effects stay correct.
 */
router.post('/bulk-status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { orderIds, status, reason } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'orderIds array required' });
    }
    // Loophole guard: bulk allow-list must match the single-PUT allow-list so
    // the new post-Ready statuses can also be applied in bulk.
    const allowed = [
      'approved', 'in_production', 'ready',
      'out_for_delivery', 'for_pickup', 'completed',
      'shipped', 'delivered', 'cancelled', 'rejected',
    ];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status for bulk action' });
    }
    // Reason still required for reject/cancel even in bulk.
    if ((status === 'rejected' || status === 'cancelled') && !(reason && String(reason).trim())) {
      return res.status(400).json({
        message: `A reason is required when ${status === 'rejected' ? 'rejecting' : 'cancelling'} orders.`,
      });
    }

    const actor = await actorSnapshot(req);
    const results = [];
    for (const id of orderIds) {
      try {
        const order = await Order.findById(id);
        if (!order) {
          results.push({ id, ok: false, error: 'not found' });
          continue;
        }
        const prev = order.status;
        if (prev === status) {
          results.push({ id, ok: true, skipped: true });
          continue;
        }

        // Loophole guard #1 in bulk: skip mismatched delivery-method targets.
        if (status === 'out_for_delivery' && order.deliveryMethod === 'pickup') {
          results.push({ id, ok: false, error: 'pickup-method order cannot go out_for_delivery' });
          continue;
        }
        if (status === 'for_pickup' && order.deliveryMethod === 'delivery') {
          results.push({ id, ok: false, error: 'delivery-method order cannot go for_pickup' });
          continue;
        }

        const bulkConsumeStatuses = [
          'approved', 'in_production', 'ready',
          'out_for_delivery', 'for_pickup', 'completed',
          'shipped', 'delivered',
        ];
        if ((status === 'rejected' || status === 'cancelled') &&
            prev !== 'rejected' && prev !== 'cancelled') {
          await restoreInventoryFor(order);
          if (order.inventoryConsumed) {
            order.inventoryConsumed = false;
            order.inventoryConsumedAt = null;
          }
          if (order.couponCode) {
            await releaseCouponForOrder({ order, reason: `Bulk ${status}` }).catch(() => {});
          }
        } else if (bulkConsumeStatuses.includes(status) && !order.inventoryConsumed) {
          await consumeReservedForOrder({
            order,
            actor: { userId: req.user.userId, name: actor.performedByName, role: req.user.role },
            reason: `Bulk ${status} (#${String(order._id).slice(-6)})`,
          });
          order.inventoryConsumed = true;
          order.inventoryConsumedAt = new Date();
        }

        order.status = status;
        // Persist structured reason fields so the customer-facing timeline
        // shows the exact same info as the single PUT path.
        if (status === 'rejected') order.rejectionReason = String(reason || '').trim();
        if (status === 'cancelled') {
          order.cancellationReason = String(reason || '').trim();
          order.cancelledAt = new Date();
          order.cancelledBy = req.user.userId;
        }
        if (status === 'completed') order.completedAt = new Date();
        await order.save();

        await OrderAuditLog.create({
          order: order._id,
          orderRef: String(order._id).slice(-6),
          type: 'bulk_action',
          from: prev,
          to: status,
          reason: reason || '',
          ...actor,
        }).catch(() => {});

        // Fire the same customer notification the single-PUT path fires —
        // closes the loophole where bulk operations went silent.
        await notifyCustomerOfStatus(order, status, reason);

        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err.message });
      }
    }
    res.json({
      results,
      updated: results.filter((r) => r.ok && !r.skipped).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => !r.ok).length,
    });
  } catch (err) {
    console.error('Bulk status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/orders/:id/refund  (admin)
 * Body: { amount, reason, note? }
 *
 * Marks an order as (partially or fully) refunded. We do NOT actually call
 * PayMongo — refunds via gateway need separate API + webhook handling. This
 * endpoint records the admin's intent + amount so reports + customer-facing
 * status reflect it. Operator must reconcile with PayMongo separately.
 */
router.post('/:id/refund', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { amount, reason, note } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'Refund reason is required' });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: 'amount must be a positive number' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const alreadyRefunded = order.refundedAmount || 0;
    const refundable = (order.paidAmount || order.totalPrice || 0) - alreadyRefunded;
    if (amt > refundable + 0.01) {
      return res.status(400).json({
        message: `Cannot refund ₱${amt} — only ₱${refundable.toFixed(2)} is refundable`,
      });
    }

    order.refundedAmount = alreadyRefunded + amt;
    order.refundedAt = new Date();
    order.refundReason = String(reason).trim();
    // Full refund flips the status. Partial keeps it.
    const isFullRefund = order.refundedAmount >= (order.paidAmount || order.totalPrice || 0) - 0.01;
    const previousStatus = order.status;
    if (isFullRefund) {
      order.status = 'refunded';
      // Return stock + release coupon for full refunds
      if (previousStatus !== 'cancelled' && previousStatus !== 'rejected') {
        await restoreInventoryFor(order);
      }
      if (order.couponCode) {
        await releaseCouponForOrder({ order, reason: 'Order refunded' }).catch((err) =>
          console.error('Coupon release failed:', err.message)
        );
      }
    }
    await order.save();

    const actor = await actorSnapshot(req);
    await OrderAuditLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'refunded',
      from: previousStatus,
      to: order.status,
      amount: amt,
      reason: String(reason).trim(),
      note: note || '',
      ...actor,
    });

    // Notify the customer their refund was processed
    User.findById(order.customer).select('name email').lean()
      .then((customer) => sendRefundIssued({ user: customer, order, amount: amt, reason: String(reason).trim() }))
      .catch((err) => console.error('Refund email failed:', err?.message));

    res.json(toOrderDto(order));
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/orders/:id/note  (admin)
 * Body: { note }
 * Adds an internal admin note to the audit timeline.
 */
router.post('/:id/note', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ message: 'note is required' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const actor = await actorSnapshot(req);
    const log = await OrderAuditLog.create({
      order: order._id,
      orderRef: String(order._id).slice(-6),
      type: 'note',
      note: String(note).trim(),
      ...actor,
    });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/orders/:id/history  (admin)
 * Full audit trail for one order, newest first.
 */
router.get('/:id/history', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const logs = await OrderAuditLog.find({ order: req.params.id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Customer-safe timeline of an order. The full audit log includes internal
 * actors and notes that aren't appropriate for the customer to see. This
 * endpoint returns a curated, plain-English event list:
 *
 *   - Order received
 *   - Approved by the store
 *   - Production started → finished (with stage transitions)
 *   - Quality check passed
 *   - Out for delivery / Ready for pickup
 *   - Completed
 *   - Cancelled / Rejected (with the customer-facing reason)
 *
 * Available to: the order's owner (always) and admin/staff (for support).
 */
router.get('/:id/timeline', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).select('customer');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const ownsOrder = String(order.customer) === String(req.user.userId);
    const isStaff = req.user.role === 'admin' || req.user.role === 'production_staff';
    if (!ownsOrder && !isStaff) {
      return res.status(403).json({ message: 'Not your order' });
    }

    const logs = await OrderAuditLog.find({ order: req.params.id })
      .sort({ createdAt: 1 })
      .lean();

    // Translate raw audit entries into customer-friendly events. Anything
    // we don't have a translation for is dropped so the customer doesn't
    // see internal jargon.
    const translate = (l) => {
      const at = l.createdAt;
      // Admin who performed the action — we only expose the role label
      // to the customer, never names ("Store team", "Production team").
      const actorLabel = l.performedByRole === 'production_staff' ? 'Production team' : 'Store team';

      if (l.type === 'created') {
        return { at, icon: 'receipt', title: 'Order received', body: 'We received your order and will review it shortly.' };
      }
      if (l.type === 'cancelled') {
        return {
          at,
          icon: 'x',
          title: l.performedByRole === 'customer' ? 'You cancelled this order' : 'Order cancelled',
          body: l.reason ? `Reason: ${l.reason}` : '',
        };
      }
      if (l.type === 'status_changed' || l.type === 'bulk_action') {
        const t = l.to;
        const customerVisible = {
          approved: { title: 'Order approved', body: `${actorLabel} approved your order — it's queued for production.` },
          in_production: { title: 'In production', body: 'Production has started. We\'ll mark it ready as soon as it passes quality check.' },
          ready: { title: 'Production finished', body: 'Your order passed QC. Preparing for ' + (l._noteForCustomer || 'delivery/pickup') + '.' },
          out_for_delivery: { title: 'Out for delivery', body: 'Your order is on its way to you.' },
          for_pickup: { title: 'Ready for pickup', body: 'Your order is ready at the store.' },
          completed: { title: 'Order completed', body: 'Thank you for choosing CustoMate! You can leave a review for each item.' },
          shipped: { title: 'Shipped', body: 'Your order has been shipped.' },
          delivered: { title: 'Delivered', body: 'Your order has been delivered.' },
          rejected: { title: 'Order rejected', body: l.reason ? `Reason: ${l.reason}` : '' },
          refunded: { title: 'Refunded', body: l.reason ? `Reason: ${l.reason}` : '' },
        };
        const m = customerVisible[t];
        if (!m) return null;
        return { at, icon: 'check', title: m.title, body: m.body };
      }
      if (l.type === 'refunded') {
        return { at, icon: 'money', title: 'Refund issued', body: l.reason ? `Reason: ${l.reason}` : `Amount: ₱${l.amount || 0}` };
      }
      return null;
    };

    const events = logs.map(translate).filter(Boolean);
    res.json(events);
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/orders/export.csv?status=&from=&to=
 * Returns a CSV of orders for the given filter. Streamed as text so big
 * exports don't bloat memory.
 */
router.get('/export/csv', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(String(from));
      if (to) {
        const t = new Date(String(to));
        t.setUTCHours(23, 59, 59, 999);
        filter.createdAt.$lte = t;
      }
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(5000).populate('customer', 'name email');

    const escape = (v) => {
      if (v === undefined || v === null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const header = [
      'Order ID', 'Created', 'Customer Name', 'Customer Email',
      'Items', 'Total Qty', 'Total Price', 'Status',
      'Payment Status', 'Paid Amount', 'Refunded Amount',
      'Is Bulk', 'Shipping Address',
    ].join(',');
    const rows = orders.map((o) => [
      String(o._id).slice(-8),
      new Date(o.createdAt).toISOString(),
      o.customer?.name || '',
      o.customer?.email || '',
      (o.items || []).length,
      o.totalQty || 0,
      o.totalPrice || 0,
      o.status,
      o.paymentStatus,
      o.paidAmount || 0,
      o.refundedAmount || 0,
      o.isBulk ? 'yes' : 'no',
      o.shippingAddress || '',
    ].map(escape).join(','));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Delivery / urgency endpoints ──────────────────────────────────────────

/**
 * Static tier table — used by the frontend to render the tier picker without
 * hard-coding business rules in two places.
 */
router.get('/delivery/tiers', (_req, res) => {
  res.json({
    tiers: URGENCY_TIERS.map((t) => ({
      tier: t.tier,
      label: t.label,
      minLeadDays: t.minLeadDays,
      maxLeadDays: t.maxLeadDays,
      surchargePct: t.surchargePct,
      productionPriority: t.productionPriority,
      softCapPerDay: t.softCapPerDay,
      color: t.color,
      description: t.description,
    })),
  });
});

/**
 * Preview the urgency tier, lead time, rush fee, and capacity for a given
 * delivery date + subtotal. Used by the checkout UI to show live pricing.
 *
 * Auth: customer (so we don't leak capacity info to anonymous scrapers).
 */
router.post('/delivery/quote', authMiddleware, async (req, res) => {
  try {
    const { requestedDeliveryDate, subtotal } = req.body || {};
    if (!requestedDeliveryDate) {
      return res.status(400).json({ ok: false, reason: 'Delivery date is required.' });
    }
    const subNum = Number(subtotal);
    if (!Number.isFinite(subNum) || subNum < 0) {
      return res.status(400).json({ ok: false, reason: 'Invalid subtotal.' });
    }
    const quote = await quoteDelivery({
      requestedDeliveryDate,
      subtotal: subNum,
    });
    res.json(quote);
  } catch (err) {
    console.error('Delivery quote error:', err);
    res.status(500).json({ ok: false, reason: 'Server error' });
  }
});

/**
 * Per-tier capacity for a window of dates — powers the admin calendar's
 * "what's already booked" heatmap and the customer-side date picker's
 * "saturated" marker.
 *
 * Query: ?from=ISO&to=ISO (inclusive, max 90 days span)
 */
router.get('/delivery/availability', authMiddleware, async (req, res) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ message: 'Invalid date range' });
    }
    const spanDays = Math.ceil((to - from) / (24 * 60 * 60 * 1000));
    if (spanDays > 90) {
      return res.status(400).json({ message: 'Date range too large (max 90 days).' });
    }
    const days = [];
    const cur = new Date(from);
    cur.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);
    while (cur <= end) {
      const tiers = await getTierAvailability(new Date(cur));
      days.push({ date: cur.toISOString().slice(0, 10), tiers });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    res.json({ days });
  } catch (err) {
    console.error('Delivery availability error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Admin priority calendar — orders grouped by requestedDeliveryDate,
 * each day's orders sorted by urgency tier desc + lead time asc so the
 * production team sees the most-at-risk orders first.
 *
 * Query: ?from=ISO&to=ISO (defaults: today → today+30d)
 */
router.get('/delivery/calendar', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const from = req.query.from
      ? new Date(String(req.query.from))
      : new Date();
    const to = req.query.to
      ? new Date(String(req.query.to))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ message: 'Invalid date range' });
    }
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);

    // Tier sort weight — higher = more urgent.
    const tierWeight = { priority: 4, rush: 3, express: 2, standard: 1 };

    const orders = await Order.find({
      requestedDeliveryDate: { $gte: from, $lte: to },
      status: { $nin: ['cancelled', 'rejected'] },
    })
      .populate('customer', 'name email')
      .sort({ requestedDeliveryDate: 1, createdAt: 1 });

    // Group by day key
    const byDay = new Map();
    for (const o of orders) {
      const key = o.requestedDeliveryDate.toISOString().slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(o);
    }

    const days = [];
    for (const [date, list] of byDay) {
      // Priority sort: urgency desc → due date asc → createdAt asc
      list.sort((a, b) => {
        const wa = tierWeight[a.urgencyTier] || 1;
        const wb = tierWeight[b.urgencyTier] || 1;
        if (wa !== wb) return wb - wa;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      const counts = list.reduce(
        (acc, o) => {
          acc[o.urgencyTier] = (acc[o.urgencyTier] || 0) + 1;
          acc.total++;
          return acc;
        },
        { total: 0 },
      );
      // Highest urgency present that day → used for color coding the cell
      const highestTier = list.reduce((hi, o) => {
        const w = tierWeight[o.urgencyTier] || 1;
        return w > (tierWeight[hi] || 0) ? o.urgencyTier : hi;
      }, 'standard');

      days.push({
        date,
        highestTier,
        counts,
        orders: list.map(toOrderDto),
      });
    }
    // Fill empty days so the frontend can render a clean grid
    const allDays = [];
    const cur = new Date(from);
    cur.setUTCHours(0, 0, 0, 0);
    const endDay = new Date(to);
    endDay.setUTCHours(0, 0, 0, 0);
    while (cur <= endDay) {
      const key = cur.toISOString().slice(0, 10);
      const existing = days.find((d) => d.date === key);
      allDays.push(
        existing || {
          date: key,
          highestTier: null,
          counts: { total: 0 },
          orders: [],
        },
      );
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    res.json({ from: from.toISOString(), to: to.toISOString(), days: allDays });
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Admin priority queue — flat list of active orders sorted by urgency for
 * a "what should I work on next" view. Excludes terminal statuses.
 */
router.get('/queue/priority', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tierWeight = { priority: 4, rush: 3, express: 2, standard: 1 };
    const orders = await Order.find({
      status: { $nin: ['cancelled', 'rejected', 'completed', 'delivered', 'refunded'] },
    })
      .populate('customer', 'name email')
      .lean();

    orders.sort((a, b) => {
      const wa = tierWeight[a.urgencyTier] || 1;
      const wb = tierWeight[b.urgencyTier] || 1;
      if (wa !== wb) return wb - wa;
      // Same tier → ascending requestedDeliveryDate (sooner first)
      const da = a.requestedDeliveryDate ? new Date(a.requestedDeliveryDate).getTime() : Infinity;
      const db = b.requestedDeliveryDate ? new Date(b.requestedDeliveryDate).getTime() : Infinity;
      if (da !== db) return da - db;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    res.json(orders.map((o) => toOrderDto(o)));
  } catch (err) {
    console.error('Priority queue error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
