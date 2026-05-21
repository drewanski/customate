import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import { generateText as llmGenerateText, generateJSON as llmGenerateJSON } from './llm.js';

/**
 * AI Design Service — Gemini wrappers tuned for product customization.
 *
 * Three jobs:
 *   1. generateDecal(prompt, style) → returns a data-URL PNG ready to drop
 *      onto the 3D product as a decal. Uses Gemini's image-capable preview
 *      model (Nano Banana). Falls back to an SVG placeholder if image gen
 *      isn't enabled on the account so the UX still demos.
 *
 *   2. suggestPrompts(category) → returns 6 short prompt ideas the customer
 *      can tap to fill the prompt box ("Birthday badge for dad", etc).
 *
 *   3. enhancePrompt(rough) → expands a 2-word user idea into a designer-
 *      grade prompt with style + composition cues.
 *
 * The service caches identical prompts in memory for the duration of the
 * process — important because customers often regenerate the same prompt
 * trying to get a slightly different look. (Future: persist to Redis.)
 */

const API_KEY = process.env.GEMINI_API_KEY;
const TEXT_MODEL = process.env.AI_TEXT_MODEL || 'gemini-2.5-flash';
/**
 * Image-gen model fallback chain. Different Google API keys / regions enable
 * different model names at different times. We try the configured one first
 * (or the default), then walk down the list until one works. Final fallback
 * is the SVG placeholder.
 *
 * Verified against `models?key=...` listing (May 2026):
 *   - gemini-2.5-flash-image       — workhorse, ~$0.039/image, supports generateContent
 *   - gemini-3-pro-image-preview   — higher quality, supports generateContent
 *   - gemini-3.1-flash-image-preview — newest fast model
 *
 * Note: Imagen 4 models (imagen-4.0-*) only support the `predict` endpoint,
 * which is a different SDK shape from generateContent. They are intentionally
 * NOT in this list — the Google SDK call below uses generateContent and would
 * 404 on Imagen. Add Imagen support via a separate code path if needed later.
 */
const IMAGE_MODELS = [
  process.env.AI_IMAGE_MODEL,
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
].filter(Boolean);
const IMAGE_MODEL = IMAGE_MODELS[0];

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// In-memory cache: prompt-hash → result. Hour TTL so the same prompt twice
// in a short period doesn't double-bill us.
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;
function cacheKey(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}
function cacheSet(key, value) {
  cache.set(key, { ts: Date.now(), value });
  // Light eviction so memory doesn't grow forever
  if (cache.size > 200) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
    if (oldest) cache.delete(oldest);
  }
}

/**
 * Wrap a user's rough idea in a designer-quality prompt. We DO NOT pass the
 * raw user text into Gemini because consumers tend to write "logo for me"
 * which generates garbage. Instead we always sandwich it in a structured
 * prompt that requests:
 *   - high contrast, transparent or solid background (good for decals)
 *   - centered composition, clean edges
 *   - the chosen style
 */
function buildImagePrompt(userPrompt, style = 'minimalist') {
  const stylePresets = {
    minimalist: 'flat minimalist vector style, clean geometric shapes, single colour or limited palette, generous negative space',
    vintage: 'vintage retro illustration style, distressed textures, muted earth tones, hand-drawn line work',
    bold: 'bold pop-art style, thick black outlines, vibrant flat colours, screen-print look',
    watercolor: 'soft watercolor illustration, gentle washes of colour, painterly edges',
    neon: 'neon glow effect on dark background, electric colours, retro-futuristic aesthetic',
    cartoon: 'fun cartoon character style, expressive features, bright friendly colours',
    badge: 'circular badge or emblem layout, banner ribbon, classic insignia composition',
    monoline: 'single continuous line illustration, monoline style, no fills, clean and elegant',
  };
  const styleDesc = stylePresets[style] || stylePresets.minimalist;

  return [
    `Create a die-cut sticker design suitable for screen-printing or heat-transfer onto apparel.`,
    `Concept: ${String(userPrompt).slice(0, 200).trim()}`,
    `Style: ${styleDesc}.`,
    `Composition: a single, centered subject with a CLEAN SILHOUETTE — readable at a glance, no scene around it.`,
    `Background: PURE WHITE only (RGB 255,255,255), no gradient, no shadow, no texture. The white area will be removed in post-processing to produce a transparent-background sticker.`,
    `Edges: hard, well-defined outlines so the cutout edge is crisp.`,
    `Output a square image with the design occupying ~75% of the frame, surrounded by clean white margin.`,
    `Avoid: text unless explicitly requested, photographic detail, gradients into the background, drop shadows, watermarks, busy compositions, multiple subjects, frames/borders.`,
  ].join('\n');
}

