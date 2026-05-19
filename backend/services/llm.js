import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import AICache from '../models/AICache.js';

/**
 * Unified LLM service — provider-agnostic, with persistent caching.
 *
 * Goal: cut the Gemini bill to near-zero by:
 *   1. Caching responses in Mongo (survives restarts; TTL auto-expires)
 *   2. Routing text tasks to a self-hosted Ollama instance if available
 *   3. Falling back to Gemini only when local fails
 *   4. Falling back to caller-supplied static result if both fail
 *
 * The shape of the API stays the same for callers — they don't care which
 * provider responds. This lets us swap providers later without touching
 * services/aiDesign.js or services/adminInsights.js.
 *
 * Env vars:
 *   OLLAMA_URL          (default http://localhost:11434, leave blank to disable)
 *   OLLAMA_TEXT_MODEL   (default llama3.1:8b)
 *   GEMINI_API_KEY      (free tier available at https://aistudio.google.com)
 *   AI_TEXT_MODEL       (gemini model name, default gemini-2.5-flash)
 *   AI_DISABLE_CACHE    (set "true" for development/debugging)
 *
 * To enable Claude later (paid Anthropic API), see services/claudeShim.js.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || ''; // Empty disables Ollama
const OLLAMA_MODEL = process.env.OLLAMA_TEXT_MODEL || 'llama3.1:8b';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.AI_TEXT_MODEL || 'gemini-2.5-flash';
const CACHE_ENABLED = process.env.AI_DISABLE_CACHE !== 'true';

// Health state — updated on every call so admins can see what's live
const health = {
  ollama: { reachable: null, lastCheckedAt: null, lastError: '' },
  gemini: { reachable: null, lastCheckedAt: null, lastError: '' },
  cacheHits: 0,
  cacheMisses: 0,
  ollamaCalls: 0,
  geminiCalls: 0,
  fallbacks: 0,
};

const genAI = GEMINI_KEY ? new GoogleGenerativeAI(GEMINI_KEY) : null;

// ─── Cache helpers ──────────────────────────────────────────────────────────

function makeKey({ operation, model, prompt, context }) {
  const blob = [operation, model || '', prompt || '', JSON.stringify(context || {})].join('|');
  return crypto.createHash('sha256').update(blob).digest('hex');
}

async function cacheGet(key) {
  if (!CACHE_ENABLED) return null;
  try {
    const hit = await AICache.findOneAndUpdate(
      { key, expiresAt: { $gt: new Date() } },
      { $inc: { hits: 1 }, $set: { lastHitAt: new Date() } },
      { new: true }
    );
    if (hit) {
      health.cacheHits += 1;
      return hit.value;
    }
    health.cacheMisses += 1;
    return null;
  } catch (err) {
    console.warn('AICache get failed:', err.message);
    return null;
  }
}

async function cacheSet({ key, value, operation, provider, model, ttlSeconds }) {
  if (!CACHE_ENABLED) return;
  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await AICache.findOneAndUpdate(
      { key },
      { key, value, operation, provider, model, expiresAt, hits: 0 },
      { upsert: true }
    );
  } catch (err) {
    console.warn('AICache set failed:', err.message);
  }
}

// ─── Ollama provider ────────────────────────────────────────────────────────

async function callOllama({ prompt, system, maxTokens = 512, json = false }) {
  if (!OLLAMA_URL) throw new Error('OLLAMA_URL not configured');

  const start = Date.now();
  const body = {
    model: OLLAMA_MODEL,
    prompt,
    system: system || undefined,
    stream: false,
    options: { num_predict: maxTokens, temperature: 0.7 },
    format: json ? 'json' : undefined,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(`${OLLAMA_URL.replace(/\/+$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    if (!data?.response) throw new Error('Ollama returned no response');

    health.ollama = { reachable: true, lastCheckedAt: new Date(), lastError: '' };
    health.ollamaCalls += 1;
    return {
      text: String(data.response).trim(),
      durationMs: Date.now() - start,
      tokensIn: data.prompt_eval_count || 0,
      tokensOut: data.eval_count || 0,
    };
  } catch (err) {
    clearTimeout(timeout);
    health.ollama = { reachable: false, lastCheckedAt: new Date(), lastError: err.message };
    throw err;
  }
}

// ─── Gemini provider ────────────────────────────────────────────────────────

async function callGemini({ prompt, system, json = false }) {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');

  const start = Date.now();
  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      ...(system
        ? { systemInstruction: { parts: [{ text: system }], role: 'system' } }
        : {}),
    });
    const result = await model.generateContent(prompt);
    const text = String(result.response.text()).trim();
    health.gemini = { reachable: true, lastCheckedAt: new Date(), lastError: '' };
    health.geminiCalls += 1;
    return { text, durationMs: Date.now() - start };
  } catch (err) {
    health.gemini = { reachable: false, lastCheckedAt: new Date(), lastError: err.message };
    throw err;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function generateText({
  prompt,
  system = '',
  cacheTtlSeconds = 900,
  cacheContext = {},
  json = false,
  maxTokens = 512,
}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('prompt is required');
  }

  const key = makeKey({
    operation: 'text',
    model: '', // intentionally provider-agnostic so cache survives provider swaps
    prompt: (system || '') + '\n' + prompt,
    context: cacheContext,
  });

  if (cacheTtlSeconds > 0) {
    const cached = await cacheGet(key);
    if (cached) {
      return {
        text: cached.text || cached,
        provider: cached.provider || 'cache',
        model: cached.model || '',
        durationMs: 0,
        fromCache: true,
        fallback: false,
      };
    }
  }

  const errors = [];

  // 1. Ollama (free local fallback if configured)
  if (OLLAMA_URL) {
    try {
      const out = await callOllama({ prompt, system, maxTokens, json });
      if (out.text) {
        if (cacheTtlSeconds > 0) {
          await cacheSet({
            key,
            value: { text: out.text, provider: 'ollama', model: OLLAMA_MODEL },
            operation: 'text',
            provider: 'ollama',
            model: OLLAMA_MODEL,
            ttlSeconds: cacheTtlSeconds,
          });
        }
        return {
          text: out.text,
          provider: 'ollama',
          model: OLLAMA_MODEL,
          durationMs: out.durationMs,
          fromCache: false,
          fallback: false,
        };
      }
    } catch (err) {
      errors.push(`ollama: ${err.message}`);
    }
  }

  // 2. Gemini (free tier — primary path)
  if (genAI) {
    try {
      const out = await callGemini({ prompt, system, json });
      if (out.text) {
        if (cacheTtlSeconds > 0) {
          await cacheSet({
            key,
            value: { text: out.text, provider: 'gemini', model: GEMINI_MODEL },
            operation: 'text',
            provider: 'gemini',
            model: GEMINI_MODEL,
            ttlSeconds: cacheTtlSeconds,
          });
        }
        return {
          text: out.text,
          provider: 'gemini',
          model: GEMINI_MODEL,
          durationMs: out.durationMs,
          fromCache: false,
          fallback: false,
        };
      }
    } catch (err) {
      errors.push(`gemini: ${err.message}`);
    }
  }

  health.fallbacks += 1;
  const err = new Error(`All LLM providers failed: ${errors.join(' | ')}`);
  err.providers = errors;
  throw err;
}

export async function generateJSON(options) {
  const out = await generateText({ ...options, json: true });
  const cleaned = String(out.text).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try {
    return { ...out, data: JSON.parse(cleaned) };
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return { ...out, data: JSON.parse(match[0]) }; } catch { /* fall-through */ }
    }
    throw new Error('LLM returned malformed JSON');
  }
}

