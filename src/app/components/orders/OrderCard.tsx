import React from 'react';
import { Link } from 'react-router-dom';
import {
  Package, Truck, Store, Sparkles, Star, RotateCcw, AlertTriangle,
  CheckCircle2, Clock, Factory, ShieldCheck, XCircle, ArrowRight,
  MessageCircle,
} from 'lucide-react';
import { formatPeso } from '../../utils/format';

interface Props {
  order: any;
  onReorder?: (orderId: string) => void;
  onCancel?: (orderId: string) => void;
  onFileReturn?: (orderId: string) => void;
  onRate?: (orderId: string) => void;
  /** Unread chat messages on this order — drives the badge on the Message button. */
  unreadCount?: number;
}

const STATUS_META: Record<string, { label: string; tint: string; Icon: any; gradient: string }> = {
  pending:          { label: 'Pending',          tint: 'bg-amber-100 text-amber-700 border-amber-200',     Icon: Clock,        gradient: 'from-amber-500 to-orange-500' },
  approved:         { label: 'Approved',         tint: 'bg-blue-100 text-blue-700 border-blue-200',        Icon: CheckCircle2, gradient: 'from-blue-500 to-indigo-500' },
  in_production:    { label: 'In Production',    tint: 'bg-violet-100 text-violet-700 border-violet-200',  Icon: Factory,      gradient: 'from-violet-500 to-fuchsia-500' },
  ready:            { label: 'Ready',            tint: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: ShieldCheck,gradient: 'from-emerald-500 to-teal-500' },
  out_for_delivery: { label: 'Out for delivery', tint: 'bg-sky-100 text-sky-700 border-sky-200',           Icon: Truck,        gradient: 'from-sky-500 to-blue-600' },
  for_pickup:       { label: 'Ready for pickup', tint: 'bg-sky-100 text-sky-700 border-sky-200',           Icon: Store,        gradient: 'from-sky-500 to-blue-600' },
  completed:        { label: 'Completed',        tint: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: Star,       gradient: 'from-emerald-500 to-teal-500' },
  shipped:          { label: 'Shipped',          tint: 'bg-cyan-100 text-cyan-700 border-cyan-200',         Icon: Truck,       gradient: 'from-cyan-500 to-blue-500' },
  delivered:        { label: 'Delivered',        tint: 'bg-green-100 text-green-700 border-green-200',      Icon: CheckCircle2,gradient: 'from-green-500 to-emerald-500' },
  cancelled:        { label: 'Cancelled',        tint: 'bg-slate-100 text-slate-700 border-slate-200',     Icon: XCircle,      gradient: 'from-slate-500 to-slate-700' },
  rejected:         { label: 'Rejected',         tint: 'bg-rose-100 text-rose-700 border-rose-200',        Icon: XCircle,      gradient: 'from-rose-500 to-red-600' },
  refunded:         { label: 'Refunded',         tint: 'bg-rose-100 text-rose-700 border-rose-200',        Icon: RotateCcw,    gradient: 'from-rose-500 to-red-600' },
};

const CANCEL_LOCKED = new Set(['in_production', 'ready', 'out_for_delivery', 'for_pickup', 'completed', 'shipped', 'delivered', 'cancelled', 'rejected', 'refunded']);