/**
 * Generate one decal image. Returns:
 *   { dataUrl, model, durationMs, fromCache, fallback }
 *
 * If the configured image model isn't reachable (no permission on the API
 * key, model name changed, network error), we return a placeholder SVG so
 * the frontend can still render a "demo" result and the UX is testable.
 */
export async function generateDecal({ prompt, style = 'minimalist' }) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('Prompt is required');
  }
  if (!genAI) {
    // No API key configured — return a clearly-labeled placeholder
    return placeholderDecal(prompt, style, 'No GEMINI_API_KEY configured on server');
  }

  const fullPrompt = buildImagePrompt(prompt, style);
  const key = cacheKey(['decal', IMAGE_MODEL, fullPrompt]);
  const cached = cacheGet(key);
  if (cached) return { ...cached, fromCache: true };

  const start = Date.now();
  // Walk the fallback chain — many Google keys enable different models.
  const errors = [];
  for (const modelName of IMAGE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([fullPrompt]);
      const response = result.response;

      let dataUrl = null;
      const parts = response?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          dataUrl = `data:${mime};base64,${part.inlineData.data}`;
          break;
        }
      }
      if (!dataUrl) {
        errors.push(`${modelName}: no inline image returned`);
        continue;
      }

      const out = {
        dataUrl,
        model: modelName,
        durationMs: Date.now() - start,
        fromCache: false,
        fallback: false,
      };
      cacheSet(key, out);
      return out;
    } catch (err) {
      errors.push(`${modelName}: ${err.message}`);
      // 404 / 403 — try next model. 429 (quota) — fail fast.
      if (err.message?.includes('429') || err.message?.includes('quota')) {
        break;
      }
    }
  }
  console.error('generateDecal — all image models failed:', errors.join(' | '));
  return placeholderDecal(prompt, style, errors[errors.length - 1] || 'No image model available');
}

/**
 * SVG-based placeholder so the demo still works when image generation isn't
 * available on the API key. Encodes the user's prompt as a stylised badge so
 * the result feels intentional rather than broken.
 */
function placeholderDecal(prompt, style, reason) {
  const initials = String(prompt)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'AI';
  const palette =
    style === 'neon' ? { bg: '#0f172a', ring: '#22d3ee', fg: '#a78bfa' } :
    style === 'vintage' ? { bg: '#f5efe6', ring: '#92400e', fg: '#451a03' } :
    style === 'watercolor' ? { bg: '#f0f9ff', ring: '#3b82f6', fg: '#1e3a8a' } :
    style === 'bold' ? { bg: '#fde047', ring: '#000', fg: '#000' } :
    { bg: '#ffffff', ring: '#0f172a', fg: '#0f172a' };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><filter id="b"><feGaussianBlur stdDeviation="6"/></filter></defs><rect width="512" height="512" fill="${palette.bg}"/><circle cx="256" cy="256" r="200" fill="none" stroke="${palette.ring}" stroke-width="8"/><circle cx="256" cy="256" r="170" fill="none" stroke="${palette.ring}" stroke-width="2"/><text x="256" y="290" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="160" font-weight="900" fill="${palette.fg}">${initials}</text><text x="256" y="430" text-anchor="middle" font-family="Inter, sans-serif" font-size="22" font-weight="700" letter-spacing="6" fill="${palette.fg}">${String(prompt).slice(0, 28).toUpperCase()}</text></svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return {
    dataUrl,
    model: 'placeholder-svg',
    durationMs: 0,
    fromCache: false,
    fallback: true,
    fallbackReason: reason,
  };
}

