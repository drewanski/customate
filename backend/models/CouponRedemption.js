import mongoose from 'mongoose';

/**
 * CouponRedemption — append-only audit log of every coupon use.
 *
 * One row per successful redemption. The order references the redemption via
 * Order.couponCode + Order.discountAmount, but THIS row is the source of
 * truth for:
 *   - Per-customer usage count (counted by { coupon, customer })
 *   - Global usage count (counted by { coupon } — also mirrored in Coupon.usedCount for speed)
 *   - Refund audit trail (released=true when the order is refunded/cancelled)
 *   - Admin "who used this code" panel
 *
 * Refunds DON'T delete the row — they set `released: true` and the
 * validation logic excludes released rows from usage counts. This preserves
 * the audit trail forever.
 */
const couponRedemptionSchema = new mongoose.Schema({
  coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true, index: true },
  couponCode: { type: String, required: true }, // denormalised for display
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },

  // Snapshot fields — captured at redemption time and never mutated, so the
  // record stays accurate even if the coupon or items are later edited.
  discountType: { type: String, required: true }, // 'percentage' | 'fixed_amount' | etc.
  discountAmount: { type: Number, required: true, min: 0 },
  cartSubtotal: { type: Number, required: true, min: 0 },
  cartItemCount: { type: Number, default: 0 },

  redeemedAt: { type: Date, default: Date.now, index: true },

  // Set to true when the order is cancelled/refunded. Validation logic
  // excludes released rows from usage counts so the customer can re-use the
  // code on a different order.
  released: { type: Boolean, default: false },
  releasedAt: { type: Date, default: null },
  releaseReason: { type: String, default: '' },
});

couponRedemptionSchema.index({ coupon: 1, customer: 1 });
couponRedemptionSchema.index({ coupon: 1, redeemedAt: -1 });

export default mongoose.model('CouponRedemption', couponRedemptionSchema);
