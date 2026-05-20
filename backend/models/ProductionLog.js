import mongoose from 'mongoose';

/**
 * Append-only audit log for every production-related change to an order.
 *
 * Mirrors the StockMovement pattern from inventory: one row per change,
 * never edited. Snapshots the `from` and `to` values so the log is
 * self-explanatory even years later when users / stage definitions evolve.
 */
const productionLogSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  orderRef: { type: String, required: true }, // short order id for display

  type: {
    type: String,
    required: true,
    enum: [
      'approved',          // Order auto-approved (e.g. via scheduling)
      'scheduled',         // First time productionDate is set
      'rescheduled',       // productionDate changed
      'stage_changed',     // productionStage transitioned (or jumped back)
      'priority_changed',  // productionPriority changed
      'assigned',          // assignedTo set or changed
      'unassigned',        // assignedTo cleared
      'note',              // Free-form note added
      'started',           // productionStartedAt stamped (first stage advance)
      'completed',         // productionStage = ready, productionCompletedAt set
      'cancelled',         // Production cancelled
    ],
    index: true,
  },

  // Snapshots — kept as flexible Mixed so we can record dates, strings, refs
  from: { type: mongoose.Schema.Types.Mixed, default: null },
  to: { type: mongoose.Schema.Types.Mixed, default: null },

  // Human-readable context. For `note` type this is the note text itself.
  note: { type: String, default: '' },

  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: '' },
  performedByRole: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now, index: true },
});

productionLogSchema.index({ order: 1, createdAt: -1 });

export default mongoose.model('ProductionLog', productionLogSchema);