/**
 * Return six prompt-completion suggestions for the chosen category. Pure
 * text-completion — cheap, fast, cached.
 */
export async function suggestPrompts({ category = 'general', count = 6 } = {}) {
  try {
    const prompt = `Suggest ${count} short prompt ideas a customer could use to create a printable design for the "${category}" category on a custom merch shop. Each prompt must be 4-9 words, evocative, specific, and ready to feed to an image model. Return ONLY a JSON array of strings, no markdown.`;
    const out = await llmGenerateText({
      prompt,
      cacheTtlSeconds: 24 * 60 * 60, // suggestions are stable for a day
      cacheContext: { op: 'suggest', category, count },
      maxTokens: 256,
    });
    const cleaned = out.text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return staticSuggestions(category, count);
    }
    return {
      suggestions: parsed.slice(0, count),
      model: out.model,
      provider: out.provider,
      fromCache: out.fromCache,
      fallback: false,
    };
  } catch (err) {
    console.error('suggestPrompts error:', err.message);
    return staticSuggestions(category, count);
  }
}

/** Hand-written fallbacks per category. */
function staticSuggestions(category, count) {
  const map = {
    general: [
      'Minimalist mountain logo with sun',
      'Retro vinyl record badge',
      'Bold cat silhouette with stars',
      'Watercolor coffee cup illustration',
      'Vintage bicycle emblem',
      'Geometric wolf head outline',
    ],
    sports: [
      'Aggressive eagle mascot logo',
      'Vintage college varsity letter',
      'Lightning bolt championship badge',
      'Bold basketball flame design',
      'Retro stadium banner',
      'Minimal trophy emblem',
    ],
    birthday: [
      'Birthday cake with candles burst',
      'Confetti party badge',
      'Cute balloon bouquet',
      'Vintage "Happy Birthday" ribbon',
      'Sparkly age number 30',
      'Cartoon party hat illustration',
    ],
    apparel: [
      'Surfing wave silhouette',
      'Tropical palm tree sunset',
      'Skateboard graphic vintage',
      'Hand-drawn flower bouquet',
      'Minimal heart with arrow',
      'Bold abstract triangle shape',
    ],
    accessories: [
      'Watercolor wildflower bouquet',
      'Astronaut riding a unicorn',
      'Cute pet portrait sketch',
      'Vintage compass illustration',
      'Geometric mandala pattern',
      'Single line cat drawing',
    ],
  };
  const list = map[category] || map.general;
  return { suggestions: list.slice(0, count), model: 'static', fromCache: false, fallback: true };
}

/**
 * Expand a 2-3 word user idea into a richer prompt the user can preview and
 * tweak before generating. Useful for non-designers who don't know what to
 * type.
 */
