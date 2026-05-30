import express from 'express';
import ChatMessage from '../models/ChatMessage.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { authMiddleware, requireRoles } from '../middleware/auth.js';

const router = express.Router();

// Authorization helper: customer can only see their own orders; admin/staff
// can see any order (staff sees only their assigned ones for some flows but
// chat is allowed for any task they need clarification on).
async function getAuthorizedOrder(orderId, user) {
  const order = await Order.findById(orderId).select('customer assignedTo');
  if (!order) return { error: 'Order not found', status: 404 };
  const role = user.role;
  if (role === 'admin' || role === 'production_staff') return { order };
  if (String(order.customer) === String(user.userId)) return { order };
  return { error: 'Not authorized for this order chat', status: 403 };
}

function roleFor(user) {
  if (user.role === 'admin') return 'admin';
  if (user.role === 'production_staff') return 'staff';
  return 'customer';
}

// Fetch chat thread for an order. Marks messages as read for the caller.
router.get('/:orderId', authMiddleware, async (req, res) => {
  try {
    const { order, error, status } = await getAuthorizedOrder(req.params.orderId, req.user);
    if (error) return res.status(status).json({ message: error });

    const messages = await ChatMessage.find({ order: order._id }).sort({ createdAt: 1 });
    // Mark all as read by the caller (idempotent).
    const userId = req.user.userId;
    const toMark = messages
      .filter((m) => !m.readBy.map(String).includes(String(userId)))
      .map((m) => m._id);
    if (toMark.length) {
      await ChatMessage.updateMany({ _id: { $in: toMark } }, { $addToSet: { readBy: userId } });
    }
    res.json(messages);
  } catch (err) {
    console.error('GET /chat/:orderId error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a chat message
router.post('/:orderId', authMiddleware, async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !String(body).trim()) {
      return res.status(400).json({ message: 'Message body required' });
    }
    const { order, error, status } = await getAuthorizedOrder(req.params.orderId, req.user);
    if (error) return res.status(status).json({ message: error });

    let fromName = '';
    try {
      const u = await User.findById(req.user.userId).select('name');
      if (u) fromName = u.name || '';
    } catch { /* non-fatal */ }

    const msg = await ChatMessage.create({
      order: order._id,
      from: req.user.userId,
      fromRole: roleFor(req.user),
      fromName,
      body: String(body).trim().slice(0, 2000),
      readBy: [req.user.userId],
    });

    // Notify the other side
    try {
      const senderRole = roleFor(req.user);
      const recipientIsCustomer = senderRole !== 'customer';
      await Notification.create({
        type: 'chat_message',
        title: recipientIsCustomer ? `New message from ${fromName || 'CustoMate'}` : `New message from customer`,
        message: msg.body.slice(0, 140),
        target: recipientIsCustomer ? 'customer' : 'admin',
        user: recipientIsCustomer ? order.customer : undefined,
        relatedData: { orderId: String(order._id) },
        priority: 'normal',
      });
    } catch { /* non-fatal */ }

    res.status(201).json(msg);
  } catch (err) {
    console.error('POST /chat/:orderId error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unread count per order for the dashboard badge (auth user)
router.get('/unread/count', authMiddleware, async (req, res) => {
  try {
    let orderFilter = {};
    if (req.user.role !== 'admin' && req.user.role !== 'production_staff') {
      const myOrders = await Order.find({ customer: req.user.userId }).select('_id').lean();
      orderFilter = { order: { $in: myOrders.map((o) => o._id) } };
    }
    const messages = await ChatMessage.find({
      ...orderFilter,
      readBy: { $ne: req.user.userId },
    }).select('order').lean();
    const perOrder = {};
    for (const m of messages) {
      const k = String(m.order);
      perOrder[k] = (perOrder[k] || 0) + 1;
    }
    res.json({ total: messages.length, perOrder });
  } catch (err) {
    console.error('GET /chat/unread/count error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
