import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox,
  Hourglass,
  UserPlus,
  Camera as CameraIcon,
  Truck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Wallet,
  Receipt,
} from 'lucide-react';
import { formatPeso } from '../../utils/format';

/**
 * AdminActionInbox — the admin's workflow pipeline.
 *
 * Rendered as a NUMBERED sequence (1 → 2 → 3 → …) that mirrors the real
 * order lifecycle: quote → verify DP → approve → assign staff → review
 * QC → verify balance → assign courier → release. Each step shows its
 * order count; empty steps are de-emphasized but still visible so the
 * admin always knows "where am I in the workflow".
 *
 * Click any row → drawer opens for that order.  Click the step header →
 * filter all orders for that step.
 *
 * Blockers are a sibling section at the bottom — they can hit any step.
 */

type OrderLite = {
  id?: string;
  _id?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  qcStatus?: string;
  blockerStatus?: string;
  assignedTo?: any;
  deliveryMethod?: string;
  customerName?: string;
  customerEmail?: string;
  totalPrice?: number;
  createdAt?: string;
  courier?: { name?: string; trackingNumber?: string } | null;
  rushFeeAmount?: number;
  urgencyTier?: string;
  workflowVersion?: string;
  payments?: {
    downpayment?: { submittedAt?: any; verifiedAt?: any };
    balance?:     { submittedAt?: any; verifiedAt?: any };
  };
};

type Step = {
  id: string;
  step: number;            // workflow step (1-indexed)
  label: string;
  description: string;
  icon: typeof Inbox;
  tint: string;
  pill: string;
  match: (o: OrderLite) => boolean;
};

/**
 * Workflow steps in ORDER. The admin should work through these top-to-bottom,
 * one step per state in the quotation pipeline. Labels match the language
 * used in the NEXT STEP card on the drawer so the admin can switch between
 * the inbox and the drawer without a context switch.
 */
const STEPS: Step[] = [
  {
    id: 'quote-needed',
    step: 1,
    label: 'Send a quote',
    description: 'Review the design, set the price, send the quote',
    icon: FileText,
    tint: 'from-blue-500 to-indigo-600',
    pill: 'bg-blue-100 text-blue-700 border-blue-200',
    match: (o) => o.status === 'quote_requested',
  },
  {
    id: 'verify-downpayment',
    step: 2,
    label: 'Verify downpayment',
    description: 'Customer uploaded 50% deposit — check it landed in your account',
    icon: Wallet,
    tint: 'from-amber-500 to-orange-500',
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
    match: (o) => o.status === 'accepted' && !!o.payments?.downpayment?.submittedAt && !o.payments?.downpayment?.verifiedAt,
  },
  {
    id: 'pending-approval',
    step: 3,
    label: 'Approve order',
    description: 'Deposit verified — formally approve and queue for production',
    icon: Hourglass,
    tint: 'from-violet-500 to-fuchsia-600',
    pill: 'bg-violet-100 text-violet-700 border-violet-200',
    match: (o) => o.status === 'pending' || o.status === 'downpayment_paid',
  },
  {
    id: 'needs-staff',
    step: 4,
    label: 'Assign production staff',
    description: 'Schedule due date and pick who works on it',
    icon: UserPlus,
    tint: 'from-violet-500 to-purple-600',
    pill: 'bg-violet-100 text-violet-700 border-violet-200',
    match: (o) => o.status === 'approved' && !o.assignedTo,
  },
  {
    id: 'qc-pending',
    step: 5,
    label: 'Review QC photo',
    description: 'Staff finished the work — approve or reject the QC photo',
    icon: CameraIcon,
    tint: 'from-purple-500 to-fuchsia-600',
    pill: 'bg-purple-100 text-purple-700 border-purple-200',
    match: (o) => o.status === 'in_production' && o.qcStatus === 'pending',
  },
  {
    id: 'verify-balance',
    step: 6,
    label: 'Verify balance payment',
    description: 'Customer paid the remaining 50% — verify before release',
    icon: Receipt,
    tint: 'from-emerald-500 to-teal-600',
    pill: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    match: (o) => o.status === 'ready' && !!o.payments?.balance?.submittedAt && !o.payments?.balance?.verifiedAt,
  },
  {
    id: 'needs-courier',
    step: 7,
    label: 'Assign courier & release',
    description: 'Pick Lalamove / LBC / Grab / J&T and send out for delivery',
    icon: Truck,
    tint: 'from-sky-500 to-blue-600',
    pill: 'bg-sky-100 text-sky-700 border-sky-200',
    match: (o) =>
      o.status === 'ready'
      && o.deliveryMethod === 'delivery'
      && !o.courier?.trackingNumber
      // Don't double-show with verify-balance — only surface here when
      // balance has been verified (or order doesn't use quotation flow).
      && (o.workflowVersion !== 'quotation' || !!o.payments?.balance?.verifiedAt),
  },
];

const BLOCKERS_BUCKET: Step = {
  id: 'blockers',
  step: 0,
  label: 'Blocked orders',
  description: 'Staff flagged an issue — review and clear',
  icon: AlertTriangle,
  tint: 'from-rose-500 to-red-600',
  pill: 'bg-rose-100 text-rose-700 border-rose-200',
  match: (o) => o.blockerStatus === 'active',
};

