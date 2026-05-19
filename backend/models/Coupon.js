import mongoose from 'mongoose';

/**
 * Coupon — a discount code that customers can apply at checkout.
 *
 * Design notes:
 *   - Codes are stored UPPERCASE and matched case-insensitively. Most users
 *     type lowercase or mixed case; normalising at write time avoids subtle
 *     mismatches.
 *   - `usedCount` is incremented atomically by the redemption logic via
 *     conditional $inc so concurrent redemptions can't oversell the coupon.
 *   - Soft-delete via `isActive: false` instead of hard delete — keeps the
 *     audit trail intact for already-placed orders that reference it.
 *   - All money values are PHP, all dates are UTC (toISOString roundtrips).
 */
const couponSchema = new mongoose.Schema({
  // Identity
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 40,
    index: true,
  },
  // Customer-facing display name (e.g. "Welcome Discount" — shown in cart)
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 280 },

  // ─── Discount mechanics ──────────────────────────────────────────────
  type: {
    type: String,
    required: true,
    enum: ['percentage', 'fixed_amount', 'free_shipping', 'bogo'],
    index: true,
  },
  /**
   * Meaning of `value` per type:
   *   percentage:    1–100 (% off subtotal)
   *   fixed_amount:  PHP amount to subtract from subtotal
   *   free_shipping: ignored (shipping cost subtracted directly)
   *   bogo:          1 = "buy 1 get 1 free", 2 = "buy 2 get 1 free"
   */
  value: { type: Number, required: true, min: 0 },
  // For percentage discounts, optional cap so a 25% code on a ₱10k order
  // doesn't blow through margin. 0 / undefined = no cap.
  maxDiscount: { type: Number, default: 0, min: 0 },

  // ─── Eligibility constraints ──────────────────────────────────────────
  // Minimum cart subtotal in PHP. 0 = no minimum.
  minOrderValue: { type: Number, default: 0, min: 0 },
  // Hard cap on total redemptions across all customers. 0 = unlimited.
  usageLimit: { type: Number, default: 0, min: 0 },
  // Per-customer redemption cap. 0 = unlimited.
  usageLimitPerCustomer: { type: Number, default: 1, min: 0 },
  // If non-empty, at least one cart item's category must match.
  applicableCategories: { type: [String], default: [] },
  // If non-empty, at least one cart item's SKU must match.
  applicableSkus: { type: [String], default: [] },
  // Skip bulk orders (≥20 units) — they already get the 50% bulk pricing.
  excludeBulkOrders: { type: Boolean, default: false },
  // Only for customers with no prior orders.
  firstTimeCustomerOnly: { type: Boolean, default: false },

  // ─── Validity window ──────────────────────────────────────────────────
  validFrom: { type: Date, default: () => new Date() },
  validUntil: { type: Date, required: true },

  // ─── State ────────────────────────────────────────────────────────────
  isActive: { type: Boolean, default: true, index: true },
  /**
   * Atomic counter — bumped via $inc when a redemption succeeds, decremented
   * when an order with this coupon is refunded/cancelled. Single source of
   * truth for usage capacity.
   */
  usedCount: { type: Number, default: 0, min: 0 },

  // ─── Provenance ───────────────────────────────────────────────────────
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

couponSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Derived helper — is this coupon currently usable by ANYONE right now?
// Use for filtering in admin list and customer-facing eligibility checks.
couponSchema.methods.isCurrentlyActive = function () {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.validFrom && now < this.validFrom) return false;
  if (this.validUntil && now > this.validUntil) return false;
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) return false;
  return true;
};

export default mongoose.model('Coupon', couponSchema);