export function OrderCard({ order, onReorder, onCancel, onFileReturn, onRate, unreadCount = 0 }: Props) {
  const items = Array.isArray(order.items) ? order.items : [];
  const status = STATUS_META[order.status] || STATUS_META.pending;
  const StatusIcon = status.Icon;
  const orderRef = String(order.id || order._id || '').slice(-6).toUpperCase();
  const created = order.createdAt ? new Date(order.createdAt) : null;
  const visibleItems = items.slice(0, 3);
  const overflow = Math.max(0, items.length - 3);
  const totalQty = order.totalQty ?? items.reduce((s: number, it: any) => s + (it.quantity || 0), 0);
  const deliveryIcon = order.deliveryMethod === 'pickup' ? Store : Truck;
  const DeliveryIcon = deliveryIcon;

  const canCancel = !CANCEL_LOCKED.has(order.status) && order.paymentStatus !== 'paid';
  const canReview = ['completed', 'delivered', 'shipped'].includes(order.status);
  const canReturn = ['completed', 'delivered', 'shipped'].includes(order.status);
  const isRush = ['rush', 'priority'].includes(order.urgencyTier);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Card header — shop name, order ref + status pill */}
      <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
            CM
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">Bryle Closet</p>
            <p className="text-[11px] text-slate-500">#{orderRef} · {created ? created.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isRush && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm">
              ⚡ Rush
            </span>
          )}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${status.tint}`}>
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </span>
        </div>
      </div>

      {/* Items list — Shopee-style stacked thumbnails with details */}
      <div className="divide-y divide-slate-100">
        {visibleItems.map((it: any, idx: number) => {
          const preview = it?.customization?.previewImage;
          const isCustom = !!it?.customization?.isCustomized;
          return (
            <div key={idx} className="flex items-start gap-3 p-3">
              <Link to={`/order-tracking/${order.id || order._id}`} className="shrink-0">
                <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden ring-1 ring-slate-200 relative">
                  {preview ? (
                    <img src={preview} alt={it.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-7 h-7 text-slate-400" />
                    </div>
                  )}
                  {isCustom && (
                    <span className="absolute -top-1 -right-1 inline-flex w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 ring-2 ring-white items-center justify-center">
                      <Sparkles className="w-3 h-3 text-white" />
                    </span>
                  )}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 line-clamp-1">{it.name}</p>
                {it.customization && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                    {[it.customization.shirtType, it.customization.size && `Size: ${it.customization.size}`, it.customization.color && `Color: ${it.customization.color}`].filter(Boolean).join(' · ')}
                  </p>
                )}
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500">x{it.quantity}</p>
                  <p className="text-sm font-bold text-slate-900">{formatPeso(it.quantity * it.unitPrice)}</p>
                </div>
              </div>
            </div>
          );
        })}
        {overflow > 0 && (
          <Link
            to={`/order-tracking/${order.id || order._id}`}
            className="block px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 text-center"
          >
            +{overflow} more item{overflow === 1 ? '' : 's'} →
          </Link>
        )}
      </div>

      {/* Subtotal + delivery */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-slate-600 inline-flex items-center gap-1.5">
          <DeliveryIcon className="w-3.5 h-3.5 text-slate-500" />
          {order.deliveryMethod === 'pickup' ? 'In-store pickup' : 'Delivery'}
          <span className="text-slate-300">·</span>
          {totalQty} item{totalQty === 1 ? '' : 's'}
        </span>
        <div className="text-right">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Order Total</p>
          <p className="text-lg font-black text-slate-900">{formatPeso(order.totalPrice || 0)}</p>
        </div>
      </div>

      {/* Status reason banner */}
      {(order.status === 'cancelled' || order.status === 'rejected') && (order.cancellationReason || order.rejectionReason) && (
        <div className="px-4 py-2.5 border-t border-rose-100 bg-rose-50 text-rose-900 text-xs flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
          <p><span className="font-bold">Reason:</span> {order.rejectionReason || order.cancellationReason}</p>
        </div>
      )}

      {/* Action bar — varies by status, like Shopee/Lazada */}
      <div className="px-4 py-3 border-t border-slate-100 bg-white flex items-center justify-end gap-2 flex-wrap">
        {/* TikTok-style Message button — always visible, badge on unread.
            Deep-links straight into the Messages tab on the order page. */}
        <Link
          to={`/order-tracking/${order.id || order._id}?tab=messages`}
          className="relative inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 font-bold text-xs"
        >
          <MessageCircle className="w-3.5 h-3.5" /> Message
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black ring-2 ring-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
        {canReview && onRate && (
          <button
            onClick={() => onRate(order.id || order._id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 font-bold text-xs"
          >
            <Star className="w-3.5 h-3.5" /> Rate items
          </button>
        )}
        {canReturn && onFileReturn && (
          <button
            onClick={() => onFileReturn(order.id || order._id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 font-bold text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Return
          </button>
        )}
        {canCancel && onCancel && (
          <button
            onClick={() => onCancel(order.id || order._id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 font-bold text-xs"
          >
            <XCircle className="w-3.5 h-3.5" /> Cancel
          </button>
        )}
        {(order.status === 'cancelled' || order.status === 'completed' || order.status === 'rejected') && onReorder && (
          <button
            onClick={() => onReorder(order.id || order._id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold text-xs"
          >
            Buy again
          </button>
        )}
        <Link
          to={`/order-tracking/${order.id || order._id}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-xs shadow-md shadow-blue-200 hover:shadow-lg transition-all"
        >
          {order.status === 'pending' || order.status === 'approved' || order.status === 'in_production' || order.status === 'ready' || order.status === 'out_for_delivery' || order.status === 'for_pickup'
            ? 'Track order'
            : 'View order'}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

export default OrderCard;