function timeAgo(iso?: string) {
  if (!iso) return '';
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function shortRef(o: OrderLite) {
  return String(o.id || o._id || '').slice(-6).toUpperCase();
}

function sortByUrgencyThenAge(a: OrderLite, b: OrderLite) {
  const aRush = (a.rushFeeAmount || 0) > 0 || (a.urgencyTier && a.urgencyTier !== 'standard');
  const bRush = (b.rushFeeAmount || 0) > 0 || (b.urgencyTier && b.urgencyTier !== 'standard');
  if (aRush && !bRush) return -1;
  if (!aRush && bRush) return 1;
  const aT = new Date(a.createdAt || 0).getTime();
  const bT = new Date(b.createdAt || 0).getTime();
  return aT - bT;
}

function OrderRow({ o }: { o: OrderLite }) {
  const id = o.id || o._id;
  const isRush = (o.rushFeeAmount || 0) > 0 || (o.urgencyTier && o.urgencyTier !== 'standard');
  return (
    <Link
      to={`/admin/orders?id=${id}`}
      className="px-4 py-2 flex items-center gap-3 hover:bg-blue-50/60 transition-colors group"
    >
      <code className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
        #{shortRef(o)}
      </code>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-900 truncate">
          {o.customerName || o.customerEmail || 'Customer'}
          {isRush && (
            <span className="ml-1.5 inline-block text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
              RUSH
            </span>
          )}
        </p>
        <p className="text-[10px] text-slate-500 truncate">
          {formatPeso(o.totalPrice || 0)} · {timeAgo(o.createdAt)} ago
        </p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-700 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </Link>
  );
}

export function AdminActionInbox({ orders }: { orders: OrderLite[] }) {
  const stepData = useMemo(
    () => STEPS.map((s) => ({ ...s, items: orders.filter(s.match).sort(sortByUrgencyThenAge) })),
    [orders],
  );
  const blockers = useMemo(
    () => orders.filter(BLOCKERS_BUCKET.match).sort(sortByUrgencyThenAge),
    [orders],
  );

  const totalAction = stepData.reduce((sum, s) => sum + s.items.length, 0);
  const hasBlockers = blockers.length > 0;

  // All-clear state — every workflow step is empty and no blockers.
  if (totalAction === 0 && !hasBlockers) {
    return (
      <div className="rounded-2xl border-2 border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-md">
          <CheckCircle2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-900">All clear — no orders need your attention</p>
          <p className="text-sm text-emerald-700/80">New requests will appear here as soon as customers submit.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Main pipeline card — header explains the workflow at a glance */}
      <div className="rounded-2xl border-2 border-blue-100 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
              <Inbox className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-lg font-black text-slate-900 tracking-tight">Order workflow</p>
              <p className="text-xs text-slate-600">
                {totalAction === 0
                  ? 'No active orders right now'
                  : `${totalAction} order${totalAction === 1 ? '' : 's'} need your attention — work each step in order`}
              </p>
            </div>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
          >
            All orders <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Steps — every step ALWAYS visible (de-emphasized when empty) so
            the admin can see the whole pipeline. Active steps light up. */}
        <div className="divide-y divide-slate-100">
          {stepData.map(({ id, step, label, description, icon: Icon, tint, pill, items }) => {
            const isEmpty = items.length === 0;
            return (
              <div key={id} className={isEmpty ? 'opacity-50' : ''}>
                <div className="px-4 py-3 flex items-center gap-3 bg-slate-50/40">
                  {/* Step number */}
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm`}>
                    {step}
                  </div>
                  {/* Icon + label + hint */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{label}</p>
                      <p className="text-[10px] text-slate-500 truncate">{description}</p>
                    </div>
                  </div>
                  {/* Count pill */}
                  <span className={`text-[11px] font-black px-2 py-0.5 rounded-full border flex-shrink-0 ${isEmpty ? 'bg-slate-100 text-slate-400 border-slate-200' : pill}`}>
                    {items.length}
                  </span>
                </div>
                {/* Order rows for this step (max 4 shown inline) */}
                {!isEmpty && (
                  <div className="bg-white">
                    {items.slice(0, 4).map((o) => (
                      <OrderRow key={o.id || o._id} o={o} />
                    ))}
                    {items.length > 4 && (
                      <Link
                        to="/admin/orders"
                        className="block px-5 py-2 text-center text-[10px] font-bold text-blue-700 hover:bg-blue-50/60 transition-colors"
                      >
                        + {items.length - 4} more in this step — view all
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Blockers — sibling card, only shows when there are any. Visually
          separated because a blocker can apply at ANY step, not at a
          specific position in the pipeline. */}
      {hasBlockers && (
        <div className="rounded-2xl border-2 border-rose-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 bg-gradient-to-br from-rose-50 to-red-50 border-b border-rose-200 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-md">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-black text-rose-900 tracking-tight">Blocked orders</p>
              <p className="text-[11px] text-rose-700/80">Staff flagged an issue. Clear the blocker to resume.</p>
            </div>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full border bg-rose-100 text-rose-700 border-rose-200 flex-shrink-0">
              {blockers.length}
            </span>
          </div>
          <div>
            {blockers.slice(0, 4).map((o) => (
              <OrderRow key={o.id || o._id} o={o} />
            ))}
            {blockers.length > 4 && (
              <Link
                to="/admin/orders"
                className="block px-5 py-2 text-center text-[10px] font-bold text-rose-700 hover:bg-rose-50/60 transition-colors"
              >
                + {blockers.length - 4} more blocked — view all
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminActionInbox;
