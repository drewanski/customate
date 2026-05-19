import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import AIGeneration from '../models/AIGeneration.js';
import {
  generateDecal,
  suggestPrompts,
  enhancePrompt,
  removeBackground,
  generateVariations,
  critiqueDesign,
  generateMockup,
  listMockupScenes,
  listBodySizes,
  isWearable,
  AI_DESIGN_STYLES,
} from '../services/aiDesign.js';

const router = express.Router();

/**
 * Daily quota per user role. Image generation is expensive; text suggestions
 * are cheap, so we charge images more heavily.
 *
 * Limits are enforced via the audit-log count, not in-memory counters, so
 * they survive server restarts and load-balanced deploys.
 */
const QUOTA = {
  customer: { decal_image: 20, prompt_suggest: 100, enhance_prompt: 50, bg_remove: 20, describe_image: 30, mockup: 8 },
  admin:    { decal_image: 200, prompt_suggest: 1000, enhance_prompt: 500, bg_remove: 200, describe_image: 500, mockup: 100 },
  guest:    { decal_image: 3, prompt_suggest: 10, enhance_prompt: 5, bg_remove: 3, describe_image: 5 },
};

function quotaFor(role, type) {
  return QUOTA[role]?.[type] ?? QUOTA.customer[type] ?? 0;
}

/**
 * Middleware that checks the caller's daily quota for the given type. Returns
 * 429 with the remaining count headers if exceeded.
 */
function enforceQuota(type) {
  return async (req, res, next) => {
    try {
      const role = req.user?.role || 'guest';
      const limit = quotaFor(role, type);
      const used = await AIGeneration.countToday({ user: req.user.userId, type });
      res.setHeader('X-AI-Quota-Limit', limit);
      res.setHeader('X-AI-Quota-Used', used);
      res.setHeader('X-AI-Quota-Remaining', Math.max(0, limit - used));
      if (used >= limit) {
        return res.status(429).json({
          message: `Daily AI quota reached (${used}/${limit}). Try again tomorrow or upgrade your plan.`,
          quotaExceeded: true,
          limit,
          used,
        });
      }
      next();
    } catch (err) {
      console.error('quota check failed:', err.message);
      next();
    }
  };
}

// All AI-design endpoints require a real account. We don't want guest abuse
// burning the Gemini bill.
router.use(authMiddleware);

/**
 * GET /api/ai-design/usage
 * Returns the caller's daily quota status for each AI action.
 */
router.get('/usage', async (req, res) => {
  try {
    const role = req.user?.role || 'customer';
    const types = ['decal_image', 'prompt_suggest', 'enhance_prompt', 'bg_remove', 'describe_image'];
    const usage = {};
    for (const type of types) {
      const used = await AIGeneration.countToday({ user: req.user.userId, type });
      usage[type] = { used, limit: quotaFor(role, type), remaining: Math.max(0, quotaFor(role, type) - used) };
    }
    res.json({ role, usage, styles: AI_DESIGN_STYLES });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/ai-design/history?limit=12
 * Returns the caller's recent successful generations so the studio can
 * rehydrate the "recent" strip across sessions.
 */
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const items = await AIGeneration.find({
      user: req.user.userId,
      type: 'decal_image',
      success: true,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('prompt style resultUrl createdAt meta');
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/ai-design/suggest
 * Body: { category?: string, count?: number }
 */
router.post('/suggest', enforceQuota('prompt_suggest'), async (req, res) => {
  const start = Date.now();
  const { category = 'general', count = 6 } = req.body || {};
  try {
    const out = await suggestPrompts({ category, count });
    await AIGeneration.create({
      user: req.user.userId,
      type: 'prompt_suggest',
      prompt: category,
      resultText: JSON.stringify(out.suggestions).slice(0, 500),
      model: out.model,
      durationMs: Date.now() - start,
      success: true,
      meta: { fromCache: !!out.fromCache, fallback: !!out.fallback },
    });
    res.json(out);
  } catch (err) {
    await AIGeneration.create({
      user: req.user.userId,
      type: 'prompt_suggest',
      prompt: category,
      success: false,
      error: err.message,
      durationMs: Date.now() - start,
    }).catch(() => {});
    res.status(500).json({ message: err.message || 'Failed to suggest prompts' });
  }
});

/**
 * POST /api/ai-design/enhance
 * Body: { prompt: string }
 */
router.post('/enhance', enforceQuota('enhance_prompt'), async (req, res) => {
  const start = Date.now();
  const { prompt } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ message: 'prompt is required' });
  }
  try {
    const out = await enhancePrompt({ prompt });
    await AIGeneration.create({
      user: req.user.userId,
      type: 'enhance_prompt',
      prompt: String(prompt).slice(0, 300),
      resultText: out.enhanced.slice(0, 500),
      model: out.model,
      durationMs: Date.now() - start,
      success: true,
    });
    res.json(out);
  } catch (err) {
    await AIGeneration.create({
      user: req.user.userId,
      type: 'enhance_prompt',
      prompt: String(prompt).slice(0, 300),
      success: false,
      error: err.message,
      durationMs: Date.now() - start,
    }).catch(() => {});
    res.status(500).json({ message: err.message || 'Failed to enhance prompt' });
  }
});

/**
 * POST /api/ai-design/decal
 * Body: { prompt: string, style?: string }
 *
 * Generates one decal image. Returns:
 *   { dataUrl, model, durationMs, fromCache, fallback, generationId, quota }
 */
router.post('/decal', enforceQuota('decal_image'), async (req, res) => {
  const start = Date.now();
  const { prompt, style = 'minimalist' } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ message: 'prompt is required' });
  }
  if (!AI_DESIGN_STYLES.includes(style)) {
    return res.status(400).json({ message: `style must be one of ${AI_DESIGN_STYLES.join(', ')}` });
  }
  try {
    const out = await generateDecal({ prompt, style });
    // Persist BEFORE responding so the audit is reliable even on flaky
    // network. We store only the result URL (data: URL) here for now —
    // future enhancement: pipe the bytes to Cloudinary and store the CDN
    // URL so the studio can rehydrate from history.
    const doc = await AIGeneration.create({
      user: req.user.userId,
      type: 'decal_image',
      prompt: String(prompt).slice(0, 300),
      style,
      model: out.model,
      resultUrl: out.fallback ? '' : out.dataUrl, // skip storing huge dataURLs unless small
      success: true,
      durationMs: out.durationMs,
      meta: { fromCache: !!out.fromCache, fallback: !!out.fallback, fallbackReason: out.fallbackReason },
    });
    res.json({ ...out, generationId: doc._id });
  } catch (err) {
    await AIGeneration.create({
      user: req.user.userId,
      type: 'decal_image',
      prompt: String(prompt).slice(0, 300),
      style,
      success: false,
      error: err.message,
      durationMs: Date.now() - start,
    }).catch(() => {});
    res.status(500).json({ message: err.message || 'Failed to generate decal' });
  }
});

