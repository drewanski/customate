import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Send, Package, Truck, Store, Info, Sparkles, ExternalLink, MessageSquare,
  CheckCircle2, XCircle, Image as ImageIcon, Loader2, FileText, Upload,
} from 'lucide-react';
import {
  getOrderChat, sendOrderChatMessage, apiRequest,
  acceptQuotation, declineQuotation, verifyPayment, rejectPayment, uploadPaymentProof,
  createQuotationPaymentLink,
} from '../../api';
import { formatPeso } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';

interface OrderChatPanelProps {
  orderId: string;
  initialOrder?: any;
  showHeader?: boolean;
  heightClass?: string;
  hideViewOrderLink?: boolean;
}

const STATUS_TINT: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  in_production: 'bg-violet-100 text-violet-700 border-violet-200',
  ready: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  out_for_delivery: 'bg-sky-100 text-sky-700 border-sky-200',
  for_pickup: 'bg-sky-100 text-sky-700 border-sky-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  shipped: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
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
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  refunded: 'Refunded',
};

// Avatar tint per role — matches the rest of the system palette.
const AVATAR_TINT: Record<string, string> = {
  customer: 'bg-gradient-to-br from-blue-500 to-indigo-600',
  admin: 'bg-gradient-to-br from-emerald-500 to-teal-600',
  staff: 'bg-gradient-to-br from-violet-500 to-fuchsia-600',
  system: 'bg-gradient-to-br from-amber-400 to-orange-500',
};

