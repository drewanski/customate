import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  ArrowRight,
  ShieldAlert,
  Truck as TruckIcon,
  ExternalLink,
} from 'lucide-react';
import {
  updateOrderStatus,
  addOrderNote,
  getOrderHistory,
  setOrderCourier,
} from '../../api';
import { formatPeso } from '../../utils/format';
import { RefundModal } from './RefundModal';
import { useAuth } from '../../hooks/useAuth';
import { AIOrderSummaryPanel } from './AIOrderSummaryPanel';
import { OrderChatPanel } from '../chat/OrderChatPanel';
import { getNextStep, canCancel, canReject, isTerminal as _isTerminal, terminalReason } from '../../lib/orderWorkflow';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onChanged: () => void;
}

// Workflow pipeline — the canonical order. Branches between out_for_delivery
// and for_pickup based on the order's deliveryMethod so admin can't pick a
// status that contradicts what the customer chose at checkout.
// `cancelled`/`rejected`/`refunded` are terminal off-shoots not in the strip.
const PIPELINE_BASE = [
  { id: 'pending', label: 'Pending', tint: 'from-slate-500 to-slate-700' },
  { id: 'approved', label: 'Approved', tint: 'from-blue-500 to-indigo-500' },
  { id: 'in_production', label: 'Production', tint: 'from-purple-500 to-fuchsia-500' },
  { id: 'ready', label: 'Ready', tint: 'from-emerald-500 to-teal-500' },
];
const PIPELINE_DELIVERY = [
  ...PIPELINE_BASE,
  { id: 'out_for_delivery', label: 'Out for delivery', tint: 'from-sky-500 to-blue-600' },
  { id: 'completed', label: 'Completed', tint: 'from-green-500 to-emerald-500' },
];
const PIPELINE_PICKUP = [
  ...PIPELINE_BASE,
  { id: 'for_pickup', label: 'For pickup', tint: 'from-sky-500 to-blue-600' },
  { id: 'completed', label: 'Completed', tint: 'from-green-500 to-emerald-500' },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  in_production: 'bg-purple-100 text-purple-700 border-purple-200',
  ready: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  out_for_delivery: 'bg-sky-100 text-sky-700 border-sky-200',
  for_pickup: 'bg-sky-100 text-sky-700 border-sky-200',
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

/**
 * Next-step action card. Shows ONE primary forward-action button labeled
 * with the next step, plus any pre-conditions that need clearing before
 * it can fire. Mirrors backend pre-condition rules via getNextStep().
 *
 * Pre-conditions render as red strip when unmet (with optional fix link)
 * or as quiet emerald checks when met. Once everything's green, the
 * primary button enables.
 */
function NextStepCard({
  order,
  updating,
  onPromote,
  onClose,
}: {
  order: any;
  updating: boolean;
  onPromote: (to: string) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const next = getNextStep(order);
  if (!next) return null;

  const unmet = next.conditions.filter((c) => !c.met);
  const met = next.conditions.filter((c) => c.met);

  // When the next step is blocked by a single fixable condition (e.g.
  // "Assign staff" → /admin/production), the primary button becomes a
  // navigate-to-fix shortcut instead of a disabled action. The admin
  // clicks one button, lands on the right tab with the order
  // pre-selected and the schedule modal already open. After the gap is
  // resolved on that page, returning here shows everything green.
  const firstFixable = unmet.find((c) => c.fixHref);
  const useFixShortcut = !next.ready && !!firstFixable;
  const fixIsScheduleStaff =
    !!firstFixable && /production/.test(firstFixable.fixHref || '') && next.to === 'in_production';

  const buttonLabel = useFixShortcut
    ? (fixIsScheduleStaff ? 'Schedule production' : 'Resolve in next tab')
    : next.label;

  const handleClick = () => {
    if (useFixShortcut && firstFixable && firstFixable.fixHref) {
      // Tack on the order id + auto-action so the destination page
      // can open the right modal immediately.
      const orderId = order.id || order._id;
      const url = fixIsScheduleStaff
        ? `${firstFixable.fixHref}?id=${orderId}&action=schedule`
        : `${firstFixable.fixHref}?id=${orderId}`;
      onClose();
      navigate(url);
      return;
    }
    onPromote(next.to);
  };

  return (
    <div className="mt-3 rounded-2xl border-2 border-blue-100 bg-gradient-to-br from-blue-50/60 via-indigo-50/40 to-white p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700 mb-0.5">Next step</p>
          <p className="text-sm font-bold text-slate-900">{next.label}</p>
        </div>
        <Button
          size="sm"
          disabled={updating}
          onClick={handleClick}
          className="bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
          title={
            useFixShortcut
              ? 'Opens the next tab so you can resolve the blocker'
              : 'Promote this order to the next stage'
          }
        >
          {updating ? 'Updating…' : buttonLabel}
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </div>

      {/* Pre-condition checklist — unmet first so the eye lands on what
          needs fixing. Each unmet line can carry an in-app fix link. */}
      {(unmet.length > 0 || met.length > 0) && (
        <ul className="space-y-1.5">
          {unmet.map((c, i) => (
            <li
              key={`u-${i}`}
              className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span className="flex-1">
                {c.message}
                {c.fixHref && (
                  <>
                    {' · '}
                    <Link
                      to={`${c.fixHref}?id=${order.id || order._id}${fixIsScheduleStaff ? '&action=schedule' : ''}`}
                      onClick={onClose}
                      className="font-bold underline hover:text-rose-900"
                    >
                      Fix it
                    </Link>
                  </>
                )}
              </span>
            </li>
          ))}
          {met.map((c, i) => (
            <li
              key={`m-${i}`}
              className="flex items-start gap-2 text-xs text-emerald-700"
            >
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{c.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Courier handoff panel — admin records who's delivering the parcel
 * (Lalamove, LBC, Grab, J&T, Other) + the tracking number. Saving
 * fires the backend's POST /orders/:id/courier which:
 *   1. Stores the courier subdoc on the order.
 *   2. Posts a customer-visible system chat message with the tracking
 *      info so the customer can copy it from the chat thread.
 *   3. Rings the customer's bell.
 *
 * Re-rendering the panel after save shows the existing courier info
 * with an "Update" affordance so admin can fix typos or change couriers
 * mid-delivery.
 */
const COURIER_PRESETS = ['Lalamove', 'LBC', 'Grab Express', 'J&T Express', 'Ninjavan', 'Other'];
function CourierHandoffPanel({ order, onSaved }: { order: any; onSaved: () => Promise<void> }) {
  const existing = order.courier;
  const [editing, setEditing] = useState(!existing);
  const [name, setName] = useState(existing?.name || '');
  const [trackingNumber, setTrackingNumber] = useState(existing?.trackingNumber || '');
  const [trackingUrl, setTrackingUrl] = useState(existing?.trackingUrl || '');
  const [contactPhone, setContactPhone] = useState(existing?.contactPhone || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    if (!name.trim()) return setErr('Pick a courier');
    if (!trackingNumber.trim()) return setErr('Tracking number is required — customer will see this in their chat');
    setSaving(true);
    try {
      await setOrderCourier(order.id || order._id, {
        name: name.trim(),
        trackingNumber: trackingNumber.trim(),
        trackingUrl: trackingUrl.trim(),
        contactPhone: contactPhone.trim(),
        notes: notes.trim(),
      });
      setEditing(false);
      await onSaved();
    } catch (e: any) {
      setErr(e.message || 'Failed to save courier info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-sky-100 bg-sky-50/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-sky-800 uppercase tracking-wider flex items-center gap-1.5">
          <TruckIcon className="w-3.5 h-3.5" /> Courier handoff
        </p>
        {existing && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="border-sky-300 text-sky-800">
            Update
          </Button>
        )}
      </div>

      {/* Read-only summary when already filled in and not editing */}
      {existing && !editing && (
        <div className="space-y-1.5 text-xs text-slate-700">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Courier:</span>
            <span className="font-bold">{existing.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Tracking #:</span>
            <code className="font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded">{existing.trackingNumber}</code>
            {existing.trackingUrl && (
              <a
                href={existing.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-sky-700 hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Track
              </a>
            )}
          </div>
          {existing.contactPhone && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Rider:</span>
              <span>{existing.contactPhone}</span>
            </div>
          )}
          {existing.notes && (
            <div className="text-slate-600 italic mt-1">"{existing.notes}"</div>
          )}
          {existing.handedOffAt && (
            <div className="text-[10px] text-slate-400 mt-1">
              Handed off {new Date(existing.handedOffAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Edit / first-time-fill form */}
      {editing && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 px-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              <option value="">Pick courier…</option>
              {COURIER_PRESETS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Tracking number"
              className="h-10 px-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <input
            type="url"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="Tracking URL (optional, e.g. https://lalamove.com/…)"
            className="w-full h-10 px-2 border border-slate-200 rounded-lg text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Rider phone (optional)"
              className="h-10 px-2 border border-slate-200 rounded-lg text-sm"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (e.g. arriving 3-5pm)"
              className="h-10 px-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          {err && <p className="text-xs text-rose-700">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={saving} className="bg-sky-600 hover:bg-sky-700 text-white">
              {saving ? 'Saving…' : 'Save & notify customer'}
            </Button>
            {existing && (
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setErr(null); }}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-[10px] text-sky-700/80">
            The customer will see "{name || 'Courier'} — {trackingNumber || 'tracking #'}" in their chat and bell.
          </p>
        </div>
      )}
    </div>
  );
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

  // Pick the right pipeline based on the order's delivery method so the
  // admin only sees / can pick the valid next status. A `shipped` or
  // `delivered` legacy status maps to the post-Ready branch.
  const PIPELINE = order.deliveryMethod === 'pickup' ? PIPELINE_PICKUP : PIPELINE_DELIVERY;
  // Map legacy shipped/delivered onto the new branch so the strip still finds an index.
  const normalizedStatus =
    order.status === 'shipped' || order.status === 'delivered'
      ? (order.deliveryMethod === 'pickup' ? 'for_pickup' : 'out_for_delivery')
      : order.status;
  const currentStageIdx = PIPELINE.findIndex((s) => s.id === normalizedStatus);
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

        {/* ─── Pipeline progress (READ-ONLY visual) ─────────────────────
            The clickable pipeline was rewritten to a read-only progress
            strip + a single Next-step button below. This stops admins from
            attempting "skip-ahead" transitions the backend would reject
            anyway, and surfaces the actual blockers before the click. */}
        {!isTerminal && (
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Order pipeline</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {PIPELINE.map((stage, idx) => {
                const done = idx < currentStageIdx;
                const current = idx === currentStageIdx;
                return (
                  <React.Fragment key={stage.id}>
                    <div
                      className="flex flex-col items-center min-w-[70px]"
                      title={current ? `Current stage: ${stage.label}` : done ? `${stage.label} — done` : `Upcoming: ${stage.label}`}
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
                    </div>
                    {idx < PIPELINE.length - 1 && (
                      <div className={`flex-1 h-0.5 ${idx < currentStageIdx ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* ─── Next-step action card ─────────────────────────────────
                Drives the entire forward progression. The label + button
                state come from `getNextStep(order)`, which mirrors the
                backend state machine — so what you see here is exactly
                what the API will accept. Pre-conditions (assign staff,
                approve QC, settle payment) are listed inline with a fix
                link when applicable. */}
            <NextStepCard
              order={order}
              updating={updatingStatus}
              onPromote={handleStatusChange}
              onClose={onClose}
            />

            {/* ─── Danger zone — clearly separated destructive actions ─── */}
            {(canCancel(order) || canReject(order)) && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/40 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Danger zone</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {canCancel(order) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange('cancelled')}
                      className="border-rose-300 text-rose-700 hover:bg-rose-100"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel order
                    </Button>
                  )}
                  {canReject(order) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updatingStatus}
                      onClick={() => handleStatusChange('rejected')}
                      className="border-rose-300 text-rose-700 hover:bg-rose-100"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Reject order
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-rose-700/80 mt-2">
                  Both actions require a customer-facing reason and notify them in the order chat + bell.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Terminal-state explainer — shown instead of the pipeline when
            the order is in completed/cancelled/rejected/refunded. */}
        {isTerminal && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-700">
              {terminalReason(order.status as any) || 'This order is in a terminal state.'}
            </p>
          </div>
        )}

        {/* Courier handoff — only relevant for delivery orders at the
            ready / out_for_delivery stage. Saving here auto-posts a
            customer-visible system chat message with the tracking
            number + courier name, and rings the customer's bell. */}
        {order.deliveryMethod === 'delivery'
          && (order.status === 'ready' || order.status === 'out_for_delivery') && (
          <CourierHandoffPanel
            order={order}
            onSaved={async () => {
              await onChanged();
            }}
          />
        )}

        {/* Order chat — admin can reply to the customer here without leaving
            the drawer. The panel shows order context + system status messages
            automatically. */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Receipt className="w-3.5 h-3.5" /> Conversation
          </p>
          <OrderChatPanel
            orderId={orderId}
            initialOrder={order}
            showHeader={false}
            heightClass="h-72"
          />
        </div>

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