/**
 * POST /api/ai-design/remove-bg
 * Body: { image: dataURL or base64 }
 *
 * Strips the background from a customer-uploaded logo. Returns the cleaned
 * image as a data URL. Falls back to the original image if the model
 * isn't available.
 */
router.post('/remove-bg', enforceQuota('bg_remove'), async (req, res) => {
  const start = Date.now();
  const { image } = req.body || {};
  if (!image) return res.status(400).json({ message: 'image is required' });
  try {
    const out = await removeBackground({ imageData: image });
    const doc = await AIGeneration.create({
      user: req.user.userId,
      type: 'bg_remove',
      prompt: '(image)',
      model: out.model,
      success: true,
      durationMs: out.durationMs,
      meta: { fromCache: !!out.fromCache, fallback: !!out.fallback, fallbackReason: out.fallbackReason },
    });
    res.json({ ...out, generationId: doc._id });
  } catch (err) {
    await AIGeneration.create({
      user: req.user.userId, type: 'bg_remove', prompt: '(image)',
      success: false, error: err.message, durationMs: Date.now() - start,
    }).catch(() => {});
    res.status(500).json({ message: err.message || 'Failed to remove background' });
  }
});

/**
 * POST /api/ai-design/variations
 * Body: { image, prompt, style?, count? (1-4) }
 *
 * Generates `count` variations of an existing decal. Each variation counts
 * against the decal_image daily quota (so 3 variations = 3 quota units).
 * We enforce a fresh quota check before kicking off — the loop is best-effort
 * after that.
 */
