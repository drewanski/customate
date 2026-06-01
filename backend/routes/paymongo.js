import express from 'express';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Inventory from '../models/Inventory.js';
import User from '../models/User.js';
import OrderAuditLog from '../models/OrderAuditLog.js';
import { consumeReservedForOrder } from '../services/inventory.js';
import { sendPaymentConfirmed } from '../services/customerMail.js';
import { authMiddleware } from '../middleware/auth.js';
import {
  createEWalletSource,
  createPaymentLink,
  verifyWebhookSignature,
  retrieveSource,
  createPaymentFromSource,
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
/**
 * Quotation-flow one-click payment.
 * POST /api/paymongo/link/quotation
 * Body: { orderId, type: 'downpayment' | 'balance' }
 *
 * Creates a PayMongo Link for the EXACT amount the customer owes for the
 * chosen stage. Returns checkoutUrl — frontend opens it in a new tab and
 * the customer pays via GCash / Maya / card from a single page.
 *
 * Once PayMongo confirms, the webhook handler (below) auto-stamps
 * payments[type].verifiedAt so admin doesn't have to manually verify a
 * payment that PayMongo already confirmed.
 */
router.post('/link/quotation', authMiddleware, async (req, res) => {
  try {
    const { orderId, type } = req.body;
    if (!['downpayment', 'balance'].includes(type)) {
      return res.status(400).json({ message: 'type must be "downpayment" or "balance"' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (order.workflowVersion !== 'quotation') {
      return res.status(400).json({ message: 'Only quotation orders use this endpoint' });
    }

    // Gate by status — match the proof-upload flow's rules.
    if (type === 'downpayment' && order.status !== 'accepted') {
      return res.status(400).json({ message: 'Downpayment only payable once you have accepted the quote' });
    }
    if (type === 'balance' && order.status !== 'ready') {
      return res.status(400).json({ message: 'Balance only payable when the order is Ready' });
    }

    const amount = Number(order.payments?.[type]?.amount) || 0;
    if (amount <= 0) {
      return res.status(400).json({ message: `${type} amount is not set on this order` });
    }
    const amountInCents = Math.round(amount * 100);

    const link = await createPaymentLink({
      amount: amountInCents,
      description: `Order #${order._id.toString().slice(-6).toUpperCase()} · ${type === 'downpayment' ? '50% Downpayment' : 'Balance Payment'}`,
      remarks: `CustoMate · ${order.totalQty} item(s)`,
      // Bring the customer back to the order page after PayMongo finishes.
      // ?paid=<type> tells the page to refresh + show the "received" toast.
      successUrl: `${FRONTEND_URL}/order-tracking/${orderId}?tab=messages&paid=${type}`,
      cancelUrl:  `${FRONTEND_URL}/order-tracking/${orderId}?tab=messages&payCancelled=1`,
      metadata: {
        orderId: order._id.toString(),
        customerId: req.user.userId,
        // The type is captured here so the webhook can route back to the
        // right payments[type] subdoc when PayMongo fires the success event.
        paymentStage: type,
        workflow: 'quotation',
      },
    });

    // Save the link id on the right payments[type] subdoc so the webhook
    // (which only knows the link/source id) can locate the order.
    order.payments[type].paymongoLinkId = link.id;
    order.payments[type].method = 'paymongo';
    order.payments[type].submittedAt = order.payments[type].submittedAt || new Date();
    await order.save();

    res.json({
      checkoutUrl: link.checkoutUrl,
      linkId: link.id,
      amount,
      stage: type,
    });
  } catch (error) {
    console.error('Quotation payment link error:', error);
    res.status(500).json({ message: 'Failed to create payment link', error: error.message });
  }
});

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
    const payload = req.body; // Buffer — DO NOT JSON.parse before signature check.

    // Verify the raw payload against the signature header. If this fails, the
    // request didn't come from PayMongo (or someone tampered with it).
    if (!verifyWebhookSignature(payload, signature, PAYMONGO_WEBHOOK_SECRET)) {
      console.warn('PayMongo webhook signature verification failed');
      return res.status(401).json({ message: 'Invalid signature' });
    }

    // Only parse AFTER verifying the signature.
    const event = JSON.parse(payload.toString('utf8'));
    const { data } = event;
    const eventType = data.type;
    const eventData = data.attributes;

    console.log('PayMongo Webhook received:', eventType);

    // Handle payment success
    if (eventType === 'payment.paid' || eventType === 'source.chargeable' || eventType === 'link.payment.paid') {
      const sourceId = eventData.data?.id;
      const paymentId = eventData.data?.attributes?.payment_intent?.id;
      const amountPaid = eventData.data?.attributes?.amount / 100; // Convert from cents
      // PayMongo includes the link id in different places depending on the
      // event shape. Check several candidates so we always find a match.
      const linkId = eventData.data?.attributes?.link?.id
        || eventData.data?.attributes?.metadata?.linkId
        || eventData.data?.id;
      const stage = eventData.data?.attributes?.metadata?.paymentStage; // 'downpayment' | 'balance'

      // Find order by source/payment id OR by quotation payments[*].paymongoLinkId.
      const order = await Order.findOne({
        $or: [
          { paymongoSourceId: sourceId },
          { paymongoPaymentId: paymentId },
          { 'payments.downpayment.paymongoLinkId': linkId },
          { 'payments.balance.paymongoLinkId': linkId },
        ]
      });

      // ── Quotation-flow auto-verification ────────────────────────────
      // Determine which subdoc this payment belongs to by either the
      // metadata.paymentStage hint or by matching the link id.
      if (order && order.workflowVersion === 'quotation') {
        let matchedStage = stage;
        if (!matchedStage) {
          if (order.payments?.downpayment?.paymongoLinkId === linkId) matchedStage = 'downpayment';
          else if (order.payments?.balance?.paymongoLinkId === linkId) matchedStage = 'balance';
        }
        if (matchedStage && order.payments?.[matchedStage]) {
          order.payments[matchedStage].verifiedAt = new Date();
          order.payments[matchedStage].method = 'paymongo';
          order.payments[matchedStage].reference = String(eventData.data?.id || linkId || '');
          // Cascade: downpayment → status accepted → downpayment_paid
          if (matchedStage === 'downpayment' && order.status === 'accepted') {
            order.status = 'downpayment_paid';
            order.paymentStatus = 'partial';
            order.paidAmount = order.payments.downpayment.amount;
          }
          if (matchedStage === 'balance') {
            order.paymentStatus = 'paid';
            order.paidAmount = (order.payments.downpayment.amount || 0) + (order.payments.balance.amount || 0);
          }
          await order.save();

          // Post a system message so the customer sees "paid + verified" in chat.
          try {
            const { postSystemMessage } = await import('./chat.js');
            await postSystemMessage({
              orderId: order._id,
              body: `✅ ${matchedStage === 'downpayment' ? 'Downpayment' : 'Balance payment'} of ₱${order.payments[matchedStage].amount.toLocaleString()} received via PayMongo and auto-verified.`,
              meta: { type: 'payment_verified', stage: matchedStage, amount: order.payments[matchedStage].amount, source: 'paymongo' },
            });
          } catch {}

          return res.status(200).json({ received: true, autoVerified: true });
        }
      }

      if (order) {
        // Update order payment status
        order.paidAmount = (order.paidAmount || 0) + amountPaid;
        order.paymongoPaymentId = eventData.data?.id;
        
        if (order.paidAmount >= order.requiredPayment) {
          order.paymentStatus = 'paid';
          // For e-wallet, "paid" means we can move to approved (not yet
          // shipped). Real stock deduction happens via consumeReservedForOrder
          // which converts the existing reservation into a real deduction
          // AND writes the audit log entry.
          order.status = 'approved';

          await consumeReservedForOrder({
            order,
            actor: { name: 'PayMongo webhook', role: 'system' },
            reason: `Paid via ${order.paymentMethod || 'e-wallet'} — payment ${eventData.data?.id}`,
          });

          // Audit log for the payment confirmation
          await OrderAuditLog.create({
            order: order._id,
            orderRef: String(order._id).slice(-6),
            type: 'payment_confirmed',
            from: 'awaiting_payment',
            to: 'paid',
            amount: amountPaid,
            note: `PayMongo ${eventType}`,
            performedByName: 'PayMongo webhook',
            performedByRole: 'system',
          }).catch(() => {});

          // Confirmation email to the customer — best-effort
          User.findById(order.customer).select('name email').lean()
            .then((customer) => sendPaymentConfirmed({ user: customer, order, amountPaid }))
            .catch((err) => console.error('Payment-confirmed email failed:', err?.message));
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
 * Actively verify and finalize a PayMongo e-wallet payment.
 *
 * PayMongo's normal flow is webhook-driven: the customer authorizes in the
 * GCash/Maya app → source becomes "chargeable" → PayMongo POSTs to our
 * /webhook endpoint → we mark the order paid. In dev, webhooks can't reach
 * localhost, so this endpoint provides a manual path:
 *
 *   1. Look up the order's stored sourceId
 *   2. Pull the live source status from PayMongo
 *   3. If chargeable + not yet captured → create a Payment from the source
 *   4. Apply the same "mark paid" logic the webhook would have run
 *
 * Idempotent: calling repeatedly on an already-paid order is a no-op.
 *
 * POST /api/paymongo/verify/:orderId
 */
router.post('/verify/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    // Already paid — short-circuit
    if (order.paymentStatus === 'paid') {
      return res.json({
        verified: true,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        note: 'Order already marked paid.',
      });
    }
    if (!order.paymongoSourceId) {
      return res.status(400).json({
        verified: false,
        message: 'This order has no PayMongo source attached.',
      });
    }

    // ─── Pull live status from PayMongo ───────────────────────────────────
    let source;
    try {
      source = await retrieveSource(order.paymongoSourceId);
    } catch (err) {
      return res.status(502).json({
        verified: false,
        message: 'Could not reach PayMongo to verify the payment.',
        error: err.message,
      });
    }

    const sourceStatus = source?.attributes?.status;
    if (sourceStatus === 'pending') {
      return res.json({
        verified: false,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        sourceStatus,
        note: 'Customer has not yet completed payment in the e-wallet app.',
      });
    }
    if (sourceStatus === 'failed' || sourceStatus === 'expired' || sourceStatus === 'cancelled') {
      order.paymentStatus = 'failed';
      await order.save();
      return res.json({
        verified: false,
        paymentStatus: 'failed',
        sourceStatus,
        note: `Payment ${sourceStatus} in PayMongo.`,
      });
    }

    // ─── Convert chargeable → paid by creating the actual Payment ────────
    if (sourceStatus === 'chargeable' || sourceStatus === 'consumed') {
      let payment;
      if (sourceStatus === 'chargeable') {
        try {
          payment = await createPaymentFromSource({
            sourceId: order.paymongoSourceId,
            amount: source.attributes.amount,
            description: `Order ${order._id}`,
          });
        } catch (err) {
          // Possible: source already consumed by a prior call. Treat as paid.
          console.warn('createPaymentFromSource failed, source likely consumed:', err.message);
        }
      }

      const amountCentavos = source.attributes.amount;
      const amountPaid = amountCentavos / 100;

      order.paidAmount = (order.paidAmount || 0) + amountPaid;
      if (order.paidAmount >= (order.requiredPayment || order.totalPrice || 0)) {
        order.paymentStatus = 'paid';
      } else {
        order.paymentStatus = 'partial';
      }
      if (payment?.id) {
        order.paymongoPaymentId = payment.id;
        order.paymentDetails = {
          ...(order.paymentDetails || {}),
          paymongoPaymentId: payment.id,
          paidAt: new Date(),
        };
      } else {
        order.paymentDetails = {
          ...(order.paymentDetails || {}),
          paidAt: new Date(),
        };
      }
      await order.save();

      // Audit log so the timeline shows when verify finalized the payment.
      try {
        await OrderAuditLog.create({
          order: order._id,
          action: 'payment_verified',
          performedBy: req.user.userId,
          performedByName: 'Customer (verify)',
          performedByRole: 'system',
          note: `PayMongo verify: ₱${amountPaid.toFixed(2)} captured.`,
          metadata: { sourceId: order.paymongoSourceId, paymentId: payment?.id },
        });
      } catch {
        /* non-fatal */
      }

      // Confirmation email (best-effort, non-fatal)
      try {
        if (order.paymentStatus === 'paid') {
          await sendPaymentConfirmed(order);
        }
      } catch (err) {
        console.warn('Payment confirmation email failed:', err.message);
      }

      return res.json({
        verified: true,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        sourceStatus,
      });
    }

    // Unknown status — return what we know
    return res.json({
      verified: false,
      paymentStatus: order.paymentStatus,
      sourceStatus,
    });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
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
