import mongoose from 'mongoose';

/**
 * Persistent AI response cache.
 *
 * Stored in Mongo so cache survives server restarts and load-balanced
 * deployments. TTL index auto-expires rows server-side, no manual sweep
 * needed.
 *
 * Each row is keyed by a hash of (operation, model, prompt, context). The
 * key is computed by services/llm.js — never compose keys outside it.
 */
const aiCacheSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  operation: { type: String, required: true, index: true }, // 'text', 'image', 'json'
  provider: { type: String, default: '' }, // Which provider produced this
  model: { type: String, default: '' },

  // Body of the cached response — kept as Mixed so text, JSON, or data-URL
  // images all fit. Compressed string for images would be ideal in future.
  value: { type: mongoose.Schema.Types.Mixed, required: true },

  // TTL — Mongo deletes the doc automatically when `expiresAt` is reached.
  expiresAt: { type: Date, required: true },

  // Optional: track hit count so admins can see what's popular
  hits: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastHitAt: { type: Date, default: Date.now },
});

aiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
aiCacheSchema.index({ operation: 1, createdAt: -1 });

export default mongoose.model('AICache', aiCacheSchema);