router.post('/variations', enforceQuota('decal_image'), async (req, res) => {
  const start = Date.now();
  const { image, prompt, style = 'minimalist', count = 3 } = req.body || {};
  if (!image) return res.status(400).json({ message: 'image is required' });
  const n = Math.max(1, Math.min(4, Number(count) || 3));

  // Pre-check: do we have enough budget left for N images? If not, cap to
  // what's remaining instead of refusing entirely.
  const role = req.user?.role || 'customer';
  const limit = quotaFor(role, 'decal_image');
  const used = await AIGeneration.countToday({ user: req.user.userId, type: 'decal_image' });
  const remaining = Math.max(0, limit - used);
  if (remaining === 0) {
    return res.status(429).json({ message: 'Daily AI image quota reached', quotaExceeded: true, limit, used });
  }
  const allowedCount = Math.min(n, remaining);

  try {
    const out = await generateVariations({
      originalImage: image,
      prompt: prompt || '',
      style,
      count: allowedCount,
    });
    // Log one row per variation so quota accounting stays consistent.
    for (const v of out.variations) {
      await AIGeneration.create({
        user: req.user.userId,
        type: 'decal_image',
        prompt: `[variation] ${(prompt || '').slice(0, 200)}`,
        style,
        model: v.model,
        success: !v.fallback,
        durationMs: v.durationMs || 0,
        meta: { variation: true, nudge: v.nudge, fallback: !!v.fallback },
      }).catch(() => {});
    }
    res.json({
      ...out,
      requestedCount: n,
      generatedCount: out.variations.length,
      quotaRemainingAfter: Math.max(0, remaining - out.variations.length),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to generate variations' });
  }
});

/**
 * POST /api/ai-design/critique
 * Body: { image, productName?, designContext? }
 *
 * Vision call: looks at the customer's current design (typically a screenshot
 * of the 3D preview) and returns 3 actionable design tips.
 */
router.post('/critique', enforceQuota('describe_image'), async (req, res) => {
  const start = Date.now();
  const { image, productName, designContext } = req.body || {};
  if (!image) return res.status(400).json({ message: 'image is required' });
  try {
    const out = await critiqueDesign({ imageData: image, productName, designContext });
    await AIGeneration.create({
      user: req.user.userId,
      type: 'describe_image',
      prompt: `[critique] ${productName || ''}`.slice(0, 200),
      model: out.model,
      resultText: JSON.stringify(out.tips).slice(0, 600),
      success: true,
      durationMs: out.durationMs || (Date.now() - start),
      meta: { fallback: !!out.fallback },
    });
    res.json(out);
  } catch (err) {
    await AIGeneration.create({
      user: req.user.userId, type: 'describe_image', prompt: '[critique]',
      success: false, error: err.message, durationMs: Date.now() - start,
    }).catch(() => {});
    res.status(500).json({ message: err.message || 'Failed to critique design' });
  }
});

// ─── Lifestyle / mockup generation ────────────────────────────────────────

/**
 * GET /api/ai-design/mockup/scenes?productType=shirt
 *
 * Returns the list of scene options available for the product type so the
 * frontend can render a scene-picker chip row (e.g. "Studio", "Outdoor",
 * "Lifestyle"). Cheap, no LLM call.
 */
router.get('/mockup/scenes', (req, res) => {
  const { productType } = req.query || {};
  const pt = String(productType || 'shirt');
  res.json({
    scenes: listMockupScenes(pt),
    // Body sizes are only meaningful for wearable products. Returning the
    // wearable flag here lets the frontend show/hide the body-size chip row
    // without a second round trip.
    isWearable: isWearable(pt),
    bodySizes: isWearable(pt) ? listBodySizes() : [],
  });
});

/**
 * POST /api/ai-design/mockup
 * Body: { designImage (data URL), productType, productName?, scene? }
 *
 * Generate a photo-realistic lifestyle / mockup image of the customer's
 * finished design. Heavy operation (~10-15s, ~$0.04/call), so it lives
 * behind its own quota slot — 8/day for customers, 100/day for admins.
 *
 * Customers click a "Generate lifestyle preview" button intentionally;
 * this is NOT triggered automatically by every design tweak.
 */
router.post('/mockup', enforceQuota('mockup'), async (req, res) => {
  const start = Date.now();
  const {
    designImage,
    productType,
    productName,
    scene = 'default',
    bodySize = '',
    customDescription = '',
  } = req.body || {};
  if (!designImage) return res.status(400).json({ message: 'designImage is required' });

  try {
    const out = await generateMockup({
      designImage,
      productType: String(productType || 'shirt').toLowerCase(),
      productName,
      scene: String(scene || 'default'),
      bodySize: String(bodySize || ''),
      customDescription: String(customDescription || ''),
    });
    // Audit the call — counts against quota even if Gemini errored out
    const doc = await AIGeneration.create({
      user: req.user.userId,
      type: 'mockup',
      prompt: `${productName || productType || 'product'} (${scene})`,
      model: out.model,
      success: !out.fallback,
      durationMs: out.durationMs,
      meta: {
        fromCache: !!out.fromCache,
        fallback: !!out.fallback,
        fallbackReason: out.fallbackReason,
        scene: out.scene,
      },
    });
    res.json({ ...out, generationId: doc._id });
  } catch (err) {
    await AIGeneration.create({
      user: req.user.userId,
      type: 'mockup',
      prompt: `${productName || productType || 'product'} (${scene})`,
      success: false,
      error: err.message,
      durationMs: Date.now() - start,
    }).catch(() => {});
    res.status(500).json({ message: err.message || 'Failed to generate mockup' });
  }
});

export default router;
