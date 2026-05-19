import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude shim with a `GoogleGenerativeAI`-shaped surface.
 *
 * The codebase has several files (routes/adminAI.js, routes/chatbot.js,
 * services/aiDesign.js) that instantiate Gemini directly instead of going
 * through services/llm.js. To migrate them to Claude without touching every
 * call site, this shim exposes the exact same API contract:
 *
 *     const genAI = new GoogleGenerativeAI(apiKey);
 *     const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
 *     const result = await model.generateContent(prompt);
 *     const text = result.response.text();
 *
 * Behaves the same — under the hood it calls Claude (claude-opus-4-7 by
 * default) via the Anthropic SDK. The Gemini model string passed to
 * getGenerativeModel() is ignored; we always route to Claude.
 *
 * To switch a file: replace
 *     import { GoogleGenerativeAI } from '@google/generative-ai';
 * with
 *     import { GoogleGenerativeAI } from '../services/claudeShim.js';
 * Everything else stays.
 */

const CLAUDE_MODEL = process.env.AI_TEXT_MODEL || 'claude-opus-4-7';

class GenerativeModel {
  constructor(client, opts = {}) {
    this.client = client;
    // Capture system instruction if provided — Gemini accepts it on the
    // model, Claude accepts it on the request.
    this.systemInstruction = opts.systemInstruction || null;
  }

  /**
   * Mirror Gemini's `generateContent(prompt)` / `generateContent({contents})`
   * signatures. Returns an object with a `.response.text()` accessor that
   * matches Gemini's response shape.
   */
  async generateContent(input) {
    const prompt = this._normalizePrompt(input);
    const system = this._extractSystem();

    const response = await this.client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: system || undefined,
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: prompt }],
    });

    const text = (response.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    // Mirror Gemini's response.response.text() / response.text() interface
    return {
      response: {
        text: () => text,
        candidates: [{ content: { parts: [{ text }] } }],
      },
    };
  }

  _normalizePrompt(input) {
    // Gemini accepts: string, string[], or { contents: [...] }
    if (typeof input === 'string') return input;
    if (Array.isArray(input)) {
      return input
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part?.text) return part.text;
          if (part?.parts) return part.parts.map((p) => p.text || '').join('\n');
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    if (input?.contents) {
      return input.contents
        .map((c) => (c.parts || []).map((p) => p.text || '').join('\n'))
        .join('\n');
    }
    return String(input || '');
  }

  _extractSystem() {
    if (!this.systemInstruction) return '';
    if (typeof this.systemInstruction === 'string') return this.systemInstruction;
    if (this.systemInstruction.parts) {
      return this.systemInstruction.parts.map((p) => p.text || '').join('\n');
    }
    return '';
  }
}

export class GoogleGenerativeAI {
  constructor(apiKey) {
    // Ignore the passed-in Gemini key — we use ANTHROPIC_API_KEY from env
    // so the migration doesn't require touching .env / per-caller config.
    const anthropicKey = process.env.ANTHROPIC_API_KEY || apiKey || '';
    this.client = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;
  }

  getGenerativeModel(opts = {}) {
    if (!this.client) {
      throw new Error('ANTHROPIC_API_KEY not configured — set it in backend/.env');
    }
    return new GenerativeModel(this.client, opts);
  }
}
