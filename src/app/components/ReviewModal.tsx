import React, { useState, useEffect } from 'react';
import { X, Star, CheckCircle2, Sparkles, Lock } from 'lucide-react';
import { getReviewEligibility, submitReview } from '../api';

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  sku: string;
  productName: string;
  thumbnailSrc?: string;
  onSubmitted?: () => void;
}

const RATING_COPY: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Great',
  5: 'Excellent',
};

const COMMENT_MAX = 2000;
const TITLE_MAX = 100;

/**
 * Per-item review modal opened from the customer's order page.
 */
export function ReviewModal({ open, onClose, sku, productName, thumbnailSrc, onSubmitted }: ReviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [existing, setExisting] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!open || !sku) return;
    setLoading(true);
    setErr('');
    setOk(false);
    getReviewEligibility(sku)
      .then((res) => {
        setEligible(!!res?.eligible);
        setExisting(res?.existing || null);
        if (res?.existing) {
          setRating(res.existing.rating || 5);
          setTitle(res.existing.title || '');
          setComment(res.existing.comment || '');
        } else {
          setRating(5);
          setTitle('');
          setComment('');
        }
      })
      .catch((e: any) => setErr(e?.message || 'Unable to check eligibility'))
      .finally(() => setLoading(false));
  }, [open, sku]);

  const onSubmit = async () => {
    if (rating < 1 || rating > 5) return;
    setBusy(true);
    setErr('');
    try {
      await submitReview({ sku, rating, title: title.trim(), comment: comment.trim() });
      setOk(true);
      onSubmitted?.();
      setTimeout(() => onClose(), 1200);
    } catch (e: any) {
      setErr(e?.message || 'Failed to submit review');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const liveRating = hover || rating;
  const commentRatio = comment.length / COMMENT_MAX;
  const commentColor =
    commentRatio > 0.95 ? 'text-rose-600' :
    commentRatio > 0.8  ? 'text-amber-600' : 'text-slate-400';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Branded gradient header */}
        <div className="relative px-5 py-4 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
          <div className="absolute -top-12 -right-10 w-32 h-32 rounded-full bg-purple-400/40 blur-2xl pointer-events-none" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {thumbnailSrc && (
                <img src={thumbnailSrc} alt="" className="w-11 h-11 rounded-xl object-cover border-2 border-white/20" />
              )}
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/15 text-[10px] font-bold uppercase tracking-wider mb-0.5">
                  <Sparkles className="w-2.5 h-2.5" />
                  {existing ? 'Update review' : 'Leave a review'}
                </div>
                <p className="text-sm font-bold truncate">{productName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-8">Loading…</p>
          ) : !eligible ? (
            <div className="py-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-3">
                <Lock className="w-7 h-7 text-amber-600" />
              </div>
              <p className="text-base font-bold text-slate-900 mb-1">Review unlocks at delivery</p>
              <p className="text-sm text-slate-500">You can review this product once your order reaches delivered or completed.</p>
            </div>
          ) : ok ? (
            <div className="py-8 text-center animate-in zoom-in duration-300">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 border border-emerald-200 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-9 h-9 text-emerald-600" />
              </div>
              <p className="text-base font-black text-slate-900">Thanks for the review!</p>
              <p className="text-sm text-slate-500 mt-1">It'll go live once moderated.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Rating */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Your rating</label>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
                  <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map((n) => {
                      const filled = liveRating >= n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onMouseEnter={() => setHover(n)}
                          onClick={() => setRating(n)}
                          className="p-1 transition-transform hover:scale-110"
                          aria-label={`Rate ${n} of 5 stars`}
                        >
                          <Star
                            className={`w-9 h-9 transition-all ${filled ? 'fill-amber-400 text-amber-500 drop-shadow-sm' : 'fill-white text-slate-300'}`}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Score</p>
                    <p className="text-2xl font-black text-amber-700">{liveRating}/5</p>
                    <p className="text-xs font-bold text-slate-600">{RATING_COPY[liveRating]}</p>
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-bold text-slate-700">Title <span className="text-slate-400 font-normal">(optional)</span></label>
                  <span className="text-xs text-slate-400">{title.length}/{TITLE_MAX}</span>
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                  placeholder="Sum up your experience"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm placeholder:text-slate-400"
                />
              </div>

              {/* Comment */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-bold text-slate-700">Your review</label>
                  <span className={`text-xs font-bold ${commentColor}`}>{comment.length}/{COMMENT_MAX}</span>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
                  rows={4}
                  placeholder="Tell other customers what worked well or what could be better"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm placeholder:text-slate-400 resize-none"
                />
              </div>

              {err && (
                <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold">
                  {err}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={onSubmit}
                  disabled={busy || rating < 1}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold shadow-md shadow-blue-200 hover:shadow-lg disabled:opacity-50 disabled:shadow-none transition-all"
                >
                  {busy ? 'Submitting…' : (existing ? 'Update review' : 'Submit review')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ReviewModal;