export async function enhancePrompt({ prompt }) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('Prompt is required');
  }
  try {
    const out = await llmGenerateText({
      prompt: `Rewrite the following design idea into a clear, concise prompt for an AI image generator that makes printable apparel decals. Keep it to one sentence (max 25 words). Add visual specifics (style, mood, composition) but do NOT name a specific artist or brand. Return ONLY the rewritten prompt, no quotes or extra text.\n\nIdea: ${prompt}`,
      cacheTtlSeconds: 7 * 24 * 60 * 60, // same idea always enhances the same way
      cacheContext: { op: 'enhance', prompt: prompt.trim() },
      maxTokens: 100,
    });
    return {
      enhanced: out.text.replace(/^["'`]|["'`]$/g, ''),
      model: out.model,
      provider: out.provider,
      fromCache: out.fromCache,
    };
  } catch (err) {
    console.error('enhancePrompt error:', err.message);
    return { enhanced: prompt, model: 'noop', error: err.message };
  }
}

export const AI_DESIGN_STYLES = ['minimalist', 'vintage', 'bold', 'watercolor', 'neon', 'cartoon', 'badge', 'monoline'];

// ─── Image-to-image: background removal ────────────────────────────────────
//
// Re-uses the same image-capable Gemini model with a directive to strip the
// background and output a transparent/white-bg cleaned version. Falls back
// to the original image if the model fails — the user is no worse off than
// before they clicked the button.
//

/**
 * Strip the background from a customer-uploaded image.
 *
 * Accepts either a data URL or a raw base64 string. Returns:
 *   { dataUrl, model, durationMs, fromCache, fallback }
 *
 * Implementation note: many BG-removal libraries require ONNX models and
 * hefty native deps. By leveraging the same Gemini multimodal model we
 * already use for generation, we keep the backend small and avoid adding
 * a 100MB+ runtime dependency.
 */
export async function removeBackground({ imageData }) {
  if (!imageData) throw new Error('imageData is required');
  if (!genAI) {
    return { dataUrl: imageData, model: 'noop', durationMs: 0, fromCache: false, fallback: true, fallbackReason: 'No GEMINI_API_KEY' };
  }

  // Parse to { mime, base64 } — accept both data URLs and raw base64
  const { mime, base64 } = parseImage(imageData);
  if (!base64) {
    return { dataUrl: imageData, model: 'noop', durationMs: 0, fallback: true, fallbackReason: 'Could not parse image' };
  }

  const key = cacheKey(['bgremove', IMAGE_MODEL, base64.slice(0, 64)]);
  const cached = cacheGet(key);
  if (cached) return { ...cached, fromCache: true };

  const directive = [
    'Remove the background from this image completely.',
    'Output: same subject preserved exactly, on a pure white or transparent background.',
    'Do not change the subject — preserve its colors, edges, and proportions.',
    'No new elements. No watermarks. No text. The result should look like a clean cutout suitable for printing on apparel.',
  ].join(' ');

  const start = Date.now();
  const errors = [];
  for (const modelName of IMAGE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { mimeType: mime, data: base64 } },
        directive,
      ]);
      let dataUrl = null;
      const parts = result.response?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          dataUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
      if (!dataUrl) {
        errors.push(`${modelName}: no image returned`);
        continue;
      }
      const out = { dataUrl, model: modelName, durationMs: Date.now() - start, fromCache: false, fallback: false };
      cacheSet(key, out);
      return out;
    } catch (err) {
      errors.push(`${modelName}: ${err.message}`);
      if (err.message?.includes('429')) break;
    }
  }

  // Hard fallback — return the original so the UX doesn't break
  console.error('removeBackground — all models failed:', errors.join(' | '));
  return {
    dataUrl: imageData,
    model: 'passthrough',
    durationMs: Date.now() - start,
    fallback: true,
    fallbackReason: errors[errors.length - 1] || 'unavailable',
  };
}

// ─── Image-to-image: variations ────────────────────────────────────────────
//
// Given an existing decal image, produces N stylistic variations so the
// customer can iterate without writing a new prompt. Each variation goes
// through the IMAGE_MODELS fallback chain. Variations are returned even if
// some fail (best-effort batch).

const VARIATION_NUDGES = [
  'Same concept but in a different color palette',
  'Same concept rendered in a bolder, thicker line style',
  'Same concept with a softer, more playful aesthetic',
  'Same concept with a vintage retro feel',
  'Same concept as a clean monoline single-line drawing',
];

