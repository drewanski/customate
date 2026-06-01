import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Stepper } from '../components/Stepper';
import { Badge } from '../components/Badge';
import {
  Package, CheckCircle, Clock, Truck, CreditCard, User, Printer, Sparkles,
  AlertTriangle, MessageCircle, XCircle, Store, Send, Star, Factory, ShieldCheck,
  Inbox, Receipt, RotateCcw, ChevronLeft as ChevronLeftIcon,
} from 'lucide-react';
import {
  apiRequest, customerCancelOrder, fileReturn,
  getOrderChat, sendOrderChatMessage, getOrderTimeline,
  getChatUnreadCount,
} from '../api';
import { formatPeso, shortOrderCode } from '../utils/format';
import { useAuth } from '../hooks/useAuth';
import { ReviewModal } from '../components/ReviewModal';
import { OrderChatPanel } from '../components/chat/OrderChatPanel';

// Panel revision #11 — pipeline branches based on delivery method:
//   delivery: Received → Approved → In Production → Ready → Out for delivery → Completed
//   pickup:   Received → Approved → In Production → Ready → For pickup       → Completed
const STEPS_DELIVERY = ['Received', 'Approved', 'In Production', 'Ready', 'Out for delivery', 'Completed'];
const STEPS_PICKUP   = ['Received', 'Approved', 'In Production', 'Ready', 'For pickup',        'Completed'];

// Panel revision #10 — these statuses lock customer-side cancellation.
const CUSTOMER_CANCEL_LOCKED = new Set([
  'in_production', 'ready', 'out_for_delivery', 'for_pickup',
  'completed', 'shipped', 'delivered', 'cancelled', 'rejected', 'refunded',
]);

function statusToStep(status: string, _deliveryMethod: 'delivery' | 'pickup') {
  const map: Record<string, number> = {
    // Quotation workflow — collapses into step 0 (Received) until approved.
    quote_requested: 0,
    quoted: 0,
    accepted: 0,
    downpayment_paid: 1,  // downpayment verified → ready to approve
    pending: 0,
    approved: 1,
    in_production: 2,
    ready: 3,
    out_for_delivery: 4,
    for_pickup: 4,
    shipped: 4,
    delivered: 4,
    completed: 5,
    rejected: 0,
    cancelled: 0,
    refunded: 0,
  };
  return map[status] ?? 0;
}

