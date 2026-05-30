import mongoose from 'mongoose';

/**
 * Return / damage request (panel revision #9).
 *
 * Lifecycle:
 *   1. Customer files a return after their order is delivered/completed.
 *      Status starts at 'pending'.
 *   2. Admin reviews → 'approved' (refund/replace queued) or 'rejected'.
 *      adminNote required on rejection.
 *   3. If approved + refund issued, status → 'refunded' once the refund
 *      hits the customer.
 */
const returnSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  reason: {
    type: String,
    enum: ['damaged', 'wrong_print', 'wrong_size', 'wrong_item', 'quality_issue', 'other'],
    required: true,
  },
  description: { type: String, required: true },
  photos: { type: [String], default: [] }, // data URLs or hosted URLs

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'refunded'],
    default: 'pending',
    index: true,
  },
  adminNote: { type: String, default: '' },
  decidedAt: { type: Date },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export default mongoose.model('Return', returnSchema);
