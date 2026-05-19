import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, Download, Share2, RefreshCw, ImageOff } from 'lucide-react';
import { aiGenerateMockup, aiListMockupScenes } from '../api';

/**
 * AIMockupModal — "✨ Generate lifestyle preview" experience.
 *
 * Flow:
 *   1. Studio captures a snapshot of the 3D canvas (the design with the
 *      customer's decals applied) and passes it as `designImage`.
 *   2. User picks a scene (default / studio / outdoor / etc).
 *   3. Modal POSTs to /api/ai-design/mockup → Gemini regenerates the scene
 *      around the product, preserving the customer's design.
 *   4. Result is a photo-realistic lifestyle image they can download, share,
 *      or regenerate with a different scene.
 *
 * Why a modal: this is a "moment" — a deliberate reveal. Letting it sit
 * inline in the sidebar wouldn't get the same emotional payoff. The modal
 * is also a natural place for download/share affordances.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Data URL of the rendered 3D canvas (product + decal). */
  designImage: string;
  /** Canonical product type — drives which scenes are offered. */
  productType: string;
  productName?: string;
}

export function AIMockupModal({ open, onClose, designImage, productType, productName }: Props) {
  const [scenes, setScenes] = useState<string[]>(['default']);
  const [scene, setScene] = useState('default');
  // Wearable-specific state. `isWearable` comes from the backend so we don't
  // duplicate the product-type → wearable mapping on both sides.
  const [isWearable, setIsWearable] = useState(false);
  const [bodySizes, setBodySizes] = useState<string[]>([]);
  const [bodySize, setBodySize] = useState<string>(''); // empty = let Gemini choose
  // Free-text scene description ("middle-aged man with a beard sitting on a
  // park bench"). Capped on the backend to 300 chars but we soft-cap in the UI.
  const [customDescription, setCustomDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load scene options + wearable status once we know the product type.
  // Returns { scenes, isWearable, bodySizes } so we can render the right
  // controls without a separate round trip.
  useEffect(() => {
    if (!open || !productType) return;
    aiListMockupScenes(productType)
      .then((r: any) => {
        const list = Array.isArray(r.scenes) && r.scenes.length ? r.scenes : ['default'];
        setScenes(list);
        setIsWearable(!!r.isWearable);
        setBodySizes(Array.isArray(r.bodySizes) ? r.bodySizes : []);
        if (!list.includes(scene)) setScene(list[0]);
      })
      .catch(() => {
        setScenes(['default']);
        setIsWearable(false);
        setBodySizes([]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, productType]);

  // Reset state every time the modal opens — stale result from a prior
  // session shouldn't leak into the new one.
  useEffect(() => {
    if (open) {
      setResultUrl(null);
      setError(null);
      setLoading(false);
      setBodySize('');
      setCustomDescription('');
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!designImage) {
      setError('No design snapshot available. Try again from the studio.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res: any = await aiGenerateMockup({
        designImage,
        productType,
        productName,
        scene,
        bodySize: isWearable ? bodySize : '',
        customDescription: customDescription.trim(),
      });
      if (res?.fallback) {
        setError(
          res.fallbackReason ||
            'Mockup generation is temporarily unavailable. Try again in a few seconds.',
        );
        return;
      }
      setResultUrl(res.dataUrl);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate mockup.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `customate-mockup-${Date.now()}.png`;
    a.click();
  };

  const handleShare = async () => {
    if (!resultUrl) return;
    try {
      // Try Web Share API first (mobile + modern browsers)
      const blob = await (await fetch(resultUrl)).blob();
      const file = new File([blob], 'customate-mockup.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'My custom design',
          text: `Check out my ${productName || 'custom design'} from CustoMate!`,
          files: [file],
        });
        return;
      }
      // Fallback: copy data URL to clipboard
      await navigator.clipboard.writeText(resultUrl);
      alert('Mockup URL copied to clipboard.');
    } catch (err) {
      console.warn('Share failed', err);
    }
  };

  if (!open) return null;

  // Scene labels — capitalize the snake-cased key for display
  const sceneLabel = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-fuchsia-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-900">Lifestyle preview</h2>
              <p className="text-xs text-slate-500">
                See your design as a real product photo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Configuration panel — scene + (wearable-only) body size + custom text.
            All three feed into the same Gemini prompt; the customer can use one,
            two, or all three to control the output.
            Hidden behind a scroll container so the modal stays compact even
            when all three sections are visible. */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 space-y-3 max-h-[36vh] overflow-y-auto">
          {/* Scene preset row */}
          {scenes.length > 1 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Scene
              </p>
              <div className="flex flex-wrap gap-1.5">
                {scenes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setScene(s)}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                      scene === s
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {sceneLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Body size row — wearable products only. "Default" leaves the
              choice up to Gemini (matches old behavior). */}
          {isWearable && bodySizes.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Model body size
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setBodySize('')}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    bodySize === ''
                      ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="Let the AI choose"
                >
                  Default
                </button>
                {bodySizes.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBodySize(b)}
                    disabled={loading}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all capitalize ${
                      bodySize === b
                        ? 'bg-fuchsia-600 text-white border-fuchsia-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Free-text custom description — works for any product. Lets the
              customer add specifics ("middle-aged man with a beard", "woman
              walking on a beach at sunset"). Capped at 300 chars on the server. */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Custom description{' '}
                <span className="text-slate-400 normal-case font-medium">(optional)</span>
              </p>
              <p className="text-[10px] text-slate-400">
                {customDescription.length}/300
              </p>
            </div>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value.slice(0, 300))}
              disabled={loading}
              placeholder={
                isWearable
                  ? 'e.g. middle-aged man with a beard, smiling, walking through a park'
                  : 'e.g. on a rustic wooden table next to an open book and a vase of wildflowers'
              }
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30 focus:border-fuchsia-400 disabled:bg-slate-100 resize-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Add specifics about the model, setting, mood, or pose.
            </p>
          </div>
        </div>

        {/* Body — result area */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Before / After (or placeholder before first gen) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Your design
              </p>
              <div className="aspect-square rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center">
                {designImage ? (
                  <img
                    src={designImage}
                    alt="Your design"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ImageOff className="w-10 h-10 text-slate-300" />
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-fuchsia-600 uppercase tracking-wider mb-1.5">
                ✨ Lifestyle mockup
              </p>
              <div
                className={`aspect-square rounded-2xl overflow-hidden flex items-center justify-center transition-colors ${
                  resultUrl
                    ? 'bg-slate-900'
                    : 'bg-gradient-to-br from-fuchsia-50 to-purple-50 border border-fuchsia-200'
                }`}
              >
                {loading ? (
                  <div className="text-center px-6">
                    <Loader2 className="w-8 h-8 text-fuchsia-600 animate-spin mx-auto mb-2" />
                    <p className="text-xs font-bold text-fuchsia-700">
                      Generating your scene…
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Usually takes 10–15 seconds
                    </p>
                  </div>
                ) : resultUrl ? (
                  <img
                    src={resultUrl}
                    alt="Lifestyle mockup"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center px-6">
                    <Sparkles className="w-8 h-8 text-fuchsia-400 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-600">
                      Click Generate to see your design as a real product photo
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-600 font-semibold mt-3 px-1">{error}</p>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t border-slate-100 p-4 flex items-center justify-between gap-2 bg-slate-50/50">
          <div className="text-[10px] text-slate-400">
            Powered by Gemini · One generation counts against your daily AI quota
          </div>
          <div className="flex items-center gap-2">
            {resultUrl && (
              <>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
              </>
            )}
            <button
              onClick={handleGenerate}
              disabled={loading || !designImage}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black text-white bg-gradient-to-br from-fuchsia-500 to-purple-600 hover:from-fuchsia-600 hover:to-purple-700 shadow-lg shadow-fuchsia-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating…
                </>
              ) : resultUrl ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
