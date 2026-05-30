import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Package, Truck, Store, Info, Sparkles, ExternalLink } from 'lucide-react';
import { getOrderChat, sendOrderChatMessage, apiRequest } from '../../api';
import { formatPeso } from '../../utils/format';
import { useAuth } from '../../hooks/useAuth';

interface OrderChatPanelProps {
  orderId: string;
  /** Optional already-loaded order so the header skips a network call. */
  initialOrder?: any;
  /** When false the order-context header is hidden (e.g., already in drawer). */
  showHeader?: boolean;
  /** Max chat-list height. Defaults to 24rem (h-96). */
  heightClass?: string;
  /** Hide the "View order" link if the chat is already on the order page. */
  hideViewOrderLink?: boolean;
}

const STATUS_TINT: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  in_production: 'bg-purple-100 text-purple-700',
  ready: 'bg-emerald-100 text-emerald-700',
  out_for_delivery: 'bg-sky-100 text-sky-700',
  for_pickup: 'bg-sky-100 text-sky-700',
  completed: 'bg-emerald-100 text-emerald-700',
  shipped: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-700',
  rejected: 'bg-rose-100 text-rose-700',
  refunded: 'bg-rose-100 text-rose-700',
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

/**
 * Reusable chat panel that lives on top of `/api/chat/:orderId`.
 *
 * Shows ORDER CONTEXT in the header (id, status, items, total) so admin/staff
 * can answer without bouncing to the order page; system messages are styled
 * differently from user messages so the journey shows up inline.
 *
 * Used by: OrderTracking (customer), OrderDetailDrawer (admin), AdminMessages
 * page (admin inbox), StaffTaskBoard task detail (staff).
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
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollPinned = useRef(true);

  // Fetch order header if not pre-supplied.
  useEffect(() => {
    if (initialOrder || !orderId) return;
    let cancelled = false;
    apiRequest(`/orders/${orderId}`)
      .then((data) => { if (!cancelled) setOrder(data); })
      .catch(() => { /* the chat still works without it */ });
    return () => { cancelled = true; };
  }, [orderId, initialOrder]);

  // Poll messages every 4s; refresh immediately on send.
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

  // Auto-scroll to the bottom when new messages come in, but only if the
  // user hasn't scrolled up to read history.
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

  const orderRef = order?.id ? String(order.id).slice(-6) : (orderId ? String(orderId).slice(-6) : '');
  const deliveryIcon = order?.deliveryMethod === 'pickup' ? Store : Truck;
  const DeliveryIcon = deliveryIcon;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
      {showHeader && (
        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base font-black text-slate-900">Order #{orderRef}</span>
                {order?.status && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_TINT[order.status] || 'bg-slate-100 text-slate-700'}`}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                )}
                {order?.deliveryMethod && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                    <DeliveryIcon className="w-3 h-3" />
                    {order.deliveryMethod === 'pickup' ? 'In-store pickup' : 'Delivery'}
                  </span>
                )}
              </div>
              {order && (
                <p className="text-xs text-slate-500 mt-1">
                  {order.customerName || order.customer?.name || 'Customer'} · {order.totalQty || 0} item{(order.totalQty || 0) === 1 ? '' : 's'} · {formatPeso(order.totalPrice || 0)}
                </p>
              )}
            </div>
            {!hideViewOrderLink && order?.id && (
              <Link
                to={myRole === 'admin' ? `/admin/orders/${order.id}` : `/order-tracking/${order.id}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100"
                title="Open the full order page"
              >
                View order <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          {/* Items strip — first 3 items shown so admin/staff sees what the
              chat is about at a glance without opening anything else. */}
          {Array.isArray(order?.items) && order.items.length > 0 && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1">
              {order.items.slice(0, 4).map((it: any, i: number) => {
                const preview = it?.customization?.previewImage;
                return (
                  <div key={i} className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg bg-white border border-slate-200">
                    <div className="w-7 h-7 rounded bg-slate-100 overflow-hidden flex items-center justify-center">
                      {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <Package className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate max-w-[140px]">{it.name}</p>
                      <p className="text-[11px] text-slate-500">×{it.quantity}{it.customization?.size ? ` · ${it.customization.size}` : ''}</p>
                    </div>
                    {it.customization?.isCustomized && <Sparkles className="w-3 h-3 text-blue-500" />}
                  </div>
                );
              })}
              {order.items.length > 4 && (
                <span className="text-xs text-slate-500 font-bold shrink-0">+{order.items.length - 4} more</span>
              )}
            </div>
          )}
        </div>
      )}

      <div
        ref={listRef}
        onScroll={onScroll}
        className={`${heightClass} overflow-y-auto p-3 space-y-2 bg-slate-50/60`}
      >
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No messages yet. Say hi 👋</p>
        ) : (
          messages.map((m) => {
            if (m.kind === 'system') {
              // Centered system pill so it reads like a journey event.
              return (
                <div key={m._id} className="flex justify-center">
                  <div className="max-w-[85%] px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-bold">{m.body}</p>
                      <p className="text-[11px] opacity-70 mt-0.5">{new Date(m.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            }
            const isMine = m.fromRole === myRole;
            const align = isMine ? 'justify-end' : 'justify-start';
            const bubble = isMine
              ? 'bg-blue-600 text-white'
              : m.fromRole === 'admin'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : m.fromRole === 'staff'
              ? 'bg-purple-50 border border-purple-200 text-purple-900'
              : 'bg-white border border-slate-200 text-slate-800';
            const sender = m.fromName || (m.fromRole === 'customer' ? 'Customer' : m.fromRole === 'admin' ? 'Store team' : 'Production team');
            return (
              <div key={m._id} className={`flex ${align}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${bubble}`}>
                  <div className={`text-xs opacity-80 mb-0.5 ${isMine ? '' : 'font-bold'}`}>{sender}</div>
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="text-[11px] opacity-60 mt-0.5">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-100 p-3 bg-white">
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder={myRole === 'customer' ? 'Message the store…' : 'Reply to the customer…'}
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onSend}
            disabled={busy || !body.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> Send
          </button>
        </div>
        {err && <p className="text-xs text-rose-700 font-semibold mt-2">{err}</p>}
        <p className="text-xs text-slate-400 mt-1.5">Messages are tied to this order. Automatic status updates also appear here.</p>
      </div>
    </div>
  );
}

export default OrderChatPanel;