export async function getHealth() {
  let cacheCount = 0;
  let cacheSize = 0;
  try {
    cacheCount = await AICache.countDocuments({ expiresAt: { $gt: new Date() } });
    const sample = await AICache.find({ expiresAt: { $gt: new Date() } })
      .limit(100)
      .select('value')
      .lean();
    if (sample.length > 0) {
      const avgSize = sample.reduce((s, d) => s + JSON.stringify(d.value).length, 0) / sample.length;
      cacheSize = Math.round(avgSize * cacheCount);
    }
  } catch {
    /* non-fatal */
  }

  return {
    providers: {
      ollama: {
        configured: !!OLLAMA_URL,
        url: OLLAMA_URL || null,
        model: OLLAMA_MODEL,
        ...health.ollama,
      },
      gemini: {
        configured: !!GEMINI_KEY,
        model: GEMINI_MODEL,
        ...health.gemini,
      },
    },
    cache: {
      enabled: CACHE_ENABLED,
      count: cacheCount,
      approxBytes: cacheSize,
      hits: health.cacheHits,
      misses: health.cacheMisses,
      hitRate: health.cacheHits + health.cacheMisses > 0
        ? Math.round((health.cacheHits / (health.cacheHits + health.cacheMisses)) * 100)
        : 0,
    },
    usage: {
      ollamaCalls: health.ollamaCalls,
      geminiCalls: health.geminiCalls,
      fallbacks: health.fallbacks,
    },
  };
}

export async function purgeCache() {
  const r = await AICache.deleteMany({});
  return { deleted: r.deletedCount };
}
