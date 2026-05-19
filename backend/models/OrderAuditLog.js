import mongoose from 'mongoose';

/**
 * Append-only audit trail for every admin action against an order.
 *
 * Mirrors the pattern from StockMovement and ProductionLog: one row per
 * change, never edited. Snapshots `from` and `to` plus the operator's name
 * so the log stays readable forever.
 *
 * Customer-facing events (order placed, payment confirmed by webhook) also
 * land here so the admin sees a single unified timeline per order.
 */
const orderAuditLogSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  orderRef: { type: String, required: true },

  type: {
    type: String,
    required: true,
    enum: [
      'created',          // Order placed (system)
      'status_changed',   // Admin moved through workflow
      'payment_confirmed',// Payment webhook
      'payment_failed',   // Webhook reported failure
      'note',             // Admin internal note
      'cancelled',        // Admin cancelled with reason
      'refunded',         // Admin marked refunded
      'bulk_action',      // Part of a multi-order batch
      'shipped',          // Shipping label / tracking
      'delivered',        // Delivery confirmation
    ],
    index: true,
  },

  from: { type: mongoose.Schema.Types.Mixed, default: null },
  to: { type: mongoose.Schema.Types.Mixed, default: null },
  amount: { type: Number, default: 0 },        // For refunds, partial payments
  reason: { type: String, default: '' },       // Required for cancellations & refunds
  note: { type: String, default: '' },

  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: '' },
  performedByRole: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now, index: true },
});

orderAuditLogSchema.index({ order: 1, createdAt: -1 });

export default mongoose.model('OrderAuditLog', orderAuditLogSchema);
