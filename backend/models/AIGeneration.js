import mongoose from 'mongoose';

/**
 * Audit log for AI design generations.
 *
 * Records every Gemini call made on behalf of a customer or admin so we can:
 *   - Show users their generation history
 *   - Enforce per-user daily quotas without trusting client state
 *   - Track cost trends server-side (each row records token/image counts)
 *   - Debug failed generations
 *
 * Append-only — never edited. Failed generations also recorded (with `success:
 * false`) so a flood of errors is visible in the data.
 */
const aiGenerationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  guestId: { type: String, default: '', index: true }, // for unauthenticated callers

  // What kind of AI call this was
  type: {
    type: String,
    required: true,
    enum: ['decal_image', 'prompt_suggest', 'enhance_prompt', 'describe_image', 'bg_remove', 'mockup'],
    index: true,
  },

  // Inputs (kept short — full body is in `meta`)
  prompt: { type: String, default: '' },
  style: { type: String, default: '' },
  model: { type: String, default: '' },

  // Outputs (we DO NOT store the image bytes here — those go to /uploads or
  // are streamed directly to the client. We just record the URL/path used.)
  resultUrl: { type: String, default: '' },
  resultText: { type: String, default: '' },

  // Status
  success: { type: Boolean, default: true, index: true },
  error: { type: String, default: '' },
  durationMs: { type: Number, default: 0 },

  // Free-form bag for extra context (provider response, billing units, etc.)
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: Date.now, index: true },
});

aiGenerationSchema.index({ user: 1, createdAt: -1 });
aiGenerationSchema.index({ user: 1, type: 1, createdAt: -1 });

/**
 * Count generations a single user has done today (UTC day).
 * Used to enforce the daily quota.
 */
aiGenerationSchema.statics.countToday = async function (filter) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return this.countDocuments({ ...filter, success: true, createdAt: { $gte: start } });
};

export default mongoose.model('AIGeneration', aiGenerationSchema);
