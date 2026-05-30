import React, { useEffect, useState } from 'react';
import { listAdminReturns, decideReturn } from '../api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Badge } from '../components/Badge';
import { CheckCircle2, XCircle, RefreshCcw, Package } from 'lucide-react';

const REASON_LABEL: Record<string, string> = {
  damaged: 'Damaged item',
  wrong_print: 'Wrong print',
  wrong_size: 'Wrong size',
  wrong_item: 'Wrong item',
  quality_issue: 'Quality issue',
  other: 'Other',
};

const STATUS_BADGE: Record<string, any> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  refunded: 'info',
};

export function AdminReturns() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Returns & damage requests</h1>
          <p className="text-slate-600 mt-1">Review customer-filed returns and respond.</p>
        </div>
        <button
          onClick={reload}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold"
        >
          <RefreshCcw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {['', 'pending', 'approved', 'rejected', 'refunded'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-sm font-bold border ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}
          >
            {s ? s[0].toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <Card><CardContent className="py-10 text-center text-slate-500">Loading…</CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          No return requests to show.
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {items.map((r) => (
            <Card key={r._id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Return for order #{String(r.order?._id || r.order || '').slice(-6)}</CardTitle>
                  <Badge variant={STATUS_BADGE[r.status] || 'info'}>{r.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-slate-500">From</p>
                    <p className="font-bold text-slate-900">{r.customer?.name || '—'}</p>
                    <p className="text-sm text-slate-600">{r.customer?.email}</p>

                    <p className="text-sm text-slate-500 mt-4">Reason</p>
                    <p className="font-bold text-slate-900">{REASON_LABEL[r.reason] || r.reason}</p>

                    <p className="text-sm text-slate-500 mt-4">Description</p>
                    <p className="text-slate-700 text-sm whitespace-pre-wrap">{r.description}</p>

                    {r.photos?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.photos.map((p: string, i: number) => (
                          <a key={i} href={p} target="_blank" rel="noopener noreferrer">
                            <img src={p} alt="" className="w-20 h-20 rounded-lg object-cover border border-slate-200" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Order info</p>
                    <p className="text-sm">Total: <span className="font-bold">₱{r.order?.totalPrice || 0}</span></p>
                    <p className="text-sm">Order status: <span className="font-bold">{r.order?.status}</span></p>
                    <p className="text-sm">Filed: {new Date(r.createdAt).toLocaleString()}</p>

                    <p className="text-sm text-slate-500 mt-4">Admin note (required to reject)</p>
                    <textarea
                      value={adminNote[r._id] || r.adminNote || ''}
                      onChange={(e) => setAdminNote({ ...adminNote, [r._id]: e.target.value })}
                      rows={3}
                      placeholder="Explain your decision to the customer."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />

                    {r.status === 'pending' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => decide(r._id, 'approved')}
                          disabled={busy[r._id]}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => decide(r._id, 'refunded')}
                          disabled={busy[r._id]}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
                        >
                          Mark refunded
                        </button>
                        <button
                          onClick={() => decide(r._id, 'rejected')}
                          disabled={busy[r._id]}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white font-bold disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">
                        Decided {r.decidedAt ? new Date(r.decidedAt).toLocaleString() : ''}. Note: {r.adminNote || '—'}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminReturns;
