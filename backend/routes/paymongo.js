import express from 'express';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Inventory from '../models/Inventory.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  createEWalletSource,
  createPaymentLink,
  verifyWebhookSignature,
  PAYMONGO_WEBHOOK_SECRET,
  PAYMONGO_PUBLIC_KEY
} from '../config/paymongo.js';

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Create GCash payment
 * POST /api/paymongo/gcash
 */
router.post('/gcash', authMiddleware, async (req, res) => {
  try {
    const { orderId, billing } = req.body;
    
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Get user email for billing
    const user = await User.findById(req.user.userId);
    const userEmail = user?.email || billing?.email || 'customer@example.com';
    
    // Amount in cents
    const amountInCents = Math.round(order.requiredPayment * 100);
    
    const source = await createEWalletSource({
      type: 'gcash',
      amount: amountInCents,
      successUrl: `${FRONTEND_URL}/payment/success?orderId=${orderId}&method=gcash`,
      cancelUrl: `${FRONTEND_URL}/payment/cancel?orderId=${orderId}`,
      billing: {
        name: billing?.name || user?.name || 'Customer',
        email: userEmail,
        phone: billing?.phone || user?.contactNumber || ''
      }
    });

    // Store source ID with order for webhook verification
    order.paymongoSourceId = source.id;
    await order.save();

    res.json({
      checkoutUrl: source.checkoutUrl,
      sourceId: source.id,
      amount: order.requiredPayment,
      orderId: order._id
    });
  } catch (error) {
    console.error('GCash payment error:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    res.status(500).json({ 
      message: 'Failed to create GCash payment',
      error: error.message 
    });
  }
});

/**
 * Create Maya payment
 * POST /api/paymongo/maya
 * Uses e-wallet source like GCash (type: 'paymaya')
 */
router.post('/maya', authMiddleware, async (req, res) => {
  try {
    const { orderId, billing } = req.body;
    
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Get user email for billing
    const user = await User.findById(req.user.userId);
    const userEmail = user?.email || billing?.email || 'customer@example.com';
    
    const amountInCents = Math.round(order.requiredPayment * 100);
    
    const source = await createEWalletSource({
      type: 'paymaya',
      amount: amountInCents,
      successUrl: `${FRONTEND_URL}/payment/success?orderId=${orderId}&method=maya`,
      cancelUrl: `${FRONTEND_URL}/payment/cancel?orderId=${orderId}`,
      billing: {
        name: billing?.name || user?.name || 'Customer',
        email: userEmail,
        phone: billing?.phone || user?.contactNumber || ''
      }
    });

    // Store source ID with order for webhook verification
    order.paymongoSourceId = source.id;
    await order.save();

    res.json({
      checkoutUrl: source.checkoutUrl,
      sourceId: source.id,
      amount: order.requiredPayment,
      orderId: order._id
    });
  } catch (error) {
    console.error('Maya payment error:', error);
    res.status(500).json({ 
      message: 'Failed to create Maya payment',
      error: error.message 
    });
  }
});

/**
 * Create payment link (supports multiple methods: cards, GrabPay, etc.)
 * POST /api/paymongo/link
 */
router.post('/link', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;
    
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    const amountInCents = Math.round(order.requiredPayment * 100);
    
    const link = await createPaymentLink({
      amount: amountInCents,
      description: `Order #${order._id.toString().slice(-6)} - CustoMate`,
      remarks: `Custom apparel order with ${order.totalQty} items`,
      successUrl: `${FRONTEND_URL}/payment/success?orderId=${orderId}&method=link`,
      cancelUrl: `${FRONTEND_URL}/payment/cancel?orderId=${orderId}`,
      metadata: {
        orderId: order._id.toString(),
        customerId: req.user.userId
      }
    });

    order.paymongoLinkId = link.id;
    await order.save();

    res.json({
      checkoutUrl: link.checkoutUrl,
      linkId: link.id,
      referenceNumber: link.referenceNumber,
      amount: order.requiredPayment,
      orderId: order._id
    });
  } catch (error) {
    console.error('Payment link error:', error);
    res.status(500).json({ 
      message: 'Failed to create payment link',
      error: error.message 
    });
  }
});

