import mongoose from 'mongoose';

/**
 * Append-only audit trail for every admin action on a customer account.
 *
 * Same shape as the other audit logs (StockMovement, ProductionLog,
 * OrderAuditLog). Used by AdminUsers to render the activity timeline in the
 * user-detail drawer.
 *
 * Customer-self-service actions (signup, profile edits) also land here as
 * `system` type so the admin sees a unified timeline.
 */
const userAuditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userRef: { type: String, default: '' }, // denormalized name for display after deletion

  type: {
    type: String,
    required: true,
    enum: [
      'created',           // Account created
      'status_changed',    // active/inactive/suspended
      'role_changed',      // customer/admin/guest
      'note',              // Internal admin note
      'suspended',         // Special-case status change with reason
      'reactivated',       // Suspended → active
      'email_verified',    // OTP completed
      'password_reset',    // User reset via forgot-password flow
      'logged_in',         // (optional — could be noisy, opt-in)
    ],
    index: true,
  },

  from: { type: mongoose.Schema.Types.Mixed, default: null },
  to: { type: mongoose.Schema.Types.Mixed, default: null },
  reason: { type: String, default: '' }, // Required for suspend/role-change
  note: { type: String, default: '' },

  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: '' },
  performedByRole: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now, index: true },
});

userAuditLogSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('UserAuditLog', userAuditLogSchema);
