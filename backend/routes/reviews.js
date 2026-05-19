import express from 'express';
import Review from '../models/Review.js';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Inventory from '../models/Inventory.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Verify the customer has a delivered order containing the given SKU.
 * Returns the matching order (most recent first) or null.
 *
 * Verified-purchase gating prevents fake reviews from anyone who didn't
 * actually buy the product — the foundation of trustworthy social proof.
 */
async function findEligibleOrder(customerId, sku) {
  return Order.findOne({
    customer: customerId,
    status: { $in: ['delivered', 'completed', 'shipped'] },
    'items.sku': sku,
  })
    .sort({ createdAt: -1 })
    .lean();
}

// ─── Public ────────────────────────────────────────────────────────────────

/**
 * Approved reviews for a SKU (used by product detail page).
 *
 * Returns the list + aggregated stats (avg rating, count per star).
 */
router.get('/product/:sku', async (req, res) => {
  try {
    const { sku } = req.params;
    const reviews = await Review.find({ sku, status: 'approved' })
      .sort({ createdAt: -1 })
      .lean();

    const stats = reviews.reduce(
      (acc, r) => {
        acc.total += 1;
        acc.sum += r.rating;
        acc.distribution[r.rating] = (acc.distribution[r.rating] || 0) + 1;
        return acc;
      },
      {
        total: 0,
        sum: 0,
        average: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      },
    );
    stats.average = stats.total ? stats.sum / stats.total : 0;

    res.json({ reviews, stats });
  } catch (err) {
    console.error('Get product reviews error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Customer ──────────────────────────────────────────────────────────────

/**
 * Check whether the current customer is eligible to review a SKU and
 * whether they already have a review (for "edit" UX).
 */
router.get('/eligibility/:sku', authMiddleware, async (req, res) => {
  try {
    const { sku } = req.params;
    const order = await findEligibleOrder(req.user.userId, sku);
    const existing = await Review.findOne({ customer: req.user.userId, sku }).lean();
    res.json({
      eligible: !!order,
      orderId: order?._id || null,
      existing: existing || null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * List the current customer's reviews (history page / profile).
 */
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const reviews = await Review.find({ customer: req.user.userId })
      .sort({ createdAt: -1 })
      .lean();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Create or update a review. Idempotent on (customer, sku) — submitting
 * twice updates the same row and resets the status back to `pending` so
 * admins can re-moderate edits.
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { sku, rating, title, comment } = req.body || {};
    if (!sku) return res.status(400).json({ message: 'SKU is required' });
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ message: 'Rating must be 1–5' });
    }

    const eligibleOrder = await findEligibleOrder(req.user.userId, sku);
    if (!eligibleOrder) {
      return res.status(403).json({
        message: 'Only customers with a delivered order for this product can review it.',
      });
    }

    // Snapshot fields so a future product rename / user-delete won't break history.
    const [user, inv] = await Promise.all([
      User.findById(req.user.userId).select('name').lean(),
      Inventory.findOne({ sku }).select('name').lean(),
    ]);

    const update = {
      customer: req.user.userId,
      customerName: user?.name || '',
      sku,
      productName: inv?.name || '',
      sourceOrder: eligibleOrder._id,
      rating: r,
      title: String(title || '').slice(0, 100),
      comment: String(comment || '').slice(0, 2000),
      status: 'pending', // re-moderate on edits
      moderatedBy: null,
      moderatedAt: null,
      moderationNote: '',
    };
    const review = await Review.findOneAndUpdate(
      { customer: req.user.userId, sku },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json(review);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'You already reviewed this product.' });
    }
    console.error('Create review error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Delete the current customer's own review for a SKU.
 */
router.delete('/:sku', authMiddleware, async (req, res) => {
  try {
    await Review.deleteOne({ customer: req.user.userId, sku: req.params.sku });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin moderation ──────────────────────────────────────────────────────

/**
 * Moderation queue — pending reviews + filterable by status.
 *
 * Query: ?status=pending|approved|rejected|all
 */
router.get('/admin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const filter = status === 'all' ? {} : { status };
    const reviews = await Review.find(filter)
      .sort({ createdAt: -1 })
      .populate('customer', 'name email')
      .lean();
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Approve / reject a single review. Optional moderation note for context.
 */
router.post('/admin/:id/moderate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { decision, note } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ message: 'Decision must be approve or reject' });
    }
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      {
        status: decision === 'approve' ? 'approved' : 'rejected',
        moderatedBy: req.user.userId,
        moderatedAt: new Date(),
        moderationNote: String(note || '').slice(0, 500),
      },
      { new: true },
    );
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Top-line review KPIs for the admin dashboard.
 */
router.get('/admin/stats', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const [pending, approved, rejected, avgAgg] = await Promise.all([
      Review.countDocuments({ status: 'pending' }),
      Review.countDocuments({ status: 'approved' }),
      Review.countDocuments({ status: 'rejected' }),
      Review.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, avg: { $avg: '$rating' }, total: { $sum: 1 } } },
      ]),
    ]);
    res.json({
      pending,
      approved,
      rejected,
      averageRating: avgAgg[0]?.avg || 0,
      totalApproved: avgAgg[0]?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
