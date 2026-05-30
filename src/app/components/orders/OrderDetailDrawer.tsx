import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Textarea } from '../Textarea';
import {
  Truck,
  User as UserIcon,
  Mail,
  Phone,
  Package,
  Clock,
  MessageCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  CreditCard,
  ChevronRight,
  Plus,
  Send,
  Receipt,
  Download,
} from 'lucide-react';
import {
  updateOrderStatus,
  addOrderNote,
  getOrderHistory,
} from '../../api';
import { formatPeso } from '../../utils/format';
import { RefundModal } from './RefundModal';
import { useAuth } from '../../hooks/useAuth';
import { AIOrderSummaryPanel } from './AIOrderSummaryPanel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onChanged: () => void;
}

// Workflow pipeline — the canonical order. `cancelled`/`rejected`/`refunded`
// are terminal off-shoots and not part of this strip.
const PIPELINE = [
  { id: 'pending', label: 'Pending', tint: 'from-slate-500 to-slate-700' },
  { id: 'approved', label: 'Approved', tint: 'from-blue-500 to-indigo-500' },
  { id: 'in_production', label: 'Production', tint: 'from-purple-500 to-fuchsia-500' },
  { id: 'ready', label: 'Ready', tint: 'from-emerald-500 to-teal-500' },
  { id: 'shipped', label: 'Shipped', tint: 'from-cyan-500 to-blue-500' },
  { id: 'delivered', label: 'Delivered', tint: 'from-green-500 to-emerald-500' },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  in_production: 'bg-purple-100 text-purple-700 border-purple-200',
  ready: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  shipped: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  refunded: 'bg-rose-100 text-rose-700 border-rose-200',
};

const PAYMENT_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  awaiting_payment: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
};

