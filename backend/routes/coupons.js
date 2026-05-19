import express from 'express';
import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { validateCoupon, getCouponStats } from '../services/coupons.js';

const router = express.Router();

// ─── Customer endpoints ────────────────────────────────────────────────────

/**
 * POST /api/coupons/validate
 *
 * Customer-facing: pass `{ code, cartItems }` to get back validity + discount
 * preview BEFORE placing the order. Used by the cart and checkout flow.
 *
 * Doesn't reserve or redeem anything — purely read-only validation.
 */
router.post('/validate', authMiddleware, async (req, res) => {
  try {
    const { code, cartItems } = req.body;
    const result = await validateCoupon({
      code,
      cartItems: cartItems || [],
      customerId: req.user.userId,
    });
    if (!result.valid) {
      return res.status(400).json({
        valid: false,
        reason: result.reason,
        code: result.code,
      });
    }
    res.json({
      valid: true,
      code: result.coupon.code,
      name: result.coupon.name,
      type: result.coupon.type,
      description: result.coupon.description,
      discountAmount: result.discount.amount,
      breakdown: result.discount.breakdown,
      freeShipping: !!result.discount.freeShipping,
      subtotal: result.subtotal,
    });
  } catch (err) {
    console.error('Coupon validate error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── Admin endpoints ───────────────────────────────────────────────────────

/**
 * GET /api/coupons (admin)
 *
 * List all coupons with enriched usage stats so the admin table shows
 * "used 12/100 · 8 unique customers · ₱4,200 given" without N+1 queries.
 */
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    const stats = await getCouponStats();
    const statsByCouponId = Object.fromEntries(stats.map((s) => [String(s.couponId), s]));

    const enriched = coupons.map((c) => {
      const cObj = c.toObject();
      const s = statsByCouponId[String(c._id)] || {};
      return {
        ...cObj,
        stats: {
          totalRedemptions: s.totalRedemptions || 0,
          activeRedemptions: s.activeRedemptions || 0,
          releasedRedemptions: s.releasedRedemptions || 0,
          totalDiscount: s.totalDiscount || 0,
          avgDiscount: s.avgDiscount || 0,
          uniqueCustomers: s.uniqueCustomerCount || 0,
          lastUsed: s.lastUsed || null,
        },
        isCurrentlyActive: c.isCurrentlyActive(),
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error('List coupons error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/coupons/stats/summary  (admin)
 *
 * Top-line KPIs for the admin dashboard:
 *   - active count
 *   - total redemptions
 *   - total discount given
 *   - avg discount per redemption
 */
router.get('/stats/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const [active, total, allStats] = await Promise.all([
      Coupon.countDocuments({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
      }),
      Coupon.countDocuments(),
      getCouponStats(),
    ]);

    const totals = allStats.reduce(
      (acc, s) => ({
        redemptions: acc.redemptions + (s.totalRedemptions || 0),
        activeRedemptions: acc.activeRedemptions + (s.activeRedemptions || 0),
        discountGiven: acc.discountGiven + (s.totalDiscount || 0),
      }),
      { redemptions: 0, activeRedemptions: 0, discountGiven: 0 }
    );

    res.json({
      activeCoupons: active,
      totalCoupons: total,
      totalRedemptions: totals.redemptions,
      activeRedemptions: totals.activeRedemptions,
      totalDiscountGiven: Math.round(totals.discountGiven * 100) / 100,
      avgDiscount: totals.activeRedemptions > 0
        ? Math.round((totals.discountGiven / totals.activeRedemptions) * 100) / 100
        : 0,
    });
  } catch (err) {
    console.error('Coupon stats summary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/coupons (admin) — create a new coupon.
 *
 * Validates: code uniqueness, dates make sense, value is appropriate for type.
 */
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.code || !body.name || !body.type || body.value === undefined) {
      return res.status(400).json({ message: 'code, name, type, and value are required' });
    }
    if (!['percentage', 'fixed_amount', 'free_shipping', 'bogo'].includes(body.type)) {
      return res.status(400).json({ message: 'Invalid coupon type' });
    }
    if (body.type === 'percentage' && (body.value < 1 || body.value > 100)) {
      return res.status(400).json({ message: 'Percentage must be between 1 and 100' });
    }
    if (!body.validUntil) {
      return res.status(400).json({ message: 'validUntil is required' });
    }
    if (body.validFrom && new Date(body.validFrom) >= new Date(body.validUntil)) {
      return res.status(400).json({ message: 'validUntil must be after validFrom' });
    }

    const coupon = new Coupon({
      code: String(body.code).trim().toUpperCase(),
      name: String(body.name).trim(),
      description: body.description || '',
      type: body.type,
      value: Number(body.value),
      maxDiscount: Number(body.maxDiscount) || 0,
      minOrderValue: Number(body.minOrderValue) || 0,
      usageLimit: Number(body.usageLimit) || 0,
      usageLimitPerCustomer: Number(body.usageLimitPerCustomer) || 1,
      applicableCategories: Array.isArray(body.applicableCategories) ? body.applicableCategories : [],
      applicableSkus: Array.isArray(body.applicableSkus) ? body.applicableSkus : [],
      excludeBulkOrders: !!body.excludeBulkOrders,
      firstTimeCustomerOnly: !!body.firstTimeCustomerOnly,
      validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
      validUntil: new Date(body.validUntil),
      isActive: body.isActive !== false,
      createdBy: req.user.userId,
    });
    await coupon.save();
    res.status(201).json(coupon);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'A coupon with this code already exists' });
    }
    console.error('Create coupon error:', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/**
 * GET /api/coupons/:id (admin) — single coupon detail.
 */
router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    const stats = await getCouponStats(coupon._id);
    res.json({
      ...coupon.toObject(),
      stats: stats[0] || null,
      isCurrentlyActive: coupon.isCurrentlyActive(),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/coupons/:id (admin) — update editable fields.
 *
 * Note: the `code` field is INTENTIONALLY not editable after creation —
 * orders that used the old code still reference it. Admins should
 * deactivate the old one and create a new one.
 */
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const allowed = [
      'name', 'description', 'value', 'maxDiscount', 'minOrderValue',
      'usageLimit', 'usageLimitPerCustomer', 'applicableCategories',
      'applicableSkus', 'excludeBulkOrders', 'firstTimeCustomerOnly',
      'validFrom', 'validUntil', 'isActive',
    ];
    const update = {};
    for (const key of allowed) {
      if (key in req.body) update[key] = req.body[key];
    }
    if (update.validFrom) update.validFrom = new Date(update.validFrom);
    if (update.validUntil) update.validUntil = new Date(update.validUntil);

    const coupon = await Coupon.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Server error' });
  }
});

/**
 * DELETE /api/coupons/:id (admin)
 *
 * SOFT delete only — sets isActive=false. Hard delete is refused if any
 * redemption rows exist for this coupon (would break order references).
 */
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found' });

    if (req.query.hard === 'true') {
      const refCount = await CouponRedemption.countDocuments({ coupon: coupon._id });
      if (refCount > 0) {
        return res.status(400).json({
          message: `Cannot hard-delete — ${refCount} order(s) have used this coupon. Deactivate instead.`,
        });
      }
      await Coupon.findByIdAndDelete(coupon._id);
      return res.json({ message: 'Coupon permanently deleted' });
    }

    coupon.isActive = false;
    await coupon.save();
    res.json({ message: 'Coupon deactivated', coupon });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/coupons/:id/redemptions (admin)
 *
 * Per-coupon usage log — who redeemed, when, how much. Powers the
 * "see who used this" drawer.
 */
router.get('/:id/redemptions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const redemptions = await CouponRedemption.find({ coupon: req.params.id })
      .sort({ redeemedAt: -1 })
      .limit(limit)
      .populate('customer', 'name email')
      .lean();
    res.json(redemptions);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/coupons/export/csv (admin)
 */
router.get('/export/csv', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    const stats = await getCouponStats();
    const byId = Object.fromEntries(stats.map((s) => [String(s.couponId), s]));

    const escape = (v) => {
      if (v === undefined || v === null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const header = [
      'Code', 'Name', 'Type', 'Value', 'Min Order',
      'Used', 'Limit', 'Active Redemptions', 'Total Discount Given',
      'Valid From', 'Valid Until', 'Active',
    ].join(',');
    const rows = coupons.map((c) => {
      const s = byId[String(c._id)] || {};
      return [
        c.code, c.name, c.type, c.value, c.minOrderValue,
        c.usedCount, c.usageLimit || 'unlimited',
        s.activeRedemptions || 0, s.totalDiscount || 0,
        c.validFrom?.toISOString() || '', c.validUntil?.toISOString() || '',
        c.isActive ? 'yes' : 'no',
      ].map(escape).join(',');
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="coupons-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