export async function generateVariations({ originalImage, prompt, style, count = 3 }) {
  if (!originalImage) throw new Error('originalImage is required');
  if (!genAI) {
    return { variations: [], model: 'noop', fallback: true };
  }
  const { mime, base64 } = parseImage(originalImage);
  if (!base64) return { variations: [], model: 'noop', fallback: true };

  const n = Math.max(1, Math.min(4, Number(count) || 3));
  const nudges = VARIATION_NUDGES.slice(0, n);

  const results = [];
  for (const nudge of nudges) {
    const directive = [
      `Create a variation of the provided design.`,
      nudge + '.',
      `Original concept: ${(prompt || 'merchandise decal').slice(0, 120)}.`,
      `Keep the same subject and composition. Make it suitable for printing on apparel — high contrast, solid white or transparent background.`,
    ].join(' ');

    const start = Date.now();
    let succeeded = null;
    for (const modelName of IMAGE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent([
          { inlineData: { mimeType: mime, data: base64 } },
          directive,
        ]);
        const parts = result.response?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            succeeded = {
              dataUrl: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`,
              model: modelName,
              durationMs: Date.now() - start,
              nudge,
            };
            break;
          }
        }
        if (succeeded) break;
      } catch (err) {
        if (err.message?.includes('429')) break;
      }
    }
    if (succeeded) {
      results.push(succeeded);
    } else {
      // Fallback: produce a placeholder so the grid stays the right size
      const ph = placeholderDecal(prompt || 'variation', style || 'minimalist', 'variation model unavailable');
      results.push({ dataUrl: ph.dataUrl, model: ph.model, durationMs: 0, nudge, fallback: true });
    }
  }

  return {
    variations: results,
    model: results[0]?.model || 'unknown',
    fallback: results.every((r) => r.fallback),
  };
}

// ─── Vision: design critique ───────────────────────────────────────────────
//
// Takes a screenshot of the customer's current 3D design preview and asks
// Gemini to provide three concrete, actionable tips. We keep the output
// structured as a JSON array so the UI can render each tip as a card with
// an icon and confidence level.

export async function critiqueDesign({ imageData, productName, designContext }) {
  if (!imageData) throw new Error('imageData is required');
  if (!genAI) return staticCritique();
  const { mime, base64 } = parseImage(imageData);
  if (!base64) return staticCritique();

  const start = Date.now();
  try {
    const model = genAI.getGenerativeModel({ model: TEXT_MODEL });
    const prompt = [
      `You are a senior apparel/merch designer reviewing a customer's design on a ${productName || 'product'}.`,
      designContext ? `Design context: ${designContext}.` : '',
      `Look at the image and give exactly 3 short, specific, actionable tips to improve the design.`,
      `For each tip return: { "title": short headline (max 6 words), "tip": 1-sentence concrete suggestion (max 22 words), "category": one of "placement", "color", "size", "contrast", "composition", "style" }.`,
      `Return ONLY valid JSON of shape { "tips": [...] }. No markdown fences, no other text.`,
    ].filter(Boolean).join('\n');

    const result = await model.generateContent([
      { inlineData: { mimeType: mime, data: base64 } },
      prompt,
    ]);
    const text = result.response.text().trim();
    const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!parsed?.tips || !Array.isArray(parsed.tips) || parsed.tips.length === 0) {
      return staticCritique();
    }
    return {
      tips: parsed.tips.slice(0, 3),
      model: TEXT_MODEL,
      durationMs: Date.now() - start,
      fallback: false,
    };
  } catch (err) {
    console.error('critiqueDesign error:', err.message);
    return staticCritique();
  }
}

