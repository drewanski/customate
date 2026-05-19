import express from 'express';
import AbandonedCart from '../models/AbandonedCart.js';
import User from '../models/User.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { sweepAbandonedCarts } from '../services/abandonedCart.js';

const router = express.Router();

/**
 * Customer side: upsert the active cart snapshot.
 *
 * Called from the frontend on a debounce timer (e.g. 30s after the last
 * cart edit). One row per customer — calling it repeatedly is idempotent.
 */
router.post('/sync', authMiddleware, async (req, res) => {
  try {
    const { items, subtotal } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'items must be an array' });
    }
    // Empty carts → delete the row so we don't email customers about nothing.
    if (items.length === 0) {
      await AbandonedCart.deleteOne({ customer: req.user.userId });
      return res.json({ ok: true, cleared: true });
    }
    const user = await User.findById(req.user.userId).select('name email').lean();
    const cart = await AbandonedCart.findOneAndUpdate(
      { customer: req.user.userId },
      {
        customer: req.user.userId,
        customerName: user?.name || '',
        customerEmail: user?.email || '',
        items,
        subtotal: Number(subtotal) || 0,
        status: 'active',
        // Reset notify stage on any cart edit so we restart the clock.
        notifyStage: 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ ok: true, cartId: cart._id });
  } catch (err) {
    console.error('Cart sync error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Admin: list active abandoned carts (for visibility / manual outreach).
 */
router.get('/admin', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const carts = await AbandonedCart.find({ status: 'active' })
      .sort({ updatedAt: -1 })
      .lean();
    res.json(carts);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Admin: KPI counts (active/recovered/sent today).
 */
router.get('/admin/stats', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [active, recovered, notifiedToday] = await Promise.all([
      AbandonedCart.countDocuments({ status: 'active' }),
      AbandonedCart.countDocuments({ status: 'recovered' }),
      AbandonedCart.countDocuments({
        lastNotifiedAt: { $gte: oneDayAgo },
      }),
    ]);
    res.json({ active, recovered, notifiedToday });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Admin: trigger the sweep manually (otherwise it runs hourly via the
 * server-startup interval). Useful for testing the email templates.
 */
router.post('/admin/sweep', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const summary = await sweepAbandonedCarts();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;
