import React, { useEffect, useState } from 'react';
import { MessageSquare, ShieldCheck, Loader2 } from 'lucide-react';
import { StarRating } from './StarRating';
import {
  getProductReviews,
  getReviewEligibility,
  submitReview,
} from '../../api';
import { useAuth } from '../../hooks/useAuth';

/**
 * ProductReviews — the full reviews panel for a product detail page.
 *
 * Shows:
 *   - Aggregated rating + 5-bar distribution
 *   - List of approved reviews
 *   - "Write a review" form (only if logged in AND has a delivered order
 *     for this SKU). Once submitted, prompts re-moderation.
 */
export function ProductReviews({ sku }: { sku: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<any>({ reviews: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [eligibility, setEligibility] = useState<any>(null);

  // Local form state
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pub, elig] = await Promise.all([
        getProductReviews(sku),
        user ? getReviewEligibility(sku) : Promise.resolve(null),
      ]);
      setData(pub);
      setEligibility(elig);
      if (elig?.existing) {
        setRating(elig.existing.rating);
        setTitle(elig.existing.title || '');
        setComment(elig.existing.comment || '');
      }
    } catch (err) {
      console.error('Reviews load error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await submitReview({ sku, rating, title, comment });
      setSuccess('Thanks! Your review is pending moderation.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  };

  const stats = data.stats || {
    average: 0,
    total: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-slate-700" />
        <h2 className="text-lg font-black text-slate-900">Customer reviews</h2>
      </div>

      {loading ? (
        <div className="py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
        </div>
      ) : (
        <>
          {/* Aggregate */}
          <div className="grid md:grid-cols-3 gap-4 pb-4 mb-4 border-b border-slate-100">
            <div className="text-center md:text-left">
              <p className="text-4xl font-black text-slate-900">
                {stats.average.toFixed(1)}
              </p>
              <StarRating value={stats.average} />
              <p className="text-xs text-slate-500 mt-1">
                {stats.total} review{stats.total === 1 ? '' : 's'}
              </p>
            </div>
            <div className="md:col-span-2 space-y-1">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = stats.distribution[star] || 0;
                const pct = stats.total ? (count / stats.total) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-slate-600 font-bold">{star}★</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-slate-500">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Write a review */}
          {user && eligibility?.eligible && (
            <form
              onSubmit={handleSubmit}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 mb-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                  Verified purchase
                </p>
              </div>
              <p className="text-sm font-bold text-slate-900 mb-2">
                {eligibility.existing ? 'Update your review' : 'Write a review'}
              </p>
              <div className="mb-2">
                <StarRating value={rating} onChange={setRating} editable size={24} />
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Headline (optional)"
                maxLength={100}
                className="w-full mb-2 px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your thoughts on the product…"
                rows={3}
                maxLength={2000}
                className="w-full mb-2 px-3 py-2 rounded-lg border border-slate-200 text-sm resize-y"
              />
              {error && <p className="text-xs text-rose-600 mb-2 font-semibold">{error}</p>}
              {success && <p className="text-xs text-emerald-600 mb-2 font-semibold">{success}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : eligibility.existing ? 'Update review' : 'Submit review'}
              </button>
            </form>
          )}
          {user && eligibility && !eligibility.eligible && (
            <p className="text-xs text-slate-500 italic mb-4">
              Only customers with a delivered order for this product can post a review.
            </p>
          )}

          {/* Review list */}
          {data.reviews.length === 0 ? (
            <p className="text-sm text-slate-500 italic py-4">
              No reviews yet — be the first!
            </p>
          ) : (
            <ul className="space-y-3">
              {data.reviews.map((r: any) => (
                <li
                  key={r._id}
                  className="p-3 rounded-xl border border-slate-100"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <StarRating value={r.rating} size={14} />
                      <span className="text-xs font-bold text-slate-900">
                        {r.customerName || 'Customer'}
                      </span>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        Verified
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.title && (
                    <p className="text-sm font-bold text-slate-900">{r.title}</p>
                  )}
                  {r.comment && (
                    <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">
                      {r.comment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
