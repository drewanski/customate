import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Inbox, RefreshCcw, Search, Sparkles, X } from 'lucide-react';
import { getChatThreads } from '../api';
import { Card, CardContent } from '../components/Card';
import { OrderChatPanel } from '../components/chat/OrderChatPanel';
import { formatPeso } from '../utils/format';
import { Pagination, usePagination } from '../components/Pagination';

const STATUS_TINT: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  in_production: 'bg-violet-100 text-violet-700 border-violet-200',
  ready: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  out_for_delivery: 'bg-sky-100 text-sky-700 border-sky-200',
  for_pickup: 'bg-sky-100 text-sky-700 border-sky-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  refunded: 'bg-rose-100 text-rose-700 border-rose-200',
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

function initials(name?: string) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');
}

export function AdminMessages() {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [search, setSearch] = useState('');

  // Track whether we already auto-selected on first load. Without this the
  // 10-second polling closure captures a stale activeId=null and yanks the
  // admin back to the most-recent thread every refresh — making it
  // impossible to read any older order.
  const initializedRef = React.useRef(false);

  const load = async (opts: { setActiveIfMissing?: boolean } = {}) => {
    try {
      const data = await getChatThreads();
      setThreads(data || []);
      if (opts.setActiveIfMissing && !initializedRef.current && data?.length) {
        setActiveId(data[0].orderId);
        initializedRef.current = true;
      }
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load({ setActiveIfMissing: true }); }, []);
  useEffect(() => {
    // Background poll — refreshes thread list & unread counts WITHOUT
    // touching activeId so the admin stays on the order they were reading.
    const t = setInterval(() => load(), 10000);
    return () => clearInterval(t);
  }, []);

  const filteredThreads = useMemo(() => {
    let list = threads;
    if (filter === 'unread') list = list.filter((t) => t.unread > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          (t.customerName || '').toLowerCase().includes(q) ||
          (t.orderRef || '').toLowerCase().includes(q) ||
          (t.lastBody || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [threads, filter, search]);

  const unreadCount = threads.filter((t) => t.unread > 0).length;
  const active = threads.find((t) => t.orderId === activeId);

  // Pagination — keeps the inbox snappy even when the store has hundreds
  // of threads. Resets when filter or search changes.
  const { page, pageSize, setPage, setPageSize } = usePagination(15, [filter, search]);
  const paginatedThreads = useMemo(
    () => filteredThreads.slice((page - 1) * pageSize, page * pageSize),
    [filteredThreads, page, pageSize],
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero — matches the visual language used across the rest of admin */}
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
              <Sparkles className="w-3 h-3" /> Messages
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Customer conversations</h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Every chat is tied to an order. Status updates appear automatically in each thread.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 text-sm font-bold">
              <Inbox className="w-4 h-4" />
              {threads.length} {threads.length === 1 ? 'thread' : 'threads'}
            </div>
            {unreadCount > 0 && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-rose-500/90 backdrop-blur-md border border-white/20 text-sm font-bold">
                {unreadCount} unread
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <div className="grid grid-cols-12 gap-4">
          {/* Threads list */}
          <div className="col-span-12 md:col-span-5 lg:col-span-4">
            <Card className="overflow-hidden border-0 shadow-lg shadow-slate-200/60">
              {/* Search + filter toolbar */}
              <div className="px-3 py-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by customer, order, or message…"
                    className="w-full h-10 pl-10 pr-9 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 text-sm placeholder:text-slate-400"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center" aria-label="Clear">
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex bg-slate-100 rounded-xl p-1 text-xs font-bold">
                    <button
                      onClick={() => setFilter('all')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${filter === 'all' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilter('unread')}
                      className={`px-3 py-1.5 rounded-lg transition-all inline-flex items-center gap-1.5 ${filter === 'unread' ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Unread
                      {unreadCount > 0 && (
                        <span className="px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black">{unreadCount}</span>
                      )}
                    </button>
                  </div>
                  <button
                    onClick={load}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
              ) : filteredThreads.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center mb-3">
                    <MessageSquare className="w-8 h-8 text-blue-500" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    {search ? 'No matches' : filter === 'unread' ? 'No unread messages' : 'No conversations yet'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {search ? 'Try a different keyword.' : 'New orders start a chat automatically.'}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-[72vh] overflow-y-auto">
                  {paginatedThreads.map((t) => {
                    const isActive = t.orderId === activeId;
                    return (
                      <li key={t.orderId}>
                        <button
                          onClick={() => setActiveId(t.orderId)}
                          className={`w-full text-left px-4 py-3 transition-all relative group ${isActive ? 'bg-gradient-to-r from-blue-50 to-indigo-50' : 'hover:bg-slate-50'}`}
                        >
                          {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-gradient-to-b from-blue-500 to-indigo-600" />}
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black flex items-center justify-center text-sm shrink-0 shadow-sm">
                              {initials(t.customerName)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-sm text-slate-900 truncate">{t.customerName || 'Customer'}</p>
                                <span className="text-[11px] text-slate-500 shrink-0">{timeAgo(t.lastAt)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[11px] font-mono font-bold text-slate-500">#{t.orderRef}</span>
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_TINT[t.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                  {STATUS_LABEL[t.status] || t.status}
                                </span>
                                <span className="text-[11px] text-slate-500">{formatPeso(t.totalPrice || 0)}</span>
                              </div>
                              <p className={`text-sm truncate mt-1 ${t.unread > 0 ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
                                <span className={`font-bold ${t.lastFromRole === 'system' ? 'text-amber-700' : t.lastFromRole === 'admin' ? 'text-emerald-700' : t.lastFromRole === 'staff' ? 'text-violet-700' : 'text-blue-700'}`}>
                                  {t.lastFromRole === 'system' ? 'System' : t.lastFromRole === 'customer' ? 'Customer' : t.lastFromRole === 'admin' ? 'Store' : 'Staff'}:
                                </span> {t.lastBody}
                              </p>
                              {t.unread > 0 && (
                                <span className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                                  {t.unread} new
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {filteredThreads.length > pageSize && (
                <div className="border-t border-slate-100 p-3">
                  <Pagination
                    page={page}
                    total={filteredThreads.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    pageSizeOptions={[10, 15, 25, 50]}
                    itemLabel="thread"
                    itemLabelPlural="threads"
                    compact
                  />
                </div>
              )}
            </Card>
          </div>

          {/* Active chat */}
          <div className="col-span-12 md:col-span-7 lg:col-span-8">
            {!active ? (
              <Card className="border-0 shadow-lg shadow-slate-200/60">
                <CardContent className="py-20 text-center">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center mb-4">
                    <MessageSquare className="w-10 h-10 text-blue-500" />
                  </div>
                  <p className="text-base font-bold text-slate-700">Pick a conversation</p>
                  <p className="text-sm text-slate-500 mt-1">Choose a thread from the list to start replying.</p>
                </CardContent>
              </Card>
            ) : (
              <OrderChatPanel
                key={active.orderId}
                orderId={active.orderId}
                heightClass="h-[62vh]"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminMessages;
