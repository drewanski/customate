import React, { useEffect, useMemo, useState } from 'react';
import { listAdminReturns, decideReturn } from '../api';
import { Card, CardContent } from '../components/Card';
import {
  CheckCircle2, XCircle, RefreshCcw, Package, AlertTriangle, Image as ImageIcon,
  Search, Sparkles, ScanLine, RotateCcw, Clock, X,
} from 'lucide-react';
import { Pagination, usePagination } from '../components/Pagination';

const REASON_META: Record<string, { label: string; tint: string }> = {
  damaged:        { label: 'Damaged item',     tint: 'bg-rose-100 text-rose-700 border-rose-200' },
  wrong_print:    { label: 'Wrong print',      tint: 'bg-amber-100 text-amber-700 border-amber-200' },
  wrong_size:     { label: 'Wrong size',       tint: 'bg-violet-100 text-violet-700 border-violet-200' },
  wrong_item:     { label: 'Wrong item',       tint: 'bg-orange-100 text-orange-700 border-orange-200' },
  quality_issue: { label: 'Quality issue',     tint: 'bg-pink-100 text-pink-700 border-pink-200' },
  other:          { label: 'Other',             tint: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const STATUS_META: Record<string, { label: string; tint: string; Icon: any }> = {
  pending:  { label: 'Pending review', tint: 'bg-amber-100 text-amber-700 border-amber-200',   Icon: Clock },
  approved: { label: 'Approved',        tint: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  rejected: { label: 'Rejected',        tint: 'bg-rose-100 text-rose-700 border-rose-200',     Icon: XCircle },
  refunded: { label: 'Refunded',        tint: 'bg-blue-100 text-blue-700 border-blue-200',     Icon: RotateCcw },
};

function timeAgo(iso: string) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function AdminReturns() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const data = await listAdminReturns(statusFilter || undefined);
      setItems(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [statusFilter]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (r) =>
        (r.customer?.name || '').toLowerCase().includes(q) ||
        (r.customer?.email || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (String(r.order?._id || r.order || '')).includes(q),
    );
  }, [items, search]);

  // Pagination — resets when filter/search changes.
  const { page, pageSize, setPage, setPageSize } = usePagination(10, [statusFilter, search]);
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, refunded: 0 };
    for (const r of items) if (c[r.status as keyof typeof c] !== undefined) c[r.status as keyof typeof c]++;
    return c;
  }, [items]);

  const decide = async (id: string, decision: 'approved' | 'rejected' | 'refunded') => {
    const note = adminNote[id] || '';
    if (decision === 'rejected' && !note.trim()) {
      alert('Please add an admin note explaining the rejection.');
      return;
    }
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await decideReturn(id, decision, note);
      await reload();
    } catch (err: any) {
      alert(err?.message || 'Failed to update');
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-blue-400/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-purple-400/40 blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-widest mb-3">
              <Sparkles className="w-3 h-3" /> Returns
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Returns &amp; damage</h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Review customer-filed returns. Decisions notify the customer instantly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={reload} className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 text-sm font-bold hover:bg-white/25 transition-colors">
              <RefreshCcw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 space-y-4">
        {/* Stats strip + filter pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['pending', 'approved', 'rejected', 'refunded'] as const).map((s) => {
            const meta = STATUS_META[s];
            const Icon = meta.Icon;
            const n = counts[s];
            const active = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? '' : s)}
                className={`text-left p-3 rounded-2xl border transition-all ${active ? 'bg-white border-blue-300 ring-4 ring-blue-100 shadow-md' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className={`w-9 h-9 rounded-xl ${meta.tint} flex items-center justify-center border`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-2xl font-black text-slate-900">{n}</span>
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">{meta.label}</p>
              </button>
            );
          })}
        </div>

        {/* Search + reset */}
        <Card className="border-0 shadow-md shadow-slate-200/60">
          <div className="p-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by customer, email, order ref, or description…"
                className="w-full h-10 pl-10 pr-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 text-sm placeholder:text-slate-400"
              />
            </div>
            {(search || statusFilter) && (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); }}
                className="px-3 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
              >
                Reset filters
              </button>
            )}
          </div>
        </Card>

        {/* Returns list */}
        {loading ? (
          <Card className="border-0 shadow-md shadow-slate-200/60">
            <CardContent className="py-10 text-center text-slate-500">Loading…</CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="border-0 shadow-md shadow-slate-200/60">
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center mb-3">
                <Package className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-sm font-bold text-slate-700">No return requests</p>
              <p className="text-xs text-slate-500 mt-1">
                {statusFilter ? `No ${statusFilter} returns right now.` : 'Customer-filed returns appear here.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {paginated.map((r) => {
              const status = STATUS_META[r.status] || STATUS_META.pending;
              const StatusIcon = status.Icon;
              const reason = REASON_META[r.reason] || REASON_META.other;
              const note = adminNote[r._id] ?? r.adminNote ?? '';
              const orderRef = String(r.order?._id || r.order || '').slice(-6).toUpperCase();

              return (
                <Card key={r._id} className="border-0 shadow-md shadow-slate-200/60 overflow-hidden">
                  {/* Card header with order ref + status pill + filed-time */}
                  <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-bold text-slate-900">Return for order #{orderRef}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${status.tint}`}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${reason.tint}`}>
                        {reason.label}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">Filed {timeAgo(r.createdAt)}</span>
                  </div>

                  <CardContent className="p-4 grid md:grid-cols-2 gap-6">
                    {/* LEFT — customer + reason + description + photos */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black flex items-center justify-center text-sm shrink-0">
                          {(r.customer?.name || 'C').trim().split(/\s+/).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join('')}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{r.customer?.name || 'Customer'}</p>
                          <p className="text-xs text-slate-500 truncate">{r.customer?.email}</p>
                        </div>
                      </div>

                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-3">Description</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap mt-1 p-3 rounded-xl bg-slate-50 border border-slate-100">
                        {r.description || '—'}
                      </p>

                      {r.photos?.length > 0 && (
                        <>
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-3">Photos ({r.photos.length})</p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {r.photos.map((p: string, i: number) => (
                              <button
                                key={i}
                                onClick={() => setLightbox(p)}
                                className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:ring-4 hover:ring-blue-100 hover:border-blue-300 transition-all relative group"
                              >
                                <img src={p} alt={`evidence ${i + 1}`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                  <ScanLine className="w-5 h-5 text-white" />
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* RIGHT — order info + admin note + decision buttons */}
                    <div>
                      <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
                        <p className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">Order info</p>
                        <div className="mt-1.5 text-sm space-y-0.5">
                          <p className="text-slate-700">Total: <span className="font-bold text-slate-900">₱{r.order?.totalPrice || 0}</span></p>
                          <p className="text-slate-700">Order status: <span className="font-bold capitalize">{(r.order?.status || '').replace('_',' ')}</span></p>
                        </div>
                      </div>

                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-4">
                        Admin note <span className="text-rose-600">(required to reject)</span>
                      </p>
                      <textarea
                        value={note}
                        onChange={(e) => setAdminNote({ ...adminNote, [r._id]: e.target.value })}
                        rows={3}
                        disabled={r.status !== 'pending'}
                        placeholder="Explain your decision so the customer sees it on their order page."
                        className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                      />

                      {r.status === 'pending' ? (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            onClick={() => decide(r._id, 'approved')}
                            disabled={busy[r._id]}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-md shadow-emerald-200 hover:shadow-lg disabled:opacity-50 transition-all"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Approve
                          </button>
                          <button
                            onClick={() => decide(r._id, 'refunded')}
                            disabled={busy[r._id]}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-md shadow-blue-200 hover:shadow-lg disabled:opacity-50 transition-all"
                          >
                            <RotateCcw className="w-4 h-4" /> Refund
                          </button>
                          <button
                            onClick={() => decide(r._id, 'rejected')}
                            disabled={busy[r._id]}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white border border-rose-200 text-rose-700 font-bold text-sm hover:bg-rose-50 disabled:opacity-50 transition-all"
                          >
                            <XCircle className="w-4 h-4" /> Reject
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                          <p className="font-bold text-slate-900 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            Decision recorded
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {r.decidedAt ? new Date(r.decidedAt).toLocaleString() : ''}
                          </p>
                          {r.adminNote && (
                            <p className="text-sm text-slate-700 mt-1.5">{r.adminNote}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4">
              <Pagination
                page={page}
                total={filtered.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="return"
                itemLabelPlural="returns"
              />
            </div>
          </div>
        )}
      </div>

      {/* Photo lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/85 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-2xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center backdrop-blur-md"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightbox}
            alt="evidence"
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default AdminReturns;
