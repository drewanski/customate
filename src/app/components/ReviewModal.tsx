import React, { useState, useEffect } from 'react';
import { X, Star, CheckCircle2 } from 'lucide-react';
import { getReviewEligibility, submitReview } from '../api';

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  sku: string;
  productName: string;
  thumbnailSrc?: string;
  onSubmitted?: () => void;
}

/**
 * In-context "Leave a review" modal opened from the order tracking page.
 *
 * Pulls existing review (if any) and pre-fills the form so the customer can
 * edit. Submitting re-uploads to `/reviews` and goes back to `pending` for
 * admin moderation per the existing rules.
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
      setTimeout(() => onClose(), 1100);
    } catch (e: any) {
      setErr(e?.message || 'Failed to submit review');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {thumbnailSrc && <img src={thumbnailSrc} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200" />}
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">{existing ? 'Update your review' : 'Leave a review'}</h3>
              <p className="text-sm text-slate-500 truncate">{productName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 text-slate-500 flex items-center justify-center" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <p className="text-sm text-slate-500 text-center py-6">Loading…</p>
          ) : !eligible ? (
            <div className="py-6 text-center">
              <p className="text-sm text-slate-700 font-bold mb-1">You can review this product once it's delivered.</p>
              <p className="text-sm text-slate-500">Reviews unlock automatically when your order reaches delivered or completed.</p>
            </div>
          ) : ok ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
              <p className="text-base font-bold text-slate-900">Thanks for the review!</p>
              <p className="text-sm text-slate-500 mt-1">It'll go live once moderated.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setRating(n)}
                      className="p-0.5"
                      aria-label={`Rate ${n} of 5 stars`}
                    >
                      <Star
                        className={`w-8 h-8 ${(hover || rating) >= n ? 'fill-amber-400 text-amber-400' : 'fill-slate-100 text-slate-300'}`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm font-bold text-slate-700">{rating}/5</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Title <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="Sum up your experience"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Comment</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Tell other customers what worked well or what could be better"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">{comment.length}/2000</p>
              </div>

              {err && <p className="text-sm text-rose-700 font-semibold">{err}</p>}

              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Cancel</button>
                <button
                  onClick={onSubmit}
                  disabled={busy || rating < 1}
                  className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
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
