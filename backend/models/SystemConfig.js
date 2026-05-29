import mongoose from 'mongoose';

/**
 * Singleton system configuration document.
 *
 * Pattern: there is exactly ONE document in this collection (named
 * 'default'). Use SystemConfig.getOrCreate() to read it — the method
 * creates a default row on first access so callers don't have to
 * handle the null case.
 *
 * Why a model instead of env vars: these are admin-tunable settings
 * that should be changeable without a redeploy. Env vars are for
 * SECRETS + infrastructure config, not for operational toggles like
 * "should we auto-assign tasks?".
 */
const systemConfigSchema = new mongoose.Schema({
  // A constant key so we can upsert against it. Always 'default' for now;
  // could be extended to per-tenant configs later.
  key: { type: String, default: 'default', unique: true, index: true },

  // ─── Auto-assignment ─────────────────────────────────────────────────
  // When true, approving an order automatically picks the production_staff
  // user with the lowest active-task count and assigns the order to them.
  // When false, the admin must pick manually via the Schedule modal.
  autoAssignEnabled: { type: Boolean, default: false },

  // ─── Daily digest ───────────────────────────────────────────────────
  // When true, send the end-of-day production summary to all admin emails
  // at the configured local hour. When false, no digest is sent.
  dailyDigestEnabled: { type: Boolean, default: true },
  dailyDigestHour: { type: Number, default: 18, min: 0, max: 23 }, // 18:00 = 6 PM

  // ─── Audit ──────────────────────────────────────────────────────────
  lastUpdatedAt: { type: Date, default: Date.now },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

/**
 * Idempotent getter. Returns the existing config doc or creates the
 * default-row on first call. Always returns a Mongoose document so
 * caller can save() it directly after mutation.
 */
systemConfigSchema.statics.getOrCreate = async function () {
  let doc = await this.findOne({ key: 'default' });
  if (!doc) {
    doc = await this.create({ key: 'default' });
  }
  return doc;
};

export default mongoose.model('SystemConfig', systemConfigSchema);
