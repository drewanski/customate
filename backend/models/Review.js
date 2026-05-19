import mongoose from 'mongoose';

/**
 * Product review.
 *
 * Constraints:
 *   - Only customers with a delivered/completed order for that exact SKU
 *     may post a review (verified-purchase gating).
 *   - One review per (customer, sku) — editing updates the existing row
 *     rather than creating duplicates.
 *   - Reviews start `status='pending'` so admins can moderate user-generated
 *     content before it appears publicly. The customer sees their own
 *     pending review on their profile; the public product page only shows
 *     `approved` ones.
 *
 * The unique index on (customer, sku) is what prevents duplicate reviews.
 * We persist `productName` + `customerName` as a denormalized snapshot so
 * a product rename or customer-deletion doesn't break historical reviews.
 */
const reviewSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerName: { type: String, default: '' },
    sku: { type: String, required: true, index: true },
    productName: { type: String, default: '' },
    // Order that proved verified-purchase eligibility at write time.
    sourceOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '', maxlength: 100 },
    comment: { type: String, default: '', maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: { type: Date },
    moderationNote: { type: String, default: '' },
    // Free-form helpful counter — populated only when we add a "Was this
    // helpful?" button down the road; harmless to leave at 0 for now.
    helpfulCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Exactly one review per customer per SKU.
reviewSchema.index({ customer: 1, sku: 1 }, { unique: true });
// Public product-page lookups: by sku + approved + most recent first.
reviewSchema.index({ sku: 1, status: 1, createdAt: -1 });

export default mongoose.model('Review', reviewSchema);
