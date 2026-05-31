import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, X, Inbox, Sparkles, Package, Clock, CheckCircle2, Factory,
  ShieldCheck, Truck, Store, Star, XCircle, RotateCcw,
} from 'lucide-react';
import { apiRequest, getMyOrders, customerCancelOrder, fileReturn as fileReturnApi } from '../api';
import { OrderCard } from '../components/orders/OrderCard';
import { ReviewModal } from '../components/ReviewModal';

interface TabDef {
  key: string;
  label: string;
  match: (status: string) => boolean;
  Icon: any;
}

const TABS: TabDef[] = [
  { key: 'all',            label: 'All',            match: () => true,                                                                  Icon: Inbox },
  { key: 'pending',        label: 'To approve',     match: (s) => s === 'pending',                                                       Icon: Clock },
  { key: 'production',     label: 'In production',  match: (s) => s === 'approved' || s === 'in_production',                             Icon: Factory },
  { key: 'ready',          label: 'Ready',          match: (s) => s === 'ready',                                                         Icon: ShieldCheck },
  { key: 'to_receive',     label: 'To receive',     match: (s) => s === 'out_for_delivery' || s === 'for_pickup' || s === 'shipped',     Icon: Truck },
  { key: 'completed',      label: 'Completed',      match: (s) => s === 'completed' || s === 'delivered',                                Icon: Star },
  { key: 'cancelled',      label: 'Cancelled',      match: (s) => s === 'cancelled' || s === 'rejected',                                 Icon: XCircle },
  { key: 'refunded',       label: 'Refunded',       match: (s) => s === 'refunded',                                                      Icon: RotateCcw },
];