const STATUS_LABEL: Record<string, string> = {
  quote_requested: 'Awaiting Quote',
  quoted: 'Quote Received',
  accepted: 'Awaiting Downpayment',
  downpayment_paid: 'Downpayment Verified',
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

const BADGE: Record<string, any> = {
  pending: 'warning',
  approved: 'success',
  in_production: 'info',
  ready: 'info',
  out_for_delivery: 'info',
  for_pickup: 'info',
  completed: 'success',
  shipped: 'info',
  delivered: 'success',
  rejected: 'danger',
  cancelled: 'danger',
  refunded: 'danger',
};

/**
 * Stage-by-stage explainer: what's happening NOW, what comes NEXT, who is
 * responsible. The customer should always know where things stand without
 * having to guess.
 */
function StageExplainer({ status, deliveryMethod }: { status: string; deliveryMethod: 'delivery' | 'pickup' }) {
  const isPickup = deliveryMethod === 'pickup';
  const cards: Record<string, { now: string; next: string; whose: string; icon: any; tint: string }> = {
    pending: {
      now: 'We received your order and our team will review it.',
      next: 'Once approved, your order goes into the production queue.',
      whose: 'Store team',
      icon: Inbox,
      tint: 'from-amber-500 to-orange-500',
    },
    approved: {
      now: 'Your order has been approved and queued for production.',
      next: 'A production staff member will start working on your items shortly.',
      whose: 'Store team',
      icon: CheckCircle,
      tint: 'from-emerald-500 to-teal-500',
    },
    in_production: {
      now: 'A production staff member is making your items right now.',
      next: 'Your items go through quality control before we mark them ready.',
      whose: 'Production team',
      icon: Factory,
      tint: 'from-blue-500 to-indigo-500',
    },
    ready: {
      now: 'Your items passed quality control and are packed.',
      next: isPickup
        ? 'We\'ll move it to ready-for-pickup as soon as our courier or staff is available.'
        : 'We\'ll hand it to our courier shortly — then it\'s out for delivery.',
      whose: 'Store team',
      icon: ShieldCheck,
      tint: 'from-violet-500 to-fuchsia-500',
    },
    out_for_delivery: {
      now: 'Your order is on its way to your delivery address.',
      next: 'You\'ll get a notification when it\'s marked delivered/completed.',
      whose: 'Courier',
      icon: Truck,
      tint: 'from-sky-500 to-blue-600',
    },
    for_pickup: {
      now: 'Your order is ready for pickup at our store.',
      next: 'Please bring a valid ID or your order number to claim it.',
      whose: 'You',
      icon: Store,
      tint: 'from-sky-500 to-blue-600',
    },
    completed: {
      now: 'Your order is complete — we hope you love it!',
      next: 'Please leave a review for each item. It helps other customers.',
      whose: 'You',
      icon: Star,
      tint: 'from-amber-500 to-yellow-500',
    },
    shipped: {
      now: 'Your order has shipped.',
      next: 'You\'ll see "completed" once it\'s delivered and confirmed.',
      whose: 'Courier',
      icon: Truck,
      tint: 'from-sky-500 to-blue-600',
    },
    delivered: {
      now: 'Your order has been delivered.',
      next: 'Leave a review and let us know how everything looked!',
      whose: 'You',
      icon: CheckCircle,
      tint: 'from-emerald-500 to-teal-500',
    },
    rejected: {
      now: 'This order was rejected by the store.',
      next: 'No further action needed. Contact support if you have questions.',
      whose: 'Store team',
      icon: XCircle,
      tint: 'from-rose-500 to-red-600',
    },
    cancelled: {
      now: 'This order was cancelled.',
      next: 'Inventory and any payment hold have been released.',
      whose: '—',
      icon: XCircle,
      tint: 'from-slate-500 to-slate-700',
    },
    refunded: {
      now: 'This order was refunded.',
      next: 'The refund has been issued back to the original payment method.',
      whose: 'Store team',
      icon: RotateCcw,
      tint: 'from-slate-500 to-slate-700',
    },
  };

  const card = cards[status] || cards.pending;
  const Icon = card.icon;

  return (
    <div className={`rounded-2xl bg-gradient-to-br ${card.tint} text-white p-5 shadow-md`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
          <Icon className="w-7 h-7" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">Right now</p>
          <p className="text-lg font-black mt-0.5">{card.now}</p>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">What's next</p>
              <p className="text-sm mt-0.5">{card.next}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-80">Who's handling it</p>
              <p className="text-sm mt-0.5 font-bold">{card.whose}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Per-event-type icon + tint so the timeline reads as a coloured story
// instead of a wall of monochrome circles.
function eventVisual(e: any) {
  // Most "check" events come with meta.status — use it to colour-tint.
  const status = e?.meta?.status;
  if (e.icon === 'receipt') return { Icon: Receipt, ring: 'border-blue-500',    bg: 'bg-blue-50',    fg: 'text-blue-600' };
  if (e.icon === 'x')       return { Icon: XCircle, ring: 'border-rose-500',    bg: 'bg-rose-50',    fg: 'text-rose-600' };
  if (e.icon === 'money')   return { Icon: RotateCcw, ring: 'border-slate-500', bg: 'bg-slate-50',   fg: 'text-slate-600' };
  // Status-tinted "check" events
  if (status === 'approved' || /approved/i.test(e.title))
    return { Icon: CheckCircle, ring: 'border-blue-500', bg: 'bg-blue-50', fg: 'text-blue-600' };
  if (status === 'in_production' || /production/i.test(e.title))
    return { Icon: Factory, ring: 'border-violet-500', bg: 'bg-violet-50', fg: 'text-violet-600' };
  if (status === 'ready' || /ready/i.test(e.title))
    return { Icon: ShieldCheck, ring: 'border-emerald-500', bg: 'bg-emerald-50', fg: 'text-emerald-600' };
  if (status === 'out_for_delivery' || /out for delivery|shipped/i.test(e.title))
    return { Icon: Truck, ring: 'border-sky-500', bg: 'bg-sky-50', fg: 'text-sky-600' };
  if (status === 'for_pickup' || /for pickup/i.test(e.title))
    return { Icon: Store, ring: 'border-sky-500', bg: 'bg-sky-50', fg: 'text-sky-600' };
  if (status === 'completed' || /complete/i.test(e.title))
    return { Icon: Star, ring: 'border-amber-500', bg: 'bg-amber-50', fg: 'text-amber-600' };
  return { Icon: Clock, ring: 'border-slate-300', bg: 'bg-slate-50', fg: 'text-slate-500' };
}

function relativeOrTime(d: Date) {
  const ms = Date.now() - d.getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function OrderTracking() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const isAdminView = user?.role === 'admin' && location.pathname.startsWith('/admin');

  // Tab routing — Tracking / Messages / Details, persisted in the URL so
  // OrderCard "Message" deep-links and browser back/forward work naturally.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'tracking' | 'messages' | 'details') || 'tracking';
  const setTab = (tab: 'tracking' | 'messages' | 'details') => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'tracking') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  // Unread messages on this order (drives the dot on the Messages tab pill).
  const [unreadCount, setUnreadCount] = useState(0);

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Timeline (curated events from /timeline)
  const [timeline, setTimeline] = useState<any[]>([]);

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  // Return modal
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('damaged');
  const [returnDescription, setReturnDescription] = useState('');
  const [returnPhotos, setReturnPhotos] = useState<string[]>([]);
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnMessage, setReturnMessage] = useState('');

  // Chat widget
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<any[]>([]);
  const [chatBody, setChatBody] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  // Review modal
  const [reviewItem, setReviewItem] = useState<{ sku: string; name: string; thumb?: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        if (!orderId) {
          const my = await apiRequest('/orders/my');
          setOrder(my?.[0] || null);
          return;
        }
        const data = await apiRequest(`/orders/${orderId}`);
        setOrder(data);
      } catch (err: any) {
        setError(err?.message || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  // Unread chat count for this order — refreshed on mount, when the
  // Messages tab opens (clears the badge), and on a slow background poll.
  useEffect(() => {
    if (!order?.id) return;
    let cancelled = false;
    const fetchUnread = async () => {
      try {
        const data = await getChatUnreadCount();
        if (cancelled) return;
        const n = data?.perOrder?.[order.id] || 0;
        // Messages tab visit "reads" the thread — zero out locally.
        setUnreadCount(activeTab === 'messages' ? 0 : n);
      } catch { /* non-fatal */ }
    };
    fetchUnread();
    const t = setInterval(fetchUnread, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, [order?.id, activeTab]);

  // Load curated timeline whenever order changes.
  useEffect(() => {
    if (!order?.id) return;
    let cancelled = false;
    getOrderTimeline(order.id)
      .then((events) => { if (!cancelled) setTimeline(events || []); })
      .catch(() => { if (!cancelled) setTimeline([]); });
    return () => { cancelled = true; };
  }, [order?.id, order?.status]);

  // Poll chat thread when open.
  useEffect(() => {
    if (!chatOpen || !order?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const msgs = await getOrderChat(order.id);
        if (!cancelled) setChat(msgs || []);
      } catch { /* non-fatal */ }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [chatOpen, order?.id]);

  const deliveryMethod: 'delivery' | 'pickup' = order?.deliveryMethod === 'pickup' ? 'pickup' : 'delivery';
  const steps = useMemo(
    () => (deliveryMethod === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY).map((label, i) => ({
      id: String(i + 1),
      label,
      description: i === 0 && order?.createdAt ? new Date(order.createdAt).toLocaleString() : '',
    })),
    [deliveryMethod, order?.createdAt]
  );
  const currentStep = useMemo(() => statusToStep(order?.status || 'pending', deliveryMethod), [order?.status, deliveryMethod]);

  const cancelLocked = order && CUSTOMER_CANCEL_LOCKED.has(order.status);
  const canFileReturn = order && ['completed', 'delivered', 'shipped'].includes(order.status);
  const canReview = order && ['completed', 'delivered', 'shipped'].includes(order.status);

  const onConfirmCancel = async () => {
    if (!cancelReason.trim()) return;
    setCancelBusy(true);
    try {
      const updated = await customerCancelOrder(order.id, cancelReason.trim());
      setOrder(updated);
      setCancelOpen(false);
      setCancelReason('');
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel');
    } finally {
      setCancelBusy(false);
    }
  };

  const onSubmitReturn = async () => {
    if (!returnDescription.trim()) return;
    setReturnBusy(true);
    setReturnMessage('');
    try {
      await fileReturn({
        orderId: order.id,
        reason: returnReason,
        description: returnDescription.trim(),
        photos: returnPhotos,
      });
      setReturnMessage('Return request submitted — we\'ll review it shortly.');
      setReturnDescription('');
      setReturnPhotos([]);
    } catch (err: any) {
      setReturnMessage(err?.message || 'Failed to submit return');
    } finally {
      setReturnBusy(false);
    }
  };

  const onChatSend = async () => {
    if (!chatBody.trim() || !order?.id) return;
    setChatBusy(true);
    try {
      const m = await sendOrderChatMessage(order.id, chatBody.trim());
      setChat((prev) => [...prev, m]);
      setChatBody('');
    } catch (err: any) {
      alert(err?.message || 'Failed to send');
    } finally {
      setChatBusy(false);
    }
  };

  const onPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    Promise.all(
      files.map((f) => new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      })),
    ).then((urls) => setReturnPhotos((prev) => [...prev, ...urls].slice(0, 6)));
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p>Loading...</p></div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-red-600">{error}</p></div>;
  }
  if (!order) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-gray-600">No orders found.</p></div>;
  }

  // Status-tinted hero gradient (Lazada/Shopee-style big status hero).
  const statusHeroGradient: Record<string, string> = {
    pending:          'from-amber-500 to-orange-500',
    approved:         'from-blue-500 to-indigo-600',
    in_production:    'from-violet-500 to-fuchsia-600',
    ready:            'from-emerald-500 to-teal-600',
    out_for_delivery: 'from-sky-500 to-blue-600',
    for_pickup:       'from-sky-500 to-blue-600',
    completed:        'from-emerald-500 to-teal-600',
    shipped:          'from-cyan-500 to-blue-600',
    delivered:        'from-green-500 to-emerald-600',
    cancelled:        'from-slate-500 to-slate-700',
    rejected:         'from-rose-500 to-red-600',
    refunded:         'from-rose-500 to-red-600',
  };
  const hero = statusHeroGradient[order.status] || 'from-blue-600 to-indigo-700';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-bold text-slate-600 hover:text-slate-900 mb-3">
        <ChevronLeftIcon className="w-4 h-4" /> My orders
      </Link>

      {/* Lazada-style big status hero */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${hero} text-white shadow-xl shadow-slate-300/40`}>
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-black/10 blur-3xl pointer-events-none" />
        <div className="relative p-5 md:p-7">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase tracking-widest mb-2">
                <Sparkles className="w-3 h-3" /> Order tracking
              </div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-80">Status</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-bold">
                  Order #{shortOrderCode(order.id)}
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
                {STATUS_LABEL[order.status] || order.status}
              </h1>
              {order.requestedDeliveryDate && (
                <p className="mt-1.5 text-sm opacity-90">
                  Expected by <span className="font-bold">{new Date(order.requestedDeliveryDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold">
                {deliveryMethod === 'pickup' ? <Store className="w-3.5 h-3.5" /> : <Truck className="w-3.5 h-3.5" />}
                {deliveryMethod === 'pickup' ? 'In-store pickup' : 'Delivery'}
              </div>
              <span className="text-xs opacity-80">{order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar — Shopee-style sticky-on-mobile CTAs */}
      {!isAdminView && (
        <div className="mt-3 flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-slate-50/80 backdrop-blur-md py-2 -mx-4 px-4 md:static md:bg-transparent md:backdrop-blur-0 md:py-0 md:mx-0 md:px-0">
          {!cancelLocked ? (
            <button
              onClick={() => setCancelOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 font-bold text-sm shadow-sm"
            >
              <XCircle className="w-4 h-4" /> Cancel order
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-sm">
              <AlertTriangle className="w-4 h-4" />
              Cancellation locked at this stage
            </div>
          )}
          {canFileReturn && (
            <button
              onClick={() => setReturnOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 font-bold text-sm shadow-sm"
            >
              <Package className="w-4 h-4" /> File return
            </button>
          )}
        </div>
      )}

      {/* TikTok-style tabs — Tracking / Messages / Details. Messages is a
          first-class destination so customers don't have to hunt for the
          chat. Unread dot makes pending replies impossible to miss. */}
      <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex">
          {[
            { key: 'tracking', label: 'Tracking', Icon: Truck },
            { key: 'messages', label: 'Messages', Icon: MessageCircle },
            { key: 'details',  label: 'Details',  Icon: Receipt },
          ].map(({ key, label, Icon }) => {
            const active = activeTab === key;
            const showDot = key === 'messages' && unreadCount > 0 && !active;
            return (
              <button
                key={key}
                onClick={() => setTab(key as any)}
                className={`relative flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-bold transition-colors ${
                  active
                    ? 'text-blue-700 bg-gradient-to-b from-white to-blue-50/40'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
                {showDot && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600" />}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'tracking' && (
      <Card className="mb-6 mt-4">
        <CardContent className="pt-5">
          <Stepper steps={steps} currentStep={currentStep} />

          <div className="mt-5">
            <StageExplainer status={order.status} deliveryMethod={deliveryMethod} />
          </div>

          {(order.status === 'rejected' || order.status === 'cancelled') && (order.rejectionReason || order.cancellationReason) && (
            <div className="mt-5 p-4 rounded-xl border border-rose-200 bg-rose-50 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-900 text-sm">
                  {order.status === 'rejected' ? 'Order rejected by the store' : 'Order cancelled'}
                </p>
                <p className="text-rose-800 text-sm mt-1">{order.rejectionReason || order.cancellationReason}</p>
              </div>
            </div>
          )}

        </CardContent>
      </Card>
      )}

      {activeTab === 'details' && (
      <Card className="mb-6 mt-4">
        <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Items</h4>
                {isAdminView &&
                  (order.items || []).some(
                    (it: any) => it.isCustomized || it.customization?.previewImage,
                  ) && (
                    <Link
                      to={`/admin/orders/${orderId}/design`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Design Sheet
                    </Link>
                  )}
              </div>
              <div className="space-y-2">
                {(order.items || []).map((it: any, idx: number) => {
                  const c = it.customization || {};
                  const hasPreview = !!c.previewImage;
                  const isCustom = !!c.isCustomized;
                  return (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-16 h-16 bg-blue-100 rounded flex items-center justify-center overflow-hidden flex-shrink-0 relative group">
                        {hasPreview ? (
                          <a href={c.previewImage} target="_blank" rel="noopener noreferrer" className="block w-full h-full" title="Open design at full size">
                            <img src={c.previewImage} alt="Design" className="w-full h-full object-cover" />
                          </a>
                        ) : (
                          <Package className="w-8 h-8 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium">{it.name}</p>
                          {isCustom && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-black uppercase tracking-wider">
                              <Sparkles className="w-2.5 h-2.5" />
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">Qty: {it.quantity} × {formatPeso(it.unitPrice)}</p>
                        {c && (
                          <div className="text-xs text-gray-500 mt-1">
                            {c.shirtType && <span>Type: {c.shirtType} | </span>}
                            {c.size && <span>Size: {c.size} | </span>}
                            {c.color && <span>Color: {c.color} | </span>}
                            {c.placement && <span>Placement: {c.placement}</span>}
                            {c.text && <p>Text: "{c.text}"</p>}
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {hasPreview && (
                            <a
                              href={c.previewImage}
                              download={`design-${order.id?.slice(-6)}-${idx + 1}.png`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100"
                            >
                              <Printer className="w-3 h-3" /> Download design
                            </a>
                          )}
                          {!isAdminView && canReview && (
                            <button
                              onClick={() => setReviewItem({ sku: it.sku, name: it.name, thumb: c.previewImage })}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100"
                            >
                              <Star className="w-3 h-3" /> Rate this product
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="font-medium">{formatPeso(it.quantity * it.unitPrice)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" /> Recipient
                </h4>
                <p className="text-gray-600 text-sm">{order.recipientName || order.customerName}</p>
                {order.contactPhone && <p className="text-gray-600 text-sm">{order.contactPhone}</p>}
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  {deliveryMethod === 'pickup' ? <Store className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                  {deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping Address'}
                </h4>
                <p className="text-gray-600 text-sm whitespace-pre-line">
                  {deliveryMethod === 'pickup' ? 'In-store pickup at Bryle Closet Printing Services' : order.shippingAddress}
                </p>

                {/* Courier handoff — surfaces once admin has assigned a
                    3rd-party courier. The customer can copy the tracking
                    number, tap the URL to open the courier's site, or
                    call the rider directly. */}
                {order.courier && order.courier.name && deliveryMethod !== 'pickup' && (
                  <div className="mt-3 p-3 rounded-xl border border-sky-200 bg-sky-50">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-sky-700 mb-1.5 flex items-center gap-1">
                      <Truck className="w-3 h-3" /> Courier
                    </p>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Service:</span>
                        <span className="font-bold text-gray-900">{order.courier.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-gray-500">Tracking #:</span>
                        <code className="font-mono bg-white border border-sky-200 px-1.5 py-0.5 rounded text-xs">{order.courier.trackingNumber}</code>
                        {order.courier.trackingUrl && (
                          <a
                            href={order.courier.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-sky-700 hover:underline text-xs font-bold"
                          >
                            Track on {order.courier.name} →
                          </a>
                        )}
                      </div>
                      {order.courier.contactPhone && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-500">Rider:</span>
                          <a href={`tel:${order.courier.contactPhone}`} className="text-sky-700 hover:underline">
                            {order.courier.contactPhone}
                          </a>
                        </div>
                      )}
                      {order.courier.notes && (
                        <p className="text-xs text-gray-600 italic mt-1">"{order.courier.notes}"</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Payment
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-gray-600">Method:</span><span className="capitalize">{order.paymentMethod}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Status:</span><span className={`capitalize ${order.paymentStatus === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>{order.paymentStatus}</span></div>
                  {order.paidAmount > 0 && <div className="flex justify-between"><span className="text-gray-600">Paid:</span><span>{formatPeso(order.paidAmount)}</span></div>}
                </div>
              </div>

              <div className="pt-3 border-t">
                <h4 className="font-medium text-gray-900 mb-2">Order Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Subtotal ({order.totalQty} items)</span><span>{formatPeso((order.subtotalBeforeDiscount || order.totalPrice) - (order.rushFeeAmount || 0) - (order.shippingFee || 0))}</span></div>
                  {order.rushFeeAmount > 0 && <div className="flex justify-between"><span className="text-gray-600">Rush fee</span><span>+{formatPeso(order.rushFeeAmount)}</span></div>}
                  {order.discountAmount > 0 && <div className="flex justify-between"><span className="text-gray-600">Discount {order.couponCode ? `(${order.couponCode})` : ''}</span><span>-{formatPeso(order.discountAmount)}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-600">{deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping'}</span><span>{order.shippingFee ? formatPeso(order.shippingFee) : 'Free'}</span></div>
                  <div className="flex justify-between font-medium pt-2 border-t"><span>Total</span><span className="text-blue-600">{formatPeso(order.totalPrice)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      )}

      {activeTab === 'messages' && (
        <div className="mb-6 mt-4">
          <OrderChatPanel
            orderId={order.id}
            initialOrder={order}
            hideViewOrderLink   // already on the order page
          />
        </div>
      )}

      {activeTab === 'tracking' && (
      <>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center mb-3">
                <Clock className="w-7 h-7 text-blue-500" />
              </div>
              <p className="text-sm font-bold text-slate-700">Nothing here yet</p>
              <p className="text-xs text-slate-500 mt-1">As your order moves through each stage, you'll see updates here.</p>
            </div>
          ) : (
            <ol className="relative border-l-2 border-dashed border-slate-200 ml-4 space-y-5">
              {timeline.map((e, i) => {
                const v = eventVisual(e);
                const Icon = v.Icon;
                return (
                  <li key={i} className="ml-6 relative">
                    <span className={`absolute -left-[27px] w-9 h-9 rounded-full bg-white border-2 ${v.ring} flex items-center justify-center shadow-sm`}>
                      <Icon className={`w-4.5 h-4.5 ${v.fg}`} />
                    </span>
                    <div className={`rounded-xl px-3 py-2.5 border border-slate-100 ${v.bg}/50`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 text-sm">{e.title}</p>
                        <p className="text-xs text-slate-500">{e.at ? relativeOrTime(new Date(e.at)) : ''}</p>
                      </div>
                      {e.body && <p className="text-sm text-slate-700 mt-0.5">{e.body}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* How CustoMate orders work — quick explainer (always visible) */}
      <Card className="mt-6 bg-gradient-to-br from-slate-50 to-blue-50">
        <CardHeader><CardTitle>How CustoMate orders work</CardTitle></CardHeader>
        <CardContent>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-slate-700">
            <li className="p-3 rounded-xl bg-white border border-slate-200">
              <p className="font-bold text-slate-900">1. You place the order</p>
              <p className="mt-1">Customize a product, choose delivery or pickup, optionally pick rush, then checkout.</p>
            </li>
            <li className="p-3 rounded-xl bg-white border border-slate-200">
              <p className="font-bold text-slate-900">2. Store reviews & approves</p>
              <p className="mt-1">The store team checks your design and stock, then approves the order to start production.</p>
            </li>
            <li className="p-3 rounded-xl bg-white border border-slate-200">
              <p className="font-bold text-slate-900">3. Production starts</p>
              <p className="mt-1">A production staff member is assigned, prints/sews your item, and uploads a QC photo when done.</p>
            </li>
            <li className="p-3 rounded-xl bg-white border border-slate-200">
              <p className="font-bold text-slate-900">4. Quality check</p>
              <p className="mt-1">The store reviews the QC photo. If it passes, your order is marked Ready. If not, it goes back to production.</p>
            </li>
            <li className="p-3 rounded-xl bg-white border border-slate-200">
              <p className="font-bold text-slate-900">5. Delivery or pickup</p>
              <p className="mt-1">Delivery orders go out via courier; pickup orders are held at the store with a notification.</p>
            </li>
            <li className="p-3 rounded-xl bg-white border border-slate-200">
              <p className="font-bold text-slate-900">6. Completed → review</p>
              <p className="mt-1">Once you receive it, the order is completed. Please rate each item to help other customers.</p>
            </li>
          </ol>
        </CardContent>
      </Card>
      </>
      )}

      {/* Cancel modal */}
      {cancelOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setCancelOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Cancel this order?</h3>
              <p className="text-sm text-slate-500 mt-1">Tell us why so we can improve and our team understands what happened.</p>
            </div>
            <div className="p-5 space-y-3">
              <label className="text-sm font-bold text-slate-700">Reason</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="E.g., I changed my mind, found a similar product, etc."
                rows={4}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 pt-2">
                <button onClick={() => setCancelOpen(false)} className="flex-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Keep order</button>
                <button onClick={onConfirmCancel} disabled={cancelBusy || !cancelReason.trim()} className="flex-1 px-4 py-2 rounded-xl bg-rose-600 text-white font-bold disabled:opacity-50">
                  {cancelBusy ? 'Cancelling…' : 'Cancel order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return modal */}
      {returnOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setReturnOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">File a return / damage report</h3>
              <p className="text-sm text-slate-500 mt-1">We'll review it and respond within 1–2 business days.</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Reason</label>
                <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="damaged">Damaged item</option>
                  <option value="wrong_print">Wrong print / design</option>
                  <option value="wrong_size">Wrong size</option>
                  <option value="wrong_item">Wrong item shipped</option>
                  <option value="quality_issue">Quality issue</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Describe what happened</label>
                <textarea value={returnDescription} onChange={(e) => setReturnDescription(e.target.value)} rows={4} placeholder="Please include any details that will help us decide." className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Photos (optional)</label>
                <input type="file" accept="image/*" multiple onChange={onPhotoSelect} className="text-sm" />
                {returnPhotos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {returnPhotos.map((src, i) => (<img key={i} src={src} className="w-16 h-16 rounded-lg object-cover border border-slate-200" alt="" />))}
                  </div>
                )}
              </div>
              {returnMessage && <p className={`text-sm font-semibold ${returnMessage.startsWith('Return request submitted') ? 'text-emerald-700' : 'text-rose-700'}`}>{returnMessage}</p>}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setReturnOpen(false)} className="flex-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Close</button>
                <button onClick={onSubmitReturn} disabled={returnBusy || !returnDescription.trim()} className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">
                  {returnBusy ? 'Submitting…' : 'Submit return'}
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
