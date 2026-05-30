import express from 'express';
import Return from '../models/Return.js';
import Order from '../models/Order.js';
import Notification from '../models/Notification.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Customer files a return for one of their delivered orders.
 *
 * Body: { orderId, reason, description, photos[] }
 * Eligibility: order must belong to the caller AND be in a delivered/completed state.
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { orderId, reason, description, photos } = req.body;
    if (!orderId || !reason || !description) {
      return res.status(400).json({ message: 'orderId, reason and description are required' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (String(order.customer) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'Not your order' });
    }
    const eligibleStatuses = ['completed', 'delivered', 'shipped'];
    if (!eligibleStatuses.includes(order.status)) {
      return res.status(400).json({
        message: 'Returns can only be filed once the order has been delivered/completed',
      });
    }

    // Prevent duplicate open returns for the same order.
    const existing = await Return.findOne({ order: order._id, status: 'pending' });
    if (existing) {
      return res.status(409).json({ message: 'You already have an open return request for this order', returnId: existing._id });
    }

    const ret = await Return.create({
      order: order._id,
      customer: req.user.userId,
      reason,
      description,
      photos: Array.isArray(photos) ? photos.slice(0, 6) : [],
    });

    // Notify admins.
    try {
      await Notification.create({
        type: 'return_filed',
        title: 'Return request filed',
        message: `Order ${order._id.toString().slice(-6)} — reason: ${reason}`,
        target: 'admin',
        relatedData: { orderId: String(order._id), status: reason },
        priority: 'high',
      });
    } catch { /* non-fatal */ }

    res.status(201).json(ret);
  } catch (err) {
    console.error('POST /returns error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Customer: their own returns
router.get('/mine', authMiddleware, async (req, res) => {
  const list = await Return.find({ customer: req.user.userId })
    .populate('order', 'totalPrice status createdAt')
    .sort({ createdAt: -1 });
  res.json(list);
});

// Admin: all returns
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const list = await Return.find(filter)
    .populate('order', 'totalPrice status createdAt customer')
    .populate('customer', 'name email')
    .sort({ createdAt: -1 });
  res.json(list);
});

// Admin: approve/reject
router.patch('/:id/decision', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { decision, adminNote } = req.body;
    if (!['approved', 'rejected', 'refunded'].includes(decision)) {
      return res.status(400).json({ message: 'decision must be approved/rejected/refunded' });
    }
    if (decision === 'rejected' && !adminNote) {
      return res.status(400).json({ message: 'adminNote is required when rejecting' });
    }
    const ret = await Return.findByIdAndUpdate(
      req.params.id,
      {
        status: decision,
        adminNote: adminNote || '',
        decidedAt: new Date(),
        decidedBy: req.user.userId,
      },
      { new: true },
    );
    if (!ret) return res.status(404).json({ message: 'Return not found' });

    // Notify the customer of the decision.
    try {
      await Notification.create({
        type: 'return_decision',
        title: decision === 'approved'
          ? 'Return request approved'
          : decision === 'refunded'
            ? 'Refund issued'
            : 'Return request declined',
        message: adminNote || `Your return request was ${decision}.`,
        target: 'customer',
        user: ret.customer,
        relatedData: { orderId: String(ret.order), status: decision },
        priority: 'high',
      });
    } catch { /* non-fatal */ }

    res.json(ret);
  } catch (err) {
    console.error('PATCH /returns/:id/decision error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
