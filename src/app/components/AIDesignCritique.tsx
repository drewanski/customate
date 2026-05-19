import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import {
  Wand2,
  Loader2,
  AlertCircle,
  Move,
  Palette,
  Maximize2,
  Contrast,
  Layout,
  PenTool,
  Sparkles,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { aiCritiqueDesign } from '../api';

interface Tip {
  title: string;
  tip: string;
  category: 'placement' | 'color' | 'size' | 'contrast' | 'composition' | 'style' | string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Captures the current 3D canvas as a data URL */
  captureSnapshot: () => Promise<string | null>;
  productName?: string;
  designContext?: string;
}

const CATEGORY_META: Record<string, { icon: any; tint: string; label: string }> = {
  placement: { icon: Move, tint: 'from-blue-500 to-indigo-500', label: 'Placement' },
  color: { icon: Palette, tint: 'from-pink-500 to-fuchsia-500', label: 'Color' },
  size: { icon: Maximize2, tint: 'from-amber-500 to-orange-500', label: 'Size' },
  contrast: { icon: Contrast, tint: 'from-slate-700 to-slate-900', label: 'Contrast' },
  composition: { icon: Layout, tint: 'from-purple-500 to-violet-500', label: 'Composition' },
  style: { icon: PenTool, tint: 'from-emerald-500 to-teal-500', label: 'Style' },
};

/**
 * Modal that captures the current 3D-preview, posts it to /api/ai-design/critique,
 * and shows three actionable design tips. Each tip has a colored category icon
 * and a short headline + sentence.
 *
 * Auto-runs on first open so the user doesn't have to wait through an extra
 * click; can be re-run from the button at the bottom.
 */
export function AIDesignCritique({ isOpen, onClose, captureSnapshot, productName, designContext }: Props) {
  const [loading, setLoading] = useState(false);
  const [tips, setTips] = useState<Tip[]>([]);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const runCritique = async () => {
    setError(null);
    setLoading(true);
    try {
      const snapshot = await captureSnapshot();
      if (!snapshot) {
        setError("Couldn't capture the design preview");
        return;
      }
      const res = await aiCritiqueDesign({ image: snapshot, productName, designContext });
      setTips(Array.isArray(res?.tips) ? res.tips : []);
      setFallback(!!res?.fallback);
      setHasRun(true);
    } catch (err: any) {
      setError(err.message || 'Could not get tips');
    } finally {
      setLoading(false);
    }
  };

  // Auto-run on first open. Reset when closed so re-opening triggers a fresh run.
  React.useEffect(() => {
    if (isOpen && !hasRun && !loading) {
      runCritique();
    }
    if (!isOpen) {
      // small reset so the next open is a clean state
      setTimeout(() => {
        if (!isOpen) {
          setHasRun(false);
          setTips([]);
          setFallback(false);
          setError(null);
        }
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="AI Design Tips"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={runCritique} loading={loading} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Re-analyze
          </Button>
        </>
      }
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-fuchsia-500 to-orange-400 p-4 text-white">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center flex-shrink-0">
              <Wand2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">AI Critique</p>
              <p className="text-sm font-bold mt-0.5">Three quick tips to make your design better</p>
              <p className="text-[11px] text-white/85 mt-0.5">
                Based on a snapshot of your {productName || 'product'}.
              </p>
            </div>
          </div>
        </div>

        {loading && tips.length === 0 && (
          <div className="py-10 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-8 h-8 text-purple-600 animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-900">Analyzing your design…</p>
            <p className="text-xs text-slate-500 mt-1">A designer is looking it over.</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && tips.length > 0 && (
          <>
            {fallback && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Generic tips shown (AI vision unavailable). Sign in or try again later for tips tailored to your design.
                </span>
              </div>
            )}
            <div className="space-y-2">
              {tips.map((t, i) => {
                const meta = CATEGORY_META[t.category] || CATEGORY_META.composition;
                const Icon = meta.icon;
                return (
                  <div key={i} className="p-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.tint} flex items-center justify-center text-white flex-shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900 text-sm">{t.title}</p>
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{t.tip}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-center text-slate-400 inline-flex items-center justify-center gap-1 w-full">
              <CheckCircle2 className="w-3 h-3" />
              Tips are suggestions, not requirements — your design, your call.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