export function MyOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'all';
  const [search, setSearch] = useState('');

  // Cancel + review modal state
  const [cancelOrder, setCancelOrder] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [reviewItem, setReviewItem] = useState<{ sku: string; name: string; thumb?: string } | null>(null);
  const [returnOrder, setReturnOrder] = useState<any | null>(null);
  const [returnReason, setReturnReason] = useState('damaged');
  const [returnDesc, setReturnDesc] = useState('');
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnMsg, setReturnMsg] = useState('');

  const navigate = useNavigate();

  const reload = async () => {
    setLoading(true);
    setErr('');
    try {
      const data = await getMyOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of TABS) c[t.key] = orders.filter((o) => t.match(o.status)).length;
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab) || TABS[0];
    let list = orders.filter((o) => tab.match(o.status));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const ref = String(o.id || o._id || '').toLowerCase();
        if (ref.includes(q)) return true;
        const items = Array.isArray(o.items) ? o.items : [];
        return items.some((it: any) => (it.name || '').toLowerCase().includes(q));
      });
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, activeTab, search]);

  const setTab = (key: string) => {
    if (key === 'all') setSearchParams({});
    else setSearchParams({ tab: key });
  };

  const onCancelClick = (orderId: string) => {
    const o = orders.find((x) => (x.id || x._id) === orderId);
    if (!o) return;
    setCancelOrder(o);
    setCancelReason('');
  };
  const onConfirmCancel = async () => {
    if (!cancelOrder || !cancelReason.trim()) return;
    setCancelBusy(true);
    try {
      await customerCancelOrder(cancelOrder.id || cancelOrder._id, cancelReason.trim());
      setCancelOrder(null);
      setCancelReason('');
      await reload();
    } catch (e: any) {
      alert(e?.message || 'Failed to cancel');
    } finally {
      setCancelBusy(false);
    }
  };

  const onReorder = (orderId: string) => {
    // Re-order: navigate to the catalog. A future enhancement would re-fill
    // the cart automatically. For now, this gives the customer a fast jump.
    navigate('/products');
  };

  const onRate = (orderId: string) => {
    const o = orders.find((x) => (x.id || x._id) === orderId);
    if (!o) return;
    const it = (o.items || []).find((x: any) => x.sku);
    if (it) setReviewItem({ sku: it.sku, name: it.name, thumb: it?.customization?.previewImage });
  };

  const onFileReturn = (orderId: string) => {
    const o = orders.find((x) => (x.id || x._id) === orderId);
    if (!o) return;
    setReturnOrder(o);
    setReturnReason('damaged');
    setReturnDesc('');
    setReturnMsg('');
  };
  const onSubmitReturn = async () => {
    if (!returnOrder || !returnDesc.trim()) return;
    setReturnBusy(true);
    setReturnMsg('');
    try {
      await fileReturnApi({ orderId: returnOrder.id || returnOrder._id, reason: returnReason, description: returnDesc.trim() });
      setReturnMsg('Return request submitted — we\'ll review it shortly.');
      setReturnDesc('');
      await reload();
    } catch (e: any) {
      setReturnMsg(e?.message || 'Failed to submit return');
    } finally {
      setReturnBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero — same gradient family as the rest of the system */}
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
        <div className="relative max-w-6xl mx-auto px-4 lg:px-8 py-8 md:py-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-widest mb-3">
            <Sparkles className="w-3 h-3" /> My orders
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Your order history</h1>
          <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
            Track every order, rate completed items, and re-order favourites.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 lg:px-8 -mt-4">
        {/* Tabs — Shopee/Lazada-style horizontal scroller */}
        <div className="bg-white rounded-2xl shadow-md shadow-slate-200/60 border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <div className="flex items-center min-w-max px-2 py-2 gap-1">
              {TABS.map((t) => {
                const active = activeTab === t.key;
                const Icon = t.Icon;
                const count = tabCounts[t.key];
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${
                      active
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                    {count > 0 && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-black ${active ? 'bg-white text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Search bar */}
          <div className="px-3 pb-3 pt-1">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by order ID or product name…"
                className="w-full h-11 pl-10 pr-9 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 text-sm placeholder:text-slate-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center" aria-label="Clear">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Orders list */}
        <div className="mt-4 pb-12">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                  <div className="h-4 w-1/3 bg-slate-100 rounded animate-pulse" />
                  <div className="mt-3 flex gap-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-xl animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 bg-slate-100 rounded animate-pulse" />
                      <div className="h-3 w-1/2 bg-slate-100 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : err ? (
            <div className="bg-white border border-rose-200 rounded-2xl p-6 text-rose-700 text-sm font-bold text-center">{err}</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center mb-3">
                <Package className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-base font-bold text-slate-700">
                {search ? 'No matching orders' : activeTab === 'all' ? 'No orders yet' : `No ${TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} orders`}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {search ? 'Try another search.' : 'When you place an order, it shows up here.'}
              </p>
              <Link
                to="/products"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-md shadow-blue-200 hover:shadow-lg"
              >
                Browse products
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((o) => (
                <OrderCard
                  key={o.id || o._id}
                  order={o}
                  onCancel={onCancelClick}
                  onReorder={onReorder}
                  onRate={onRate}
                  onFileReturn={onFileReturn}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cancel modal */}
      {cancelOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setCancelOrder(null)}>
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-rose-50 to-orange-50">
              <h3 className="text-lg font-bold text-slate-900">Cancel order #{String(cancelOrder.id || cancelOrder._id || '').slice(-6).toUpperCase()}?</h3>
              <p className="text-sm text-slate-600 mt-0.5">Tell us why — the store needs a reason on file.</p>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="E.g., changed my mind, ordered the wrong size…"
                rows={4}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 text-sm"
              />
              <div className="flex gap-2 pt-1">
                <button onClick={() => setCancelOrder(null)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold">Keep order</button>
                <button onClick={onConfirmCancel} disabled={cancelBusy || !cancelReason.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 text-white font-bold disabled:opacity-50">
                  {cancelBusy ? 'Cancelling…' : 'Cancel order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return modal */}
      {returnOrder && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setReturnOrder(null)}>
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-br from-blue-50 to-indigo-50">
              <h3 className="text-lg font-bold text-slate-900">File a return</h3>
              <p className="text-sm text-slate-600 mt-0.5">Order #{String(returnOrder.id || returnOrder._id || '').slice(-6).toUpperCase()}</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Reason</label>
                <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 text-sm">
                  <option value="damaged">Damaged item</option>
                  <option value="wrong_print">Wrong print / design</option>
                  <option value="wrong_size">Wrong size</option>
                  <option value="wrong_item">Wrong item shipped</option>
                  <option value="quality_issue">Quality issue</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">What happened?</label>
                <textarea value={returnDesc} onChange={(e) => setReturnDesc(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 text-sm" placeholder="Help us understand what went wrong." />
              </div>
              {returnMsg && <p className={`text-sm font-semibold ${returnMsg.startsWith('Return request submitted') ? 'text-emerald-700' : 'text-rose-700'}`}>{returnMsg}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setReturnOrder(null)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold">Close</button>
                <button onClick={onSubmitReturn} disabled={returnBusy || !returnDesc.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold disabled:opacity-50">
                  {returnBusy ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      <ReviewModal
        open={!!reviewItem}
        onClose={() => setReviewItem(null)}
        sku={reviewItem?.sku || ''}
        productName={reviewItem?.name || ''}
        thumbnailSrc={reviewItem?.thumb}
      />
    </div>
  );
}

export default MyOrders;
