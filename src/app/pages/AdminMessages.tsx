import React, { useEffect, useState } from 'react';
import { MessageSquare, Inbox, Filter, RefreshCcw } from 'lucide-react';
import { getChatThreads } from '../api';
import { Card, CardContent } from '../components/Card';
import { Badge } from '../components/Badge';
import { OrderChatPanel } from '../components/chat/OrderChatPanel';
import { formatPeso } from '../utils/format';

const STATUS_TINT: Record<string, string> = {
  pending: 'warning',
  approved: 'success',
  in_production: 'info',
  ready: 'success',
  out_for_delivery: 'info',
  for_pickup: 'info',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'danger',
  refunded: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  in_production: 'In Production',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  for_pickup: 'Ready for pickup',
  completed: 'Completed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

function timeAgo(iso: string) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/**
 * Inbox of order-scoped conversations for admin + staff.
 * Threads list on the left, open thread on the right (or full-screen on mobile).
 */
export function AdminMessages() {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = async () => {
    setLoading(true);
    try {
      const data = await getChatThreads();
      setThreads(data || []);
      if (!activeId && data?.length) setActiveId(data[0].orderId);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  // Refresh every 10s so inbox preview stays current.
  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const visible = filter === 'unread' ? threads.filter((t) => t.unread > 0) : threads;
  const active = threads.find((t) => t.orderId === activeId);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-7 h-7 text-blue-600" /> Messages
            </h1>
            <p className="text-slate-600 mt-1">All conversations are tied to an order. Status updates appear automatically.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white border border-slate-200 rounded-xl p-1 flex items-center text-sm font-bold">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg ${filter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-700'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1.5 rounded-lg ${filter === 'unread' ? 'bg-blue-600 text-white' : 'text-slate-700'}`}
              >
                Unread {threads.filter((t) => t.unread > 0).length > 0 && (
                  <span className="ml-1 px-1.5 rounded-full bg-rose-500 text-white">{threads.filter((t) => t.unread > 0).length}</span>
                )}
              </button>
            </div>
            <button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <RefreshCcw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Threads list */}
          <div className="col-span-12 md:col-span-5 lg:col-span-4">
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 text-sm font-bold text-slate-700 flex items-center gap-2">
                <Inbox className="w-4 h-4" /> {visible.length} conversation{visible.length === 1 ? '' : 's'}
              </div>
              {loading ? (
                <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
              ) : visible.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">No conversations yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-[78vh] overflow-y-auto">
                  {visible.map((t) => {
                    const active = t.orderId === activeId;
                    return (
                      <li key={t.orderId}>
                        <button
                          onClick={() => setActiveId(t.orderId)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition ${active ? 'bg-blue-50' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-bold text-sm text-slate-900 truncate">{t.customerName || 'Customer'}</p>
                            <span className="text-xs text-slate-500 shrink-0">{timeAgo(t.lastAt)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">#{t.orderRef}</span>
                            <Badge variant={STATUS_TINT[t.status] || 'info'} className="text-[10px] py-0">{STATUS_LABEL[t.status] || t.status}</Badge>
                            <span className="text-xs text-slate-500">{formatPeso(t.totalPrice || 0)}</span>
                          </div>
                          <p className="text-sm text-slate-600 truncate mt-1.5">
                            <span className="font-semibold capitalize">{t.lastFromRole === 'system' ? 'System' : t.lastFromRole}:</span> {t.lastBody}
                          </p>
                          {t.unread > 0 && (
                            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs font-bold">
                              {t.unread} new
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          {/* Active chat */}
          <div className="col-span-12 md:col-span-7 lg:col-span-8">
            {!active ? (
              <Card>
                <CardContent className="py-16 text-center text-slate-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  Select a conversation to start replying.
                </CardContent>
              </Card>
            ) : (
              <OrderChatPanel
                key={active.orderId}
                orderId={active.orderId}
                heightClass="h-[60vh]"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminMessages;