/**
 * PayMongo Webhook Handler
 * POST /api/paymongo/webhook
 * This receives payment status updates from PayMongo
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['paymongo-signature'];
    const payload = req.body;

    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature, PAYMONGO_WEBHOOK_SECRET)) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = JSON.parse(payload);
    const { data } = event;
    const eventType = data.type;
    const eventData = data.attributes;

    console.log('PayMongo Webhook received:', eventType);

    // Handle payment success
    if (eventType === 'payment.paid' || eventType === 'source.chargeable') {
      const sourceId = eventData.data?.id;
      const paymentId = eventData.data?.attributes?.payment_intent?.id;
      const amountPaid = eventData.data?.attributes?.amount / 100; // Convert from cents

      // Find order by source or payment ID
      const order = await Order.findOne({
        $or: [
          { paymongoSourceId: sourceId },
          { paymongoPaymentId: paymentId }
        ]
      });

      if (order) {
        // Update order payment status
        order.paidAmount = (order.paidAmount || 0) + amountPaid;
        order.paymongoPaymentId = eventData.data?.id;
        
        if (order.paidAmount >= order.requiredPayment) {
          order.paymentStatus = 'paid';
          order.status = 'paid';
          
          // Deduct inventory for paid e-wallet orders
          for (const item of order.items) {
            const inv = await Inventory.findOne({ sku: item.sku });
            if (inv) {
              inv.stock -= item.quantity;
              inv.reservedStock = Math.max(0, (inv.reservedStock || 0) - item.quantity);
              await inv.save();
              console.log(`Stock deducted for e-wallet payment ${item.sku}: -${item.quantity}, remaining: ${inv.stock}, reserved: ${inv.reservedStock}`);
            }
          }
        } else {
          order.paymentStatus = 'partial';
        }

        order.paymentDetails = {
          ...order.paymentDetails,
          paymongoPaymentId: eventData.data?.id,
          paymongoEvent: eventType,
          paidAt: new Date()
        };

        await order.save();

        // Create payment record
        const payment = new Payment({
          orderId: order._id,
          method: order.paymentMethod,
          amount: amountPaid,
          status: 'completed',
          transactionId: eventData.data?.id,
          paidAt: new Date(),
          paymongoData: eventData
        });
        await payment.save();

        // Send notifications after successful payment
        try {
          const notificationService = req.app.get('notificationService');
          if (notificationService && order.paidAmount >= order.requiredPayment) {
            // Notify customer of payment confirmation
            await notificationService.notifyOrderConfirmation(order, order.customer.toString());
            // Notify admins of paid order
            await notificationService.notifyNewOrder(order);
            console.log('Notifications sent successfully for paid order:', order._id);
          }
        } catch (notifErr) {
          console.error('Webhook notification error (non-fatal):', notifErr.message);
        }

        console.log('Payment confirmed for order:', order._id);
      }
    }

    // Handle payment failure
    if (eventType === 'payment.failed' || eventType === 'source.failed') {
      console.log('Payment failed event:', eventData);
      // Could notify customer or admin here
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

/**
 * Get PayMongo public key (for client-side use)
 * GET /api/paymongo/config
 */
router.get('/config', (req, res) => {
  res.json({
    publicKey: PAYMONGO_PUBLIC_KEY,
    methods: ['gcash', 'maya', 'card', 'grabpay']
  });
});

/**
 * Check payment status
 * GET /api/paymongo/status/:orderId
 */
router.get('/status/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      orderId: order._id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paidAmount: order.paidAmount,
      requiredPayment: order.requiredPayment,
      paymongoSourceId: order.paymongoSourceId,
      paymongoPaymentId: order.paymongoPaymentId
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
