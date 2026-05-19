import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Wand2,
  Loader2,
  ChevronRight,
  Lightbulb,
  Palette,
  AlertCircle,
  CheckCircle2,
  Zap,
  Image as ImageIcon,
  LogIn,
  Lock,
} from 'lucide-react';
import {
  aiGetUsage,
  aiGetHistory,
  aiSuggestPrompts,
  aiEnhancePrompt,
  aiGenerateDecal,
  aiGenerateVariations,
} from '../api';

interface Props {
  /** The product category (Apparel, Drinkware, etc.) — used to seed prompt suggestions */
  productCategory?: string;
  /** Called when the user picks a generated image to apply as the decal */
  onApply: (dataUrl: string, meta: { prompt: string; style: string }) => void;
}

const STYLES: Array<{ id: string; label: string; tint: string; emoji: string }> = [
  { id: 'minimalist', label: 'Minimalist', tint: 'from-slate-500 to-slate-700', emoji: '◯' },
  { id: 'bold', label: 'Bold', tint: 'from-amber-500 to-red-500', emoji: '⚡' },
  { id: 'vintage', label: 'Vintage', tint: 'from-amber-700 to-orange-700', emoji: '🪶' },
  { id: 'watercolor', label: 'Watercolor', tint: 'from-blue-400 to-purple-400', emoji: '🎨' },
  { id: 'neon', label: 'Neon', tint: 'from-fuchsia-500 to-cyan-400', emoji: '✨' },
  { id: 'cartoon', label: 'Cartoon', tint: 'from-orange-400 to-pink-500', emoji: '🎭' },
  { id: 'badge', label: 'Badge', tint: 'from-emerald-500 to-teal-600', emoji: '🛡' },
  { id: 'monoline', label: 'Monoline', tint: 'from-indigo-500 to-purple-600', emoji: '〰️' },
];

function categoryKey(c?: string) {
  const map: Record<string, string> = {
    apparel: 'apparel',
    drinkware: 'apparel',
    bags: 'apparel',
    accessories: 'accessories',
    stationery: 'accessories',
  };
  return map[(c || '').toLowerCase()] || 'general';
}

/**
 * AI Design Assistant — embedded in the Customization Studio sidebar.
 *
 * Flow:
 *  1. Component mounts → fetch quota usage + recent history + category-aware suggestions
 *  2. User types a prompt OR taps a suggestion chip
 *  3. (Optional) "Enhance" button rewrites the prompt into something better
 *  4. User picks a style chip
 *  5. Click Generate → backend → image dataURL → showcased + added to history
 *  6. User clicks the image → applied as the product decal via onApply()
 */
/**
 * Guest CTA — shown when no token is present. Image gen is expensive and
 * we don't want to give it away anonymously; the rest of the studio remains
 * free. Pulled out into its own component so the main one keeps hooks at the
 * top (React rule-of-hooks compliance).
 */
function AIGuestCTA() {
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-fuchsia-500 to-orange-400 p-5 text-white">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center mb-3">
            <Wand2 className="w-6 h-6" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">AI Design Assistant</p>
          <h3 className="text-lg font-black mt-1 leading-tight">Generate one-of-a-kind decals from text</h3>
          <p className="text-[12px] text-white/85 mt-2 leading-snug">
            Describe what you want and let AI sketch it for you — perfect for when you don't have artwork on hand.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {[
          { icon: Sparkles, text: 'Describe a design in plain English' },
          { icon: Palette, text: '8 styles — minimalist, vintage, bold, neon…' },
          { icon: Lightbulb, text: 'Smart suggestions for your product category' },
          { icon: ImageIcon, text: 'One click to apply to your product' },
        ].map((f, i) => (
          <li key={i} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50">
            <f.icon className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-slate-700">{f.text}</span>
          </li>
        ))}
      </ul>

      <Link
        to="/login"
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-500 hover:opacity-95 shadow-lg shadow-purple-500/20 transition"
      >
        <LogIn className="w-4 h-4" />
        Sign in to unlock AI
        <ChevronRight className="w-4 h-4" />
      </Link>

      <p className="text-[11px] text-center text-slate-500">
        New here?{' '}
        <Link to="/register" className="font-bold text-purple-600 hover:text-purple-700 underline underline-offset-2">
          Create a free account
        </Link>
      </p>

      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
        <Lock className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-slate-600 leading-snug">
          Customization, text, image upload and 3D preview are <strong>fully free</strong> to try as a guest — only AI generation and ordering need an account.
        </p>
      </div>
    </div>
  );
}