function initialsOf(name?: string, role?: string) {
  if (role === 'system') return 'CM';
  if (!name) return role === 'admin' ? 'A' : role === 'staff' ? 'S' : '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Quick-reply chips for 3rd-party delivery coordination. The store doesn't
 * run its own fleet — orders ship via Lalamove, LBC, Grab, J&T, etc — so
 * most chat exchanges in the ready/out-for-delivery window are about
 * picking + sharing a courier. These templates skip the retyping.
 *
 * Customer-side chips ask which courier they'd prefer; admin-side chips
 * confirm dispatch + hand over tracking. Picked replies drop the text
 * into the composer; the user can edit before sending.
 */
function deliveryQuickReplies(
  role: 'customer' | 'admin' | 'staff' | 'system',
  order: any,
): { label: string; text: string }[] {
  if (!order) return [];
  const status = order.status;
  // Only show these chips in the ready / out-for-delivery window for
  // delivery orders. Pickup orders + earlier/later stages don't need them.
  if (order.deliveryMethod === 'pickup') return [];
  if (!['ready', 'out_for_delivery', 'approved', 'in_production'].includes(status)) return [];

  if (role === 'customer') {
    return [
      { label: 'Lalamove please', text: 'Could you please ship via Lalamove? Thanks!' },
      { label: 'LBC please',      text: 'Please ship via LBC. Thanks!' },
      { label: 'Grab Express',    text: 'Please send via Grab Express if possible.' },
      { label: 'J&T Express',     text: 'Please ship via J&T Express.' },
      { label: 'No preference',   text: 'Any courier is fine, whichever is fastest.' },
      { label: 'Ask delivery ETA', text: "What's the estimated delivery date?" },
    ];
  }
  if (role === 'admin' || role === 'staff') {
    return [
      { label: 'Ask courier pref', text: 'Hi! Which courier would you prefer for delivery — Lalamove, LBC, Grab Express, or J&T Express?' },
      { label: 'Confirm dispatch', text: "Your order has been dispatched via {courier} — tracking number {ref}. ETA {date}." },
      { label: 'Re-attempt note',  text: 'Heads up — the rider tried to deliver but no one was at the address. We\'ll re-attempt tomorrow.' },
      { label: 'Address check',    text: 'Can you confirm your shipping address + a contact number the rider can reach?' },
    ];
  }
  return [];
}

function formatDayLabel(d: Date) {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (sameDay) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeAgo(d: Date) {
  const ms = Date.now() - d.getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return formatTime(d);
}

/**
 * Order-scoped chat panel.
 *
 * Visuals:
 *   - Order-context header (status pill, delivery type, customer summary,
 *     items strip with thumbnails)
 *   - Day dividers between messages from different calendar days
 *   - Avatar circle per sender (role-tinted gradient)
 *   - System messages render as centered amber pills with an Info icon
 *   - User bubbles are colour-coded by sender role
 *   - 4-sec poll, auto-scroll-to-bottom unless user has scrolled up
 *
 * Used by customer OrderTracking, admin OrderDetailDrawer, AdminMessages
 * inbox, and the staff task-card modal.
 */
export function OrderChatPanel({
  orderId,
  initialOrder,
  showHeader = true,
  heightClass = 'h-96',
  hideViewOrderLink = false,
}: OrderChatPanelProps) {
  const { user } = useAuth();
  const myRole = user?.role === 'admin' ? 'admin' : user?.role === 'production_staff' ? 'staff' : 'customer';

  const [order, setOrder] = useState<any>(initialOrder || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Payment-proof upload modal — open when the customer needs to send
  // a downpayment/balance screenshot. Stage is decided by current order
  // status: 'accepted' → downpayment; 'ready' → balance.
  const [proofOpen, setProofOpen] = useState(false);
  const [proofStage, setProofStage] = useState<'downpayment' | 'balance'>('downpayment');
  const [proofMethod, setProofMethod] = useState<'gcash' | 'paymaya' | 'bank' | 'cash'>('gcash');
  const [proofReference, setProofReference] = useState('');
  const [proofImages, setProofImages] = useState<string[]>([]);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofErr, setProofErr] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollPinned = useRef(true);

  useEffect(() => {
    if (initialOrder || !orderId) return;
    let cancelled = false;
    apiRequest(`/orders/${orderId}`)
      .then((data) => { if (!cancelled) setOrder(data); })
      .catch(() => { /* the chat still works without it */ });
    return () => { cancelled = true; };
  }, [orderId, initialOrder]);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const list = await getOrderChat(orderId);
        if (!cancelled) setMessages(Array.isArray(list) ? list : []);
      } catch { /* non-fatal */ }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [orderId]);

  useEffect(() => {
    if (autoScrollPinned.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  const onScroll = () => {
    if (!listRef.current) return;
    const el = listRef.current;
    autoScrollPinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const onSend = async () => {
    if (!body.trim() || !orderId) return;
    setBusy(true);
    setErr('');
    try {
      const m = await sendOrderChatMessage(orderId, body.trim());
      setMessages((prev) => [...prev, m]);
      setBody('');
      autoScrollPinned.current = true;
    } catch (e: any) {
      setErr(e?.message || 'Failed to send');
    } finally {
      setBusy(false);
    }
  };

  // Group messages into day-buckets so we can drop a centered date divider
  // between days. Within each day, consecutive same-sender messages are
  // visually compacted (hide the avatar on repeats) to look more like a
  // proper chat app.
  const dayGroups = useMemo(() => {
    const groups: Array<{ day: string; date: Date; messages: any[] }> = [];
    for (const m of messages) {
      const d = new Date(m.createdAt);
      const key = d.toDateString();
      let g = groups[groups.length - 1];
      if (!g || g.day !== key) {
        g = { day: key, date: d, messages: [] };
        groups.push(g);
      }
      g.messages.push(m);
    }
    return groups;
  }, [messages]);

  const orderRef = order?.id ? String(order.id).slice(-6).toUpperCase() : (orderId ? String(orderId).slice(-6).toUpperCase() : '');
  const DeliveryIcon = order?.deliveryMethod === 'pickup' ? Store : Truck;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col shadow-sm">
      {showHeader && (
        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-black text-slate-900">Order #{orderRef}</span>
                {order?.status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${STATUS_TINT[order.status] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                )}
                {order?.deliveryMethod && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 px-2 py-0.5 rounded-full bg-white border border-slate-200">
                    <DeliveryIcon className="w-3 h-3" />
                    {order.deliveryMethod === 'pickup' ? 'Pickup' : 'Delivery'}
                  </span>
                )}
              </div>
              {order && (
                <p className="text-xs text-slate-600 mt-1.5">
                  <span className="font-bold text-slate-800">{order.customerName || order.customer?.name || 'Customer'}</span>
                  <span className="text-slate-400"> · </span>
                  {order.totalQty || 0} item{(order.totalQty || 0) === 1 ? '' : 's'}
                  <span className="text-slate-400"> · </span>
                  <span className="font-bold text-blue-700">{formatPeso(order.totalPrice || 0)}</span>
                </p>
              )}
            </div>
            {!hideViewOrderLink && order?.id && (
              <Link
                to={myRole === 'admin' ? `/admin/orders/${order.id}` : `/order-tracking/${order.id}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                title="Open the full order page"
              >
                View order <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          {Array.isArray(order?.items) && order.items.length > 0 && (
            <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-0.5">
              {order.items.slice(0, 4).map((it: any, i: number) => {
                const preview = it?.customization?.previewImage;
                return (
                  <div key={i} className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg bg-white border border-slate-200 shadow-sm">
                    <div className="w-7 h-7 rounded-md bg-slate-100 overflow-hidden flex items-center justify-center ring-1 ring-slate-200">
                      {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <Package className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate max-w-[140px]">{it.name}</p>
                      <p className="text-[11px] text-slate-500">×{it.quantity}{it.customization?.size ? ` · ${it.customization.size}` : ''}</p>
                    </div>
                    {it.customization?.isCustomized && (
                      <span className="inline-flex w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 items-center justify-center">
                        <Sparkles className="w-2.5 h-2.5 text-white" />
                      </span>
                    )}
                  </div>
                );
              })}
              {order.items.length > 4 && (
                <span className="text-xs text-slate-600 font-bold shrink-0 px-2 py-1 rounded-lg bg-white border border-slate-200">+{order.items.length - 4} more</span>
              )}
            </div>
          )}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={onScroll}
        className={`${heightClass} overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-slate-50/80 to-white`}
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-10">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7 text-blue-500" />
            </div>
            <p className="text-sm font-bold text-slate-700">Start the conversation</p>
            <p className="text-xs text-slate-500 mt-1 max-w-[260px]">
              {myRole === 'customer'
                ? 'Have a question about your order? Send a message and the store will reply.'
                : 'Reach out to the customer about their order — they\'ll see your reply instantly.'}
            </p>
          </div>
        ) : (
          dayGroups.map((g, gi) => (
            <div key={gi} className="space-y-2">
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[11px] font-bold text-slate-500 px-2 py-0.5 rounded-full bg-white border border-slate-200">
                  {formatDayLabel(g.date)}
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              {g.messages.map((m, i) => {
                const prev = g.messages[i - 1];
                const consecutive = prev && prev.fromRole === m.fromRole && (new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000);

                if (m.kind === 'system') {
                  // ── Quotation card — itemized with Accept / Decline ──
                  if (m?.meta?.type === 'quotation' && m?.meta?.quotation) {
                    const q = m.meta.quotation;
                    const acceptedAlready = q.acceptedAt;
                    const declinedAlready = q.declinedAt;
                    return (
                      <div key={m._id} className="flex justify-center my-3">
                        <div className="w-full max-w-md rounded-2xl bg-white border-2 border-blue-200 shadow-md overflow-hidden">
                          <div className="px-4 py-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            <p className="text-sm font-black tracking-tight">QUOTATION</p>
                            <span className="ml-auto text-[10px] opacity-80">{formatTime(new Date(m.createdAt))}</span>
                          </div>
                          <div className="p-4 space-y-1.5 text-sm">
                            {(q.lineItems || []).map((li: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-slate-700">
                                <span className="truncate pr-2">{li.label}</span>
                                <span className="font-semibold text-slate-900 flex-shrink-0">₱{Number(li.amount).toLocaleString()}</span>
                              </div>
                            ))}
                            <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between items-baseline">
                              <span className="font-bold text-slate-900">Total</span>
                              <span className="text-2xl font-black text-blue-700">₱{Number(q.total).toLocaleString()}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
                              <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
                                <p className="text-amber-700 font-bold uppercase tracking-wider text-[9px]">Downpayment</p>
                                <p className="font-black text-amber-900 text-base mt-0.5">₱{Number(q.downpaymentAmount).toLocaleString()}</p>
                                <p className="text-[10px] text-amber-700">Pay to start</p>
                              </div>
                              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-2">
                                <p className="text-emerald-700 font-bold uppercase tracking-wider text-[9px]">Balance</p>
                                <p className="font-black text-emerald-900 text-base mt-0.5">₱{Number(q.balanceAmount).toLocaleString()}</p>
                                <p className="text-[10px] text-emerald-700">Pay on release</p>
                              </div>
                            </div>
                          </div>
                          {myRole === 'customer' && !acceptedAlready && !declinedAlready && order?.status === 'quoted' && (
                            <div className="px-4 pb-4 flex gap-2">
                              <button
                                onClick={async () => {
                                  try { await acceptQuotation(orderId); window.location.reload(); } catch (e: any) { alert(e?.message || 'Failed'); }
                                }}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold text-sm shadow-md hover:shadow-lg"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Accept quote
                              </button>
                              <button
                                onClick={async () => {
                                  const r = prompt('Tell the store why (price, design, timing, etc.):');
                                  if (!r) return;
                                  try { await declineQuotation(orderId, r); window.location.reload(); } catch (e: any) { alert(e?.message || 'Failed'); }
                                }}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white text-rose-700 border-2 border-rose-200 hover:bg-rose-50 font-bold text-sm"
                              >
                                Discuss
                              </button>
                            </div>
                          )}
                          {acceptedAlready && (
                            <div className="px-4 pb-3 pt-1 text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" /> Accepted on {new Date(acceptedAlready).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // ── Payment-proof card — admin sees Verify / Reject ──
                  if (m?.meta?.type === 'payment_proof') {
                    const stage = m.meta.stage as 'downpayment' | 'balance';
                    const proofUrls: string[] = m.meta.proofUrls || [];
                    const amount = m.meta.amount;
                    return (
                      <div key={m._id} className="flex justify-center my-3">
                        <div className="w-full max-w-md rounded-2xl bg-white border-2 border-amber-200 shadow-md overflow-hidden">
                          <div className="px-4 py-2.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" />
                            <p className="text-sm font-black tracking-tight uppercase">{stage} payment proof</p>
                            <span className="ml-auto text-[10px] opacity-80">{formatTime(new Date(m.createdAt))}</span>
                          </div>
                          <div className="p-4 space-y-2">
                            <p className="text-xs text-slate-600">
                              <span className="font-bold text-slate-900">₱{Number(amount).toLocaleString()}</span>
                              {' via '}<span className="font-semibold capitalize">{m.meta.method}</span>
                              {m.meta.reference && <> · Ref: <code className="font-mono text-xs bg-slate-100 px-1 rounded">{m.meta.reference}</code></>}
                            </p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {proofUrls.map((u, i) => (
                                <a key={i} href={u} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 bg-slate-50">
                                  <img src={u} alt={`Proof ${i + 1}`} className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                            {myRole === 'admin' && (
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Verify the ${stage} payment of ₱${Number(amount).toLocaleString()}?`)) return;
                                    try { await verifyPayment(orderId, stage); window.location.reload(); } catch (e: any) { alert(e?.message || 'Failed'); }
                                  }}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-sm hover:shadow-md"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                                </button>
                                <button
                                  onClick={async () => {
                                    const r = prompt('Reason for rejection (shown to customer):');
                                    if (!r) return;
                                    try { await rejectPayment(orderId, stage, r); window.location.reload(); } catch (e: any) { alert(e?.message || 'Failed'); }
                                  }}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 font-bold text-xs"
                                >
                                  <XCircle className="w-3.5 h-3.5" /> Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Default system message — plain pill.
                  return (
                    <div key={m._id} className="flex justify-center my-2">
                      <div className="max-w-[85%] px-3.5 py-2 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2 shadow-sm">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 mt-0.5">
                          <Info className="w-3 h-3 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold leading-snug whitespace-pre-line">{m.body}</p>
                          <p className="text-[10px] opacity-70 mt-0.5">{timeAgo(new Date(m.createdAt))}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                const isMine = m.fromRole === myRole;
                const align = isMine ? 'justify-end' : 'justify-start';
                const bubble = isMine
                  ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-200'
                  : m.fromRole === 'admin'
                  ? 'bg-white border border-emerald-200 text-emerald-900 shadow-sm'
                  : m.fromRole === 'staff'
                  ? 'bg-white border border-violet-200 text-violet-900 shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-800 shadow-sm';
                const sender = m.fromName || (m.fromRole === 'customer' ? 'Customer' : m.fromRole === 'admin' ? 'Store team' : 'Production team');
                const showAvatar = !consecutive && !isMine;

                return (
                  <div key={m._id} className={`flex ${align} gap-2 ${consecutive ? 'mt-0.5' : 'mt-2'}`}>
                    {!isMine && (
                      <div className="w-8 shrink-0">
                        {showAvatar ? (
                          <div className={`w-8 h-8 rounded-full ${AVATAR_TINT[m.fromRole] || 'bg-slate-300'} text-white text-xs font-black flex items-center justify-center shadow-sm`}>
                            {initialsOf(m.fromName, m.fromRole)}
                          </div>
                        ) : (
                          <div className="w-8 h-8" />
                        )}
                      </div>
                    )}
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${bubble}`}>
                      {!consecutive && !isMine && (
                        <p className="text-[11px] font-black opacity-90 mb-0.5">{sender}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                      <p className={`text-[10px] mt-0.5 ${isMine ? 'text-white/70' : 'text-slate-400'}`}>{formatTime(new Date(m.createdAt))}</p>
                    </div>
                    {isMine && (
                      <div className="w-8 shrink-0">
                        {showAvatar || !consecutive ? (
                          <div className={`w-8 h-8 rounded-full ${AVATAR_TINT[m.fromRole] || 'bg-slate-300'} text-white text-xs font-black flex items-center justify-center shadow-sm`}>
                            {initialsOf(m.fromName, m.fromRole)}
                          </div>
                        ) : (
                          <div className="w-8 h-8" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-slate-100 p-3 bg-white">
        {/* Quick-reply chips — courier coordination shortcuts. The store
            uses Lalamove / LBC / Grab / J&T as 3rd-party delivery, so
            most chat exchanges involve "which courier do you prefer"
            and "here's your tracking number". One tap drops a pre-
            written line into the composer instead of retyping. */}
        {orderId && deliveryQuickReplies(myRole, order).length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {deliveryQuickReplies(myRole, order).map((qr) => (
              <button
                key={qr.label}
                type="button"
                onClick={() => setBody((prev) => (prev ? `${prev} ${qr.text}` : qr.text))}
                className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-800 transition-colors"
                title="Click to drop this into the message — edit before sending"
              >
                {qr.label}
              </button>
            ))}
          </div>
        )}

        {/* Payment CTAs — two clear options side-by-side. Pay Online is
            the one-click path (PayMongo Link → GCash/Maya/card in a new
            tab; webhook auto-verifies). Upload Proof is the fallback for
            customers who prefer manual transfer. */}
        {myRole === 'customer' && order?.status === 'accepted' && !order?.payments?.downpayment?.verifiedAt && (
          <div className="mb-2.5 grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                try {
                  const r = await createQuotationPaymentLink(orderId, 'downpayment');
                  if (r?.checkoutUrl) window.open(r.checkoutUrl, '_blank', 'noopener');
                } catch (e: any) { alert(e?.message || 'Failed to start payment'); }
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-bold text-sm shadow-md hover:shadow-lg"
            >
              💳 Pay ₱{Number(order?.payments?.downpayment?.amount || 0).toLocaleString()} online →
            </button>
            <button
              onClick={() => { setProofStage('downpayment'); setProofOpen(true); }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white text-amber-700 border-2 border-amber-300 hover:bg-amber-50 font-bold text-xs"
            >
              <Upload className="w-3.5 h-3.5" /> Upload proof manually
            </button>
          </div>
        )}
        {myRole === 'customer' && order?.status === 'ready' && order?.workflowVersion === 'quotation' && !order?.payments?.balance?.verifiedAt && (
          <div className="mb-2.5 grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                try {
                  const r = await createQuotationPaymentLink(orderId, 'balance');
                  if (r?.checkoutUrl) window.open(r.checkoutUrl, '_blank', 'noopener');
                } catch (e: any) { alert(e?.message || 'Failed to start payment'); }
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white font-bold text-sm shadow-md hover:shadow-lg"
            >
              💳 Pay ₱{Number(order?.payments?.balance?.amount || 0).toLocaleString()} balance online →
            </button>
            <button
              onClick={() => { setProofStage('balance'); setProofOpen(true); }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white text-emerald-700 border-2 border-emerald-300 hover:bg-emerald-50 font-bold text-xs"
            >
              <Upload className="w-3.5 h-3.5" /> Upload proof manually
            </button>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder={myRole === 'customer' ? 'Message the store…' : 'Reply to the customer…'}
              maxLength={2000}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all text-sm placeholder:text-slate-400"
            />
          </div>
          <button
            onClick={onSend}
            disabled={busy || !body.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-blue-200 transition-all text-sm shrink-0"
          >
            <Send className="w-4 h-4" /> Send
          </button>
        </div>
        {err && <p className="text-xs text-rose-700 font-semibold mt-2">{err}</p>}
        <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1.5">
          <Info className="w-3 h-3" />
          Messages are tied to this order. Status updates appear here automatically.
        </p>
      </div>

      {/* Payment Proof Upload Modal — customer-side. Lets the customer
          attach payment method, ref number, and screenshots. On submit
          everything goes into payments[stage] and an admin-visible
          "Payment Proof" card appears in this chat. */}
      {proofOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setProofOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className={`px-5 py-4 text-white ${proofStage === 'downpayment' ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}>
              <h3 className="text-lg font-black tracking-tight capitalize">{proofStage} payment</h3>
              <p className="text-sm opacity-90 mt-0.5">
                Amount due: ₱{Number(order?.payments?.[proofStage]?.amount || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Payment method</label>
                <select value={proofMethod} onChange={(e) => setProofMethod(e.target.value as any)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="gcash">GCash</option>
                  <option value="paymaya">Maya / PayMaya</option>
                  <option value="bank">Bank transfer</option>
                  <option value="cash">Cash (in store)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Reference number (optional)</label>
                <input value={proofReference} onChange={(e) => setProofReference(e.target.value)} placeholder="GCash ref #, bank txn ID…" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Screenshot of payment ({proofImages.length}/5)</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []).slice(0, 5 - proofImages.length);
                    Promise.all(files.map((f) => new Promise<string>((resolve) => {
                      const r = new FileReader();
                      r.onload = () => resolve(String(r.result));
                      r.readAsDataURL(f);
                    }))).then((urls) => setProofImages((p) => [...p, ...urls].slice(0, 5)));
                  }}
                  className="text-xs w-full"
                />
                {proofImages.length > 0 && (
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    {proofImages.map((u, i) => (
                      <div key={i} className="aspect-square rounded-lg overflow-hidden border border-slate-200 relative group">
                        <img src={u} className="w-full h-full object-cover" alt={`Proof ${i + 1}`} />
                        <button onClick={() => setProofImages((p) => p.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-rose-600 text-white text-xs opacity-0 group-hover:opacity-100">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {proofErr && <p className="text-xs text-rose-700 font-semibold">{proofErr}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setProofOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">Cancel</button>
                <button
                  onClick={async () => {
                    if (proofImages.length === 0) { setProofErr('Please attach at least one screenshot.'); return; }
                    setProofBusy(true); setProofErr('');
                    try {
                      await uploadPaymentProof(orderId, proofStage, { method: proofMethod, reference: proofReference, proofUrls: proofImages });
                      setProofOpen(false);
                      setProofImages([]); setProofReference('');
                      window.location.reload();
                    } catch (e: any) {
                      setProofErr(e?.message || 'Upload failed');
                    } finally {
                      setProofBusy(false);
                    }
                  }}
                  disabled={proofBusy || proofImages.length === 0}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-white font-bold text-sm shadow-md disabled:opacity-50 ${proofStage === 'downpayment' ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-emerald-500 to-teal-600'}`}
                >
                  {proofBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {proofBusy ? 'Sending…' : 'Send proof'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderChatPanel;
