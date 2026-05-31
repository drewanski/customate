import express from 'express';
import ChatMessage from '../models/ChatMessage.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { authMiddleware, requireRoles, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Post a `kind: 'system'` message into the order's chat thread.
 *
 * Called by the order status pipeline so every transition the customer cares
 * about — approved / in_production / ready / out_for_delivery / completed /
 * cancelled — shows up in the conversation as a friendly note instead of
 * forcing the customer to track a separate timeline.
 *
 * Exported (not just the route) because orders.js + production.js both need
 * to call it and they're not Express routes.
 */
export async function postSystemMessage({ orderId, body, meta = null }) {
  if (!orderId || !body) return null;
  try {
    return await ChatMessage.create({
      order: orderId,
      kind: 'system',
      from: null,
      fromRole: 'system',
      fromName: 'CustoMate',
      body: String(body).slice(0, 2000),
      meta,
      readBy: [], // empty so both sides see "new"
    });
  } catch (e) {
    console.error('postSystemMessage error:', e?.message);
    return null;
  }
}

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

/**
 * GET /chat/threads — inbox for admin/staff.
 *
 * Returns one row per order that has chat messages, with:
 *   - last message preview + timestamp
 *   - customer name
 *   - order status (so admin can see context without opening)
 *   - unread count for the caller
 *
 * Staff are scoped to orders they've been assigned to; admin sees everything.
 */
router.get('/threads', authMiddleware, requireRoles('admin', 'production_staff'), async (req, res) => {
  try {
    const isStaff = req.user.role === 'production_staff';
    const orderFilter = isStaff ? { assignedTo: req.user.userId } : {};
    const orders = await Order.find(orderFilter)
      .select('_id status deliveryMethod totalPrice totalQty customer createdAt')
      .populate('customer', 'name email')
      .lean();
    if (!orders.length) return res.json([]);

    const orderIds = orders.map((o) => o._id);
    // Fetch last 1 message + unread count per order in two cheap aggregations.
    const userId = req.user.userId;

    const last = await ChatMessage.aggregate([
      { $match: { order: { $in: orderIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$order',
          lastBody: { $first: '$body' },
          lastAt: { $first: '$createdAt' },
          lastFromRole: { $first: '$fromRole' },
          lastFromName: { $first: '$fromName' },
          total: { $sum: 1 },
        },
      },
    ]);
    const lastMap = new Map(last.map((l) => [String(l._id), l]));

    const unread = await ChatMessage.aggregate([
      { $match: { order: { $in: orderIds }, readBy: { $ne: userId }, fromRole: { $ne: roleFor(req.user) } } },
      { $group: { _id: '$order', n: { $sum: 1 } } },
    ]);
    const unreadMap = new Map(unread.map((u) => [String(u._id), u.n]));

    const threads = orders
      .map((o) => {
        const l = lastMap.get(String(o._id));
        if (!l) return null; // skip orders with zero messages
        return {
          orderId: o._id,
          orderRef: String(o._id).slice(-6),
          status: o.status,
          deliveryMethod: o.deliveryMethod,
          totalPrice: o.totalPrice,
          totalQty: o.totalQty,
          customerName: o.customer?.name || '',
          customerEmail: o.customer?.email || '',
          lastBody: l.lastBody,
          lastAt: l.lastAt,
          lastFromRole: l.lastFromRole,
          lastFromName: l.lastFromName,
          totalMessages: l.total,
          unread: unreadMap.get(String(o._id)) || 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

    res.json(threads);
  } catch (err) {
    console.error('GET /chat/threads error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

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

    const senderRole = roleFor(req.user);
    const msg = await ChatMessage.create({
      order: order._id,
      from: req.user.userId,
      fromRole: senderRole,
      fromName,
      body: String(body).trim().slice(0, 2000),
      readBy: [req.user.userId],
    });

    // Persist a Notification doc so the bell + unread badge can read it on
    // page load. Target = the OTHER party (customer if admin/staff sent,
    // admin if customer sent).
    const recipientIsCustomer = senderRole !== 'customer';
    try {
      await Notification.create({
        type: 'chat_message',
        title: recipientIsCustomer ? `New message from ${fromName || 'CustoMate'}` : `New message from ${fromName || 'a customer'}`,
        message: msg.body.slice(0, 140),
        target: recipientIsCustomer ? 'customer' : 'admin',
        user: recipientIsCustomer ? order.customer : undefined,
        relatedData: { orderId: String(order._id) },
        priority: 'normal',
      });
    } catch { /* non-fatal */ }

    // Real-time fan-out via socket.io — open clients update without polling.
    // Two events:
    //   chat:new   — appended to the open OrderChatPanel if room joined
    //   chat:notify — fires the toast + chime + bell badge increment on the
    //                 recipient's side regardless of which page they're on
    try {
      const io = req.app.get('io');
      if (io) {
        const payload = {
          orderId: String(order._id),
          orderRef: String(order._id).slice(-6).toUpperCase(),
          message: {
            _id: msg._id,
            kind: msg.kind,
            fromRole: msg.fromRole,
            fromName: msg.fromName,
            body: msg.body,
            createdAt: msg.createdAt,
          },
          recipient: recipientIsCustomer ? 'customer' : 'admin',
          customerId: String(order.customer),
        };
        // Per-order room for the open chat panel (StaffTaskBoard joins
        // order_<id> already; here we use the same convention).
        io.to(`order_${order._id}`).emit('chat:new', payload);
        // Generic notify event — admin/staff layouts listen on this to
        // show toasts + bump the sidebar badge. Customer-side too.
        io.emit('chat:notify', payload);
      }
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