export function AIDesignAssistant({ productCategory, onApply }: Props) {
  // Detect auth state ONCE at component mount. Using state keeps the value
  // stable for this instance's lifetime — when the user signs in, the parent
  // page navigation will remount this component.
  const [isAuthenticated] = useState(
    () => typeof window !== 'undefined' && !!localStorage.getItem('token')
  );

  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('minimalist');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [currentImage, setCurrentImage] = useState<{ url: string; meta: any } | null>(null);
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  const [generating, setGenerating] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [variating, setVariating] = useState(false);
  const [variations, setVariations] = useState<Array<{ url: string; nudge?: string; fallback?: boolean }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const cat = categoryKey(productCategory);

  // Initial load — usage + history + suggestions.
  // Skipped for guests since these endpoints require auth.
  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const [usageRes, historyRes] = await Promise.all([
          aiGetUsage().catch(() => null),
          aiGetHistory(8).catch(() => []),
        ]);
        if (usageRes) setUsage(usageRes.usage?.decal_image || null);
        setHistory(Array.isArray(historyRes) ? historyRes : []);
      } catch {
        /* non-fatal */
      }
    })();
  }, [isAuthenticated]);

  // Refresh suggestions when category changes
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      setLoadingSuggestions(true);
      try {
        const res = await aiSuggestPrompts(cat, 6);
        if (!cancelled) setSuggestions(Array.isArray(res.suggestions) ? res.suggestions : []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cat, isAuthenticated]);

  // Guest? Render the upsell card and skip all the live UI below.
  if (!isAuthenticated) {
    return <AIGuestCTA />;
  }

  const handleSuggestionPick = (s: string) => {
    setPrompt(s);
    promptInputRef.current?.focus();
  };

  const handleEnhance = async () => {
    if (!prompt.trim() || enhancing) return;
    setError(null);
    setEnhancing(true);
    try {
      const res = await aiEnhancePrompt(prompt.trim());
      if (res.enhanced) setPrompt(res.enhanced);
    } catch (err: any) {
      setError(err.message || 'Could not enhance prompt');
    } finally {
      setEnhancing(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;
    setError(null);
    setSuccess(null);
    setGenerating(true);
    try {
      const res = await aiGenerateDecal(prompt.trim(), style);
      const item = { url: res.dataUrl, meta: { prompt: prompt.trim(), style, fallback: !!res.fallback, model: res.model } };
      setCurrentImage(item);
      setHistory((prev) => [{ resultUrl: res.dataUrl, prompt: prompt.trim(), style, createdAt: new Date().toISOString() }, ...prev].slice(0, 12));

      // Refresh quota silently
      aiGetUsage().then((u) => u?.usage?.decal_image && setUsage(u.usage.decal_image)).catch(() => {});

      if (res.fallback) {
        setSuccess('Demo design generated (Gemini image gen unavailable on this key)');
      } else {
        setSuccess('Design generated — click the image to apply it');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = (url: string, meta: any) => {
    onApply(url, { prompt: meta?.prompt || prompt, style: meta?.style || style });
    setSuccess('Applied to your product!');
  };

  /**
   * Image-to-image: generate 3 variations of the current image. Each
   * variation counts against the daily image quota.
   */
  const handleVariations = async () => {
    if (!currentImage || variating) return;
    setError(null);
    setSuccess(null);
    setVariating(true);
    setVariations([]);
    try {
      const res = await aiGenerateVariations({
        image: currentImage.url,
        prompt: currentImage.meta?.prompt || prompt,
        style: currentImage.meta?.style || style,
        count: 3,
      });
      const items = (res.variations || []).map((v: any) => ({
        url: v.dataUrl,
        nudge: v.nudge,
        fallback: v.fallback,
      }));
      setVariations(items);
      // Refresh quota silently
      aiGetUsage().then((u) => u?.usage?.decal_image && setUsage(u.usage.decal_image)).catch(() => {});
      if (res.fallback) {
        setSuccess('Variations generated (demo mode — Gemini image gen unavailable)');
      } else if (items.length > 0) {
        setSuccess(`${items.length} variation${items.length === 1 ? '' : 's'} ready — click any to apply`);
      } else {
        setError('Could not generate variations');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate variations');
    } finally {
      setVariating(false);
    }
  };

  const quotaLowOrOut = usage && usage.remaining <= 0;

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-fuchsia-500 to-orange-400 p-4 text-white">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0">
            <Wand2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">AI Design Assistant</p>
            <p className="text-sm font-bold mt-0.5">Generate a decal from text</p>
            <p className="text-[11px] text-white/85 mt-0.5">Describe what you want, pick a style, click generate.</p>
          </div>
        </div>
        {usage && (
          <div className="relative mt-3 flex items-center justify-between text-[10px] text-white/90">
            <span className="inline-flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {usage.remaining} of {usage.limit} generations left today
            </span>
            <span className="font-mono">{Math.round((usage.used / usage.limit) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
          What should we design?
        </label>
        <div className="relative">
          <textarea
            ref={promptInputRef}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. minimalist mountain logo with a small sun"
            className="w-full p-3 pr-9 rounded-xl border border-slate-200 text-sm focus:ring-4 focus:ring-purple-500/15 focus:border-purple-500 resize-none"
          />
          {prompt.trim() && (
            <button
              type="button"
              onClick={handleEnhance}
              disabled={enhancing}
              title="AI-enhance this prompt"
              className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-bold transition disabled:opacity-50"
            >
              {enhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Enhance
            </button>
          )}
        </div>
      </div>

      {/* Suggestion chips */}
      <div>
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Lightbulb className="w-3 h-3" /> Ideas {loadingSuggestions && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestionPick(s)}
              className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
            >
              {s}
            </button>
          ))}
          {suggestions.length === 0 && !loadingSuggestions && (
            <p className="text-[11px] text-slate-400 italic">No suggestions available</p>
          )}
        </div>
      </div>

      {/* Style picker */}
      <div>
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Palette className="w-3 h-3" /> Style
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`relative overflow-hidden rounded-xl p-2 text-center transition group ${
                style === s.id
                  ? 'ring-2 ring-purple-500 ring-offset-2'
                  : 'ring-1 ring-slate-200 hover:ring-slate-300'
              }`}
            >
              <div className={`w-full h-7 rounded-md bg-gradient-to-br ${s.tint} flex items-center justify-center text-white text-sm mb-1`}>
                {s.emoji}
              </div>
              <p className="text-[10px] font-bold text-slate-700">{s.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && !error && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || generating || quotaLowOrOut}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-500 hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20 transition"
      >
        {generating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate design
          </>
        )}
      </button>
      {quotaLowOrOut && (
        <p className="text-[10px] text-rose-600 text-center -mt-2">
          You've used your daily AI generations. Try again tomorrow.
        </p>
      )}

      {/* Current generation preview */}
      {currentImage && (
        <div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Latest design
          </p>
          <button
            onClick={() => handleApply(currentImage.url, currentImage.meta)}
            className="group block w-full aspect-square rounded-2xl overflow-hidden border-2 border-slate-200 hover:border-purple-500 transition relative"
          >
            <img src={currentImage.url} alt="AI generated design" className="w-full h-full object-contain bg-white" />
            <div className="absolute inset-0 bg-purple-600/0 group-hover:bg-purple-600/85 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-purple-700 text-sm font-bold shadow-lg">
                <ImageIcon className="w-3.5 h-3.5" /> Apply to product
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
            {currentImage.meta?.fallback && (
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                Demo
              </span>
            )}
          </button>

          {/* Variations action — image-to-image */}
          <button
            onClick={handleVariations}
            disabled={variating}
            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 disabled:opacity-50 transition border border-purple-200"
          >
            {variating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generating 3 variations…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Generate 3 variations
              </>
            )}
          </button>

          {variations.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Variations
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {variations.map((v, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setCurrentImage({ url: v.url, meta: { ...currentImage.meta, fromVariation: true, nudge: v.nudge } });
                      handleApply(v.url, currentImage.meta);
                    }}
                    title={v.nudge}
                    className="aspect-square rounded-lg overflow-hidden border-2 border-slate-200 hover:border-purple-500 transition bg-white"
                  >
                    <img src={v.url} alt="" className="w-full h-full object-contain" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History strip */}
      {history.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Recent designs
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {history.slice(0, 8).map((h: any, i: number) =>
              h.resultUrl ? (
                <button
                  key={i}
                  onClick={() =>
                    handleApply(h.resultUrl, { prompt: h.prompt, style: h.style })
                  }
                  title={h.prompt}
                  className="aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-purple-500 transition bg-white"
                >
                  <img src={h.resultUrl} alt="" className="w-full h-full object-contain" />
                </button>
              ) : null
            )}
          </div>
        </div>
      )}

      {/* Tips */}
      <details className="rounded-xl border border-slate-200 bg-slate-50">
        <summary className="px-3 py-2 cursor-pointer text-[11px] font-semibold text-slate-600">
          Tips for better results
        </summary>
        <div className="px-3 pb-3 text-[11px] text-slate-600 space-y-1.5">
          <p>• Be specific — "vintage mountain biking badge with pine trees" beats "biking logo".</p>
          <p>• Pick a style that matches the product (Bold for sports, Watercolor for soft items).</p>
          <p>• Add a feeling: "playful", "elegant", "rugged" — adjectives steer the look.</p>
          <p>• Avoid brand names or celebrities — they'll be filtered.</p>
        </div>
      </details>
    </div>
  );
}