const LOG_TYPE_META: Record<string, { icon: any; tint: string; label: string }> = {
  created: { icon: Sparkles, tint: 'text-blue-700', label: 'Order placed' },
  status_changed: { icon: ChevronRight, tint: 'text-indigo-700', label: 'Status change' },
  payment_confirmed: { icon: CreditCard, tint: 'text-emerald-700', label: 'Payment confirmed' },
  payment_failed: { icon: XCircle, tint: 'text-rose-700', label: 'Payment failed' },
  note: { icon: MessageCircle, tint: 'text-slate-700', label: 'Note' },
  cancelled: { icon: XCircle, tint: 'text-rose-700', label: 'Cancelled' },
  refunded: { icon: RotateCcw, tint: 'text-rose-700', label: 'Refunded' },
  bulk_action: { icon: ChevronRight, tint: 'text-purple-700', label: 'Bulk action' },
  shipped: { icon: Truck, tint: 'text-cyan-700', label: 'Shipped' },
  delivered: { icon: CheckCircle2, tint: 'text-emerald-700', label: 'Delivered' },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function describeLog(log: any) {
  if (log.type === 'note') return log.note;
  if (log.type === 'refunded') {
    return `${formatPeso(log.amount || 0)} — ${log.reason || ''}`;
  }
  if (log.type === 'status_changed' || log.type === 'bulk_action' || log.type === 'cancelled') {
    return [`${log.from || '—'} → ${log.to || '—'}`, log.reason && `(${log.reason})`].filter(Boolean).join(' ');
  }
  if (log.type === 'payment_confirmed') return `${formatPeso(log.amount || 0)}`;
  return log.note || '';
}

export function OrderDetailDrawer({ isOpen, onClose, order, onChanged }: Props) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  // Refund is admin-only on the backend; hide the UI button for managers
  // and staff to match the policy and avoid 403 dead-ends in the UI.
  const { user: currentUser } = useAuth();
  const canRefund = currentUser?.role === 'admin';
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  const orderId = order?._id || order?.id;

  useEffect(() => {
    if (!isOpen || !orderId) return;
    setFeedback(null);
    setNote('');
    (async () => {
      setLoadingLogs(true);
      try {
        const list = await getOrderHistory(orderId);
        setLogs(Array.isArray(list) ? list : []);
      } catch {
        setLogs([]);
      } finally {
        setLoadingLogs(false);
      }
    })();
  }, [isOpen, orderId]);

  const refresh = async () => {
    onChanged();
    if (!orderId) return;
    try {
      const list = await getOrderHistory(orderId);
      setLogs(Array.isArray(list) ? list : []);
    } catch {
      /* non-fatal */
    }
  };

  const handleStatusChange = async (to: string) => {
    if (!orderId || updatingStatus) return;
    setFeedback(null);
    // Panel revision #12 — require a reason when rejecting/cancelling.
    let reason: string | undefined;
    if (to === 'rejected' || to === 'cancelled') {
      const r = window.prompt(
        `Why are you ${to === 'rejected' ? 'rejecting' : 'cancelling'} this order? The customer will see this reason.`,
        '',
      );
      if (!r || !r.trim()) {
        setFeedback({ kind: 'error', msg: 'A reason is required to ' + (to === 'rejected' ? 'reject' : 'cancel') + '.' });
        return;
      }
      reason = r.trim();
    }
    setUpdatingStatus(true);
    try {
      await updateOrderStatus(orderId, to, reason ? { reason } : undefined);
      setFeedback({ kind: 'success', msg: `Status updated to ${to.replace('_', ' ')}` });
      await refresh();
    } catch (err: any) {
      setFeedback({ kind: 'error', msg: err.message || 'Failed to update status' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAddNote = async () => {
    if (!orderId || !note.trim() || savingNote) return;
    setSavingNote(true);
    try {
      await addOrderNote(orderId, note.trim());
      setNote('');
      await refresh();
    } catch (err: any) {
      setFeedback({ kind: 'error', msg: err.message || 'Failed to add note' });
    } finally {
      setSavingNote(false);
    }
  };

  if (!order) return null;

  const currentStageIdx = PIPELINE.findIndex((s) => s.id === order.status);
  const isTerminal = ['cancelled', 'rejected', 'refunded'].includes(order.status);
  const refunded = Number(order.refundedAmount) || 0;
  const paid = Number(order.paidAmount) || 0;
  const total = Number(order.totalPrice) || 0;
  const refundable = Math.max(0, paid - refunded);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order #${String(orderId).slice(-6)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canRefund && refundable > 0 && !['refunded'].includes(order.status) && (
            <Button variant="danger" onClick={() => setRefundOpen(true)}>
              <RotateCcw className="w-4 h-4 mr-1.5" /> Refund
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5 max-h-[78vh] overflow-y-auto px-1">
        {/* AI briefing — pulled at the top so the admin sees the situation
            in one paragraph before scanning the rest of the order. */}
        <AIOrderSummaryPanel orderId={orderId} refreshKey={logs.length} />

        {/* Customer + totals header */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 text-base truncate">{order.customerName || order.customer?.name || 'Customer'}</p>
              {(order.customerEmail || order.customer?.email) && (
                <p className="text-xs text-slate-600 flex items-center gap-1 truncate">
                  <Mail className="w-3 h-3" /> {order.customerEmail || order.customer?.email}
                </p>
              )}
              {order.contactPhone && (
                <p className="text-xs text-slate-600 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {order.contactPhone}
                </p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total</p>
              <p className="text-2xl font-black text-slate-900">{formatPeso(total)}</p>
              <p className="text-xs text-slate-500">{order.totalQty} units</p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_BADGE[order.status] || STATUS_BADGE.pending}`}>
              {order.status.replace('_', ' ')}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${PAYMENT_BADGE[order.paymentStatus] || PAYMENT_BADGE.pending}`}>
              <CreditCard className="w-2.5 h-2.5" />
              {order.paymentStatus?.replace('_', ' ') || 'pending'}
            </span>
            {order.isBulk && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700">
                Bulk
              </span>
            )}
            <span className="text-[11px] text-slate-500 ml-auto">
              Placed {timeAgo(order.createdAt)}
            </span>
          </div>
        </div>

        {/* Pipeline progress (hidden for terminal orders) */}
        {!isTerminal && (
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Order pipeline</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {PIPELINE.map((stage, idx) => {
                const done = idx < currentStageIdx;
                const current = idx === currentStageIdx;
                return (
                  <React.Fragment key={stage.id}>
                    <button
                      onClick={() => handleStatusChange(stage.id)}
                      disabled={updatingStatus || current}
                      className={`flex flex-col items-center min-w-[70px] transition disabled:cursor-default ${
                        !current && !updatingStatus ? 'hover:opacity-80' : ''
                      }`}
                      title={`Move to ${stage.label}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold ${
                          current
                            ? `bg-gradient-to-br ${stage.tint} text-white shadow-md ring-4 ring-blue-500/15`
                            : done
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {done ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                      </div>
                      <p className={`text-[9px] font-semibold mt-1 text-center ${
                        current ? 'text-slate-900' : done ? 'text-emerald-700' : 'text-slate-400'
                      }`}>
                        {stage.label}
                      </p>
                    </button>
                    {idx < PIPELINE.length - 1 && (
                      <div className={`flex-1 h-0.5 ${idx < currentStageIdx ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" disabled={updatingStatus} onClick={() => handleStatusChange('cancelled')}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
              {order.status === 'pending' && (
                <Button size="sm" variant="outline" disabled={updatingStatus} onClick={() => handleStatusChange('rejected')}>
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Payment summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Receipt className="w-3.5 h-3.5" /> Payment
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Method</p>
              <p className="font-semibold text-slate-900 capitalize">{order.paymentMethod || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Required</p>
              <p className="font-semibold text-slate-900">{formatPeso(order.requiredPayment || 0)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Paid</p>
              <p className="font-semibold text-emerald-700">{formatPeso(paid)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Refunded</p>
              <p className={`font-semibold ${refunded > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{formatPeso(refunded)}</p>
            </div>
          </div>
        </div>

        {/* Items */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Package className="w-3.5 h-3.5" /> Items ({order.items?.length || 0})
          </p>
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {(order.items || []).map((item: any, idx: number) => {
              const preview = item.customization?.previewImage;
              const customText = item.customization?.text;
              const customImage = item.customization?.image;
              return (
                <div key={idx} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    {/* Design thumbnail — what the customer designed */}
                    {preview ? (
                      <a
                        href={preview}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 hover:border-blue-400 hover:shadow-md transition relative group"
                        title="Open design preview at full size"
                      >
                        <img src={preview} alt="Design preview" className="w-full h-full object-contain" />
                        <span className="absolute bottom-0 left-0 right-0 text-center text-[8px] font-black uppercase tracking-wider py-0.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white opacity-0 group-hover:opacity-100 transition">
                          Open
                        </span>
                      </a>
                    ) : (
                      <div className="shrink-0 w-20 h-20 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                        <Package className="w-7 h-7 text-slate-400" />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-sm truncate">{item.name}</p>
                      <p className="text-[11px] font-mono text-slate-500">{item.sku}</p>
                      {(item.customization?.size || item.customization?.color || item.customization?.placement || customText) && (
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {[
                            item.customization?.size && `Size: ${item.customization.size}`,
                            item.customization?.color && `Color: ${item.customization.color}`,
                            item.customization?.placement && `Placement: ${item.customization.placement}`,
                            customText && `Text: "${customText}"`,
                          ].filter(Boolean).join(' • ')}
                        </p>
                      )}
                      {(preview || customImage) && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {preview && (
                            <a
                              href={preview}
                              download={`order-${String(order._id || '').slice(-6)}-item-${idx + 1}-preview.png`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition"
                            >
                              <Download className="w-3 h-3" />
                              Preview PNG
                            </a>
                          )}
                          {customImage && (
                            <a
                              href={customImage}
                              download={`order-${String(order._id || '').slice(-6)}-item-${idx + 1}-artwork.png`}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition"
                            >
                              <Download className="w-3 h-3" />
                              Artwork PNG
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-slate-900">×{item.quantity}</p>
                      <p className="text-[11px] text-slate-500">{formatPeso(item.unitPrice * item.quantity)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shipping */}
        {order.shippingAddress && (
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /> Shipping
            </p>
            <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">{order.shippingAddress}</p>
          </div>
        )}

        {/* Note composer */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" /> Add internal note
          </p>
          <Textarea
            rows={2}
            placeholder="Reminder, escalation, customer message…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-1.5 flex justify-end">
            <Button
              size="sm"
              disabled={!note.trim() || savingNote}
              loading={savingNote}
              onClick={handleAddNote}
            >
              <Send className="w-3 h-3 mr-1" />
              Post note
            </Button>
          </div>
        </div>

        {/* Feedback strip */}
        {feedback && (
          <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${
            feedback.kind === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border border-rose-200 text-rose-700'
          }`}>
            {feedback.kind === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Timeline */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Order timeline
          </p>
          {loadingLogs ? (
            <div className="py-6 flex items-center justify-center">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No activity logged yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log: any) => {
                const meta = LOG_TYPE_META[log.type] || LOG_TYPE_META.note;
                const Icon = meta.icon;
                return (
                  <div key={log._id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50">
                    <div className={`w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 ${meta.tint}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${meta.tint}`}>{meta.label}</span>
                        <span className="text-[11px] text-slate-500">
                          by {log.performedByName || 'System'} · {timeAgo(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-0.5 break-words">{describeLog(log)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <RefundModal
        isOpen={refundOpen}
        onClose={() => setRefundOpen(false)}
        order={order}
        onSuccess={() => { setRefundOpen(false); refresh(); }}
      />
    </Modal>
  );
}