/** Hand-written fallback tips when Gemini Vision is unavailable. */
function staticCritique() {
  return {
    tips: [
      { title: 'Add some breathing room', tip: 'Try shrinking the design by 10–15% — designs often look more polished with more negative space around them.', category: 'size' },
      { title: 'Check the contrast', tip: "If your design's main color is light, place it on a darker product color (or vice versa) for stronger visual impact.", category: 'contrast' },
      { title: 'Centre or commit to a corner', tip: 'Center-front placement reads as classic. Off-center (chest or sleeve) reads as modern — avoid the awkward middle ground.', category: 'placement' },
    ],
    model: 'static',
    fallback: true,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse either a data URL ("data:image/png;base64,xxx") or a bare base64
 * string into { mime, base64 } so Gemini's inlineData can consume it.
 */
// ─── Lifestyle / mockup generation ─────────────────────────────────────────
//
// Takes the customer's finished design (a canvas snapshot of the 3D product
// with their decals applied) and asks Gemini to render it as a realistic
// lifestyle photo — model wearing the shirt, mug on a desk, tote on someone's
// shoulder, etc. This is the "wow" moment that converts to a checkout, and
// it doubles as shareable social content.
//
// Scenes are deliberately curated rather than free-form because (a) it gives
// Gemini a reliable composition prompt that doesn't go off the rails, and
// (b) admins can tune the scene list for their brand voice without retraining.

const MOCKUP_SCENES = {
  // Apparel scenes — model wearing the product
  shirt: {
    default: 'A natural-looking lifestyle photograph of a person wearing this exact shirt. Soft daylight, neutral urban background (a coffee shop interior or a tree-lined sidewalk). Three-quarter angle, hands relaxed at their sides. Photo-realistic, magazine-quality, shallow depth of field.',
    studio: 'A clean studio photograph of a person modeling this exact shirt against a soft gray seamless backdrop. Even softbox lighting. Confident relaxed pose. Editorial fashion lookbook style.',
    outdoor: 'A candid lifestyle photo of a person wearing this exact shirt outside on a sunny day. Walking through a park or city street. Warm golden-hour lighting. Authentic, unposed feel.',
  },
  jersey: {
    default: 'A dynamic action photograph of an athlete wearing this exact jersey. Sports field or gym setting. Mid-motion pose. Dramatic lighting suggesting intensity and performance.',
  },
  // Drinkware
  mug: {
    default: 'A cozy lifestyle photograph showing this exact mug filled with hot coffee on a wooden table. Steam gently rising. Morning sunlight from a window. A book and laptop softly out of focus in the background. Warm and inviting mood.',
    desk: 'This exact mug placed on a clean modern desk, half-full of espresso, beside a laptop. Office product photography style, top-down 3/4 angle, soft natural light.',
  },
  tumbler: {
    default: 'A lifestyle photograph of someone holding this exact tumbler outdoors, with a scenic mountain or beach backdrop blurred behind. Natural light, active lifestyle vibe.',
  },
  // Bags
  tote: {
    default: 'A street-style photograph of a person carrying this exact tote bag over their shoulder while walking through a city. Daylight, candid, authentic.',
    flatlay: 'A clean flat-lay photograph of this exact tote bag arranged with everyday items beside it (notebook, sunglasses, keys, a coffee). Top-down view, soft natural light, minimalist aesthetic.',
  },
  // Accessories
  mousepad: {
    default: 'A clean photograph of this exact mousepad on a sleek desk setup, with a wireless mouse on top, mechanical keyboard at the edge of the frame. Professional gaming/workspace aesthetic. Soft side-lighting.',
  },
  fan: {
    default: 'A lifestyle photograph of someone holding this exact hand fan, partly open, with their face softly out of focus. Warm summer light. Casual elegant mood.',
  },
};

/**
 * Pick the best scene description for the given product type + optional
 * scene-style override. Falls back gracefully if the product type isn't
 * in the table.
 */
/**
 * Normalize free-form product categories ("T-Shirts", "Drinkware", "Bags &
 * Accessories") to a stable scene-table key. Mirrors the resolver used by
 * the 3D customizer so the mockup picks the right scene for the same input.
 */
function normalizeProductType(input) {
  const k = String(input || '').toLowerCase();
  if (!k) return 'shirt';
  if (k.includes('shirt') || k.includes('tee') || k.includes('apparel') || k.includes('clothing')) return 'shirt';
  if (k.includes('jersey')) return 'jersey';
  if (k.includes('tumbler')) return 'tumbler';
  if (k.includes('mug') || k.includes('drinkware') || k.includes('cup')) return 'mug';
  if (k.includes('mouse') || k.includes('mousepad') || k.includes('pad')) return 'mousepad';
  if (k.includes('tote') || k.includes('bag') || k.includes('pouch') || k.includes('purse')) return 'tote';
  if (k.includes('fan')) return 'fan';
  if (k.includes('accessor') || k.includes('promo')) return 'shirt'; // safest catch-all
  return MOCKUP_SCENES[k] ? k : 'shirt';
}

function pickMockupScene(productType, scene) {
  const key = normalizeProductType(productType);
  const product = MOCKUP_SCENES[key] || MOCKUP_SCENES.shirt;
  return product[scene] || product.default;
}

/**
 * Wearable products = ones that go on a human body. Body-size presets only
 * make sense for these — putting a "slim build" preset on a mug would just
 * confuse Gemini.
 */
const WEARABLE_TYPES = new Set(['shirt', 'jersey']);

export function isWearable(productType) {
  return WEARABLE_TYPES.has(normalizeProductType(productType));
}

/**
 * Body-size presets for wearables. Maps a stable key (the UI sends these
 * as chip values) to a concrete physical description Gemini can render
 * reliably. Includes both build and height where useful — Gemini interprets
 * "slim" alone ambiguously, but "slim build, average height ~5'10''" is
 * unambiguous.
 *
 * Carefully neutral on gender + ethnicity to avoid bias in defaults; the
 * customer can override with the free-text `customDescription` field.
 */
export const BODY_SIZE_PRESETS = {
  slim: 'slim build, lean physique, average height around 5\'10"',
  medium: 'average build, balanced proportions, average height around 5\'9"',
  athletic: 'athletic build, toned and muscular, around 6\' tall',
  large: 'broader build, larger frame, around 6\' tall',
  plus: 'fuller, plus-size figure, confident posture, average height',
  petite: 'petite build, smaller frame, around 5\'4"',
};

export function listBodySizes() {
  return Object.keys(BODY_SIZE_PRESETS);
}

/**
 * Generate a lifestyle / mockup photograph of the customer's finished design.
 *
 * Input:
 *   designImage        — data URL of the canvas snapshot (the 3D product with
 *                        decals applied). Becomes the visual reference Gemini
 *                        re-paints into a realistic scene.
 *   productType        — 'shirt' | 'mug' | 'tote' | ... (drives scene selection)
 *   productName        — human-friendly label, included in the prompt for context
 *   scene              — optional preset: 'default' | 'studio' | 'outdoor' | etc.
 *   bodySize           — wearable-only preset: 'slim' | 'medium' | 'athletic' |
 *                        'large' | 'plus' | 'petite'. Ignored for non-wearables.
 *   customDescription  — free-text override the customer typed into the modal
 *                        ("middle-aged man with a beard", "woman walking on a
 *                        beach at sunset", etc.). Appended to the directive
 *                        verbatim — gives the customer total control. Capped
 *                        at 300 chars to prevent prompt-injection style abuse.
 *
 * Output:
 *   { dataUrl, model, durationMs, fromCache, fallback, scene, bodySize }
 */
export async function generateMockup({
  designImage,
  productType,
  productName,
  scene = 'default',
  bodySize = '',
  customDescription = '',
}) {
  if (!designImage) throw new Error('designImage is required');
  if (!genAI) {
    return {
      dataUrl: designImage,
      model: 'noop',
      durationMs: 0,
      fromCache: false,
      fallback: true,
      fallbackReason: 'No GEMINI_API_KEY configured',
      scene,
    };
  }

  const { mime, base64 } = parseImage(designImage);
  if (!base64) {
    return {
      dataUrl: designImage,
      model: 'noop',
      durationMs: 0,
      fallback: true,
      fallbackReason: 'Could not parse design image',
      scene,
    };
  }

  const sceneDesc = pickMockupScene(productType, scene);
  const isWear = isWearable(productType);

  // Body-size addition — wearables only. Non-wearables (mug, tote) get nothing
  // for this slot so Gemini doesn't try to insert a model where there shouldn't
  // be one (e.g. "slim build" doesn't make sense on a mug photo).
  const bodySizeDesc =
    isWear && bodySize && BODY_SIZE_PRESETS[bodySize]
      ? `Model build: ${BODY_SIZE_PRESETS[bodySize]}.`
      : '';

  // Free-text custom override. Capped to 300 chars to keep the prompt
  // bounded and reduce risk of prompt-injection (the user can't sneak in
  // "ignore all previous instructions" + a 5K essay).
  const customSafe = String(customDescription || '').slice(0, 300).trim();
  const customLine = customSafe
    ? `Additional direction from the customer: ${customSafe}.`
    : '';

  const directive = [
    `Generate a photo-realistic lifestyle product photograph.`,
    `The provided image shows the customer's customized ${productName || productType || 'product'} with their personal design printed on it.`,
    `Recreate it as: ${sceneDesc}`,
    bodySizeDesc,
    customLine,
    `CRITICAL constraints:`,
    `- Preserve the printed design on the product EXACTLY as shown in the input image. Do not redraw, restyle, or reinterpret the design. The colors, shapes, text, and placement of the artwork must match the input perfectly.`,
    `- The product itself (shape, color, material) must remain accurate to the input.`,
    `- Only the scene around the product (lighting, background, model pose, environment) should be generated.`,
    `- Output a single square image, no watermarks, no text overlays, no logos other than what is on the product.`,
  ].filter(Boolean).join('\n');

  // Cache key: same design + same product + same scene + same body/custom →
  // reuse. We hash just the first 64 chars of the base64 (sufficient to
  // disambiguate user designs without storing megabytes of image data in
  // the cache key) and a short hash of the custom text for full-fidelity.
  const customHash = customSafe ? crypto.createHash('sha1').update(customSafe).digest('hex').slice(0, 12) : '';
  const key = cacheKey(['mockup', productType, scene, bodySize || '', customHash, base64.slice(0, 64)]);
  const cached = cacheGet(key);
  if (cached) return { ...cached, fromCache: true };

  const start = Date.now();
  const errors = [];
  for (const modelName of IMAGE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        { inlineData: { mimeType: mime, data: base64 } },
        directive,
      ]);
      let dataUrl = null;
      const parts = result.response?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          dataUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          break;
        }
      }
      if (!dataUrl) {
        errors.push(`${modelName}: no image returned`);
        continue;
      }
      const out = {
        dataUrl,
        model: modelName,
        durationMs: Date.now() - start,
        fromCache: false,
        fallback: false,
        scene,
        bodySize: isWear ? bodySize : '',
        customDescription: customSafe,
      };
      cacheSet(key, out);
      return out;
    } catch (err) {
      errors.push(`${modelName}: ${err.message}`);
      // Quota / rate limit — fail fast, don't waste retries
      if (err.message?.includes('429') || err.message?.includes('quota')) break;
    }
  }

  console.error('generateMockup — all models failed:', errors.join(' | '));
  return {
    dataUrl: designImage,
    model: 'passthrough',
    durationMs: Date.now() - start,
    fallback: true,
    fallbackReason: errors[errors.length - 1] || 'No image model available',
    scene,
  };
}

/**
 * List the available scenes for a given product type — drives the UI scene
 * picker so customers can choose "studio shot" vs "lifestyle outdoor" etc.
 */
export function listMockupScenes(productType) {
  const key = normalizeProductType(productType);
  const product = MOCKUP_SCENES[key] || MOCKUP_SCENES.shirt;
  return Object.keys(product);
}

function parseImage(input) {
  if (!input || typeof input !== 'string') return { mime: '', base64: '' };
  if (input.startsWith('data:')) {
    const [meta, b64] = input.split(',');
    const mime = meta.match(/data:([^;]+)/)?.[1] || 'image/png';
    return { mime, base64: b64 || '' };
  }
  return { mime: 'image/png', base64: input };
}
