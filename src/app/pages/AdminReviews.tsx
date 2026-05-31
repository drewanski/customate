import React, { useEffect, useState, useMemo } from 'react';
import { MessageSquare, CheckCircle2, XCircle, ShieldCheck, Loader2 } from 'lucide-react';
import { StarRating } from '../components/reviews/StarRating';
import { getAdminReviews, moderateReview, getReviewStats } from '../api';
import { Pagination, usePagination } from '../components/Pagination';

/**
 * AdminReviews — moderation queue.
 *
 * Lists pending/approved/rejected reviews with one-click moderate buttons.
 * The moderation note is optional context the admin can leave for either
 * decision (e.g. "rejected — profanity" or "approved — verified complaint").
 */
export function AdminReviews() {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        getAdminReviews(statusFilter),
        getReviewStats(),
      ]);
      setReviews(list);
      setStats(s);
    } catch (err) {
      console.error('Reviews load error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // Pagination — resets when statusFilter changes.
  const { page, pageSize, setPage, setPageSize } = usePagination(15, [statusFilter]);
  const paginatedReviews = useMemo(() => reviews.slice((page - 1) * pageSize, page * pageSize), [reviews, page, pageSize]);

  const moderate = async (id: string, decision: 'approve' | 'reject') => {
    const note = decision === 'reject' ? prompt('Reason for rejection (optional):') || '' : '';
    setActingId(id);
    try {
      await moderateReview(id, decision, note);
      await load();
    } catch (err) {
      console.error('Moderation error', err);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
            Reviews & Ratings
          </h1>
          <p className="text-slate-500 mt-1">
            Moderate customer reviews before they appear on product pages.
          </p>
        </div>

        {/* KPI tiles */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Kpi label="Pending" value={stats.pending} color="amber" />
            <Kpi label="Approved" value={stats.approved} color="emerald" />
            <Kpi label="Rejected" value={stats.rejected} color="rose" />
            <Kpi
              label="Avg rating"
              value={stats.averageRating.toFixed(2)}
              color="blue"
            />
          </div>
        )}

        {/* Filter chips */}
        <div className="inline-flex bg-white border border-slate-200 rounded-lg p-1 mb-4">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="py-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
            </div>
          ) : reviews.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500 italic">
              No {statusFilter === 'all' ? '' : statusFilter} reviews.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {paginatedReviews.map((r: any) => (
                <li key={r._id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StarRating value={r.rating} size={14} />
                        <span className="text-xs font-bold text-slate-900">
                          {r.customer?.name || r.customerName}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          · {r.customer?.email || ''}
                        </span>
                        <span
                          className={`text-[9px] uppercase tracking-wider font-black px-1.5 py-0.5 rounded-full ${
                            r.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : r.status === 'rejected'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mb-1">
                        <ShieldCheck className="inline w-3 h-3 text-emerald-600 mr-1" />
                        {r.productName} · {r.sku}
                      </p>
                      {r.title && (
                        <p className="text-sm font-bold text-slate-900 mt-1">
                          {r.title}
                        </p>
                      )}
                      {r.comment && (
                        <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-line">
                          {r.comment}
                        </p>
                      )}
                      {r.moderationNote && (
                        <p className="text-[10px] text-slate-400 italic mt-1">
                          Mod note: {r.moderationNote}
                        </p>
                      )}
                    </div>
                    {r.status === 'pending' && (
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => moderate(r._id, 'approve')}
                          disabled={actingId === r._id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => moderate(r._id, 'reject')}
                          disabled={actingId === r._id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && reviews.length > pageSize && (
            <div className="p-3 border-t border-slate-100 bg-slate-50/40">
              <Pagination
                page={page}
                total={reviews.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 15, 25, 50]}
                itemLabel="review"
                itemLabelPlural="reviews"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: any; color: string }) {
  const colors: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  return (
    <div className={`rounded-2xl border p-4 ${colors[color]}`}>
      <p className="text-[10px] uppercase tracking-wider font-bold opacity-70">{label}</p>
      <p className="text-2xl font-black mt-1">{value}</p>
    </div>
  );
}
