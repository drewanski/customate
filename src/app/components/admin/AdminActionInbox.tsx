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
 * AdminActionInbox — a focused "needs your action right now" panel that
 * replaces the "navigate to Orders → search → click" friction with a
 * single-click jump to the drawer. Lives on the admin Overview tab.
 *
 * Buckets are intentionally narrow: each one corresponds to ONE concrete
 * action the admin (or staff) can take. Approving means clicking Approve,
 * assigning means opening the schedule modal, etc — same actions the
 * drawer's NEXT STEP card surfaces, just collated across all open orders
 * so the admin doesn't have to scan a full table.
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

type Bucket = {
  id: string;
  label: string;
  hint: string;
  icon: typeof Inbox;
  tint: string;
  pill: string;
  match: (o: OrderLite) => boolean;
};

const BUCKETS: Bucket[] = [
  // Quotation workflow — front-of-queue actions for the new flow.
  {
    id: 'quote-needed',
    label: 'Send a quote',
    hint: 'Customer submitted a request — review their design and send the final price',
    icon: FileText,
    tint: 'from-blue-500 to-indigo-600',
    pill: 'bg-blue-100 text-blue-700 border-blue-200',
    match: (o) => o.status === 'quote_requested',
  },
  {
    id: 'verify-downpayment',
    label: 'Verify downpayment',
    hint: 'Customer uploaded payment proof — verify so production can start',
    icon: Wallet,
    tint: 'from-amber-500 to-orange-500',
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
    match: (o) => o.status === 'accepted' && !!o.payments?.downpayment?.submittedAt && !o.payments?.downpayment?.verifiedAt,
  },
  {
    id: 'verify-balance',
    label: 'Verify balance payment',
    hint: 'Order is ready — customer paid the balance, verify to release',
    icon: Receipt,
    tint: 'from-emerald-500 to-teal-600',
    pill: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    match: (o) => o.status === 'ready' && !!o.payments?.balance?.submittedAt && !o.payments?.balance?.verifiedAt,
  },
  {
    id: 'pending-approval',
    label: 'Awaiting your approval',
    hint: 'Order is ready to approve — downpayment in, queue for production',
    icon: Hourglass,
    tint: 'from-amber-500 to-orange-500',
    pill: 'bg-amber-100 text-amber-700 border-amber-200',
    match: (o) => o.status === 'pending' || o.status === 'downpayment_paid',
  },
  {
    id: 'needs-staff',
    label: 'Awaiting staff assignment',
    hint: 'Approved but no production staff picked yet',
    icon: UserPlus,
    tint: 'from-violet-500 to-fuchsia-500',
    pill: 'bg-violet-100 text-violet-700 border-violet-200',
    match: (o) => o.status === 'approved' && !o.assignedTo,
  },
  {
    id: 'qc-pending',
    label: 'QC awaiting review',
    hint: 'Staff submitted finished work — review the QC photo',
    icon: CameraIcon,
    tint: 'from-purple-500 to-indigo-500',
    pill: 'bg-purple-100 text-purple-700 border-purple-200',
    match: (o) => o.status === 'in_production' && o.qcStatus === 'pending',
  },
  {
    id: 'needs-courier',
    label: 'Ready for courier handoff',
    hint: 'Ready to ship — assign Lalamove / LBC / Grab / J&T',
    icon: Truck,
    tint: 'from-sky-500 to-blue-600',
    pill: 'bg-sky-100 text-sky-700 border-sky-200',
    match: (o) =>
      o.status === 'ready'
      && o.deliveryMethod === 'delivery'
      && !o.courier?.trackingNumber,
  },
  {
    id: 'blockers',
    label: 'Blocked orders',
    hint: 'Production staff flagged an issue — review and unblock',
    icon: AlertTriangle,
    tint: 'from-rose-500 to-red-500',
    pill: 'bg-rose-100 text-rose-700 border-rose-200',
    match: (o) => o.blockerStatus === 'active',
  },
];

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

export function AdminActionInbox({ orders }: { orders: OrderLite[] }) {
  const grouped = useMemo(() => {
    return BUCKETS.map((b) => ({
      bucket: b,
      items: orders.filter(b.match).sort((a, c) => {
        // Rush orders bubble to the top of each bucket so urgent work is obvious.
        const aRush = (a.rushFeeAmount || 0) > 0 || (a.urgencyTier && a.urgencyTier !== 'standard');
        const cRush = (c.rushFeeAmount || 0) > 0 || (c.urgencyTier && c.urgencyTier !== 'standard');
        if (aRush && !cRush) return -1;
        if (!aRush && cRush) return 1;
        // Then by age — oldest first (most overdue).
        const aT = new Date(a.createdAt || 0).getTime();
        const cT = new Date(c.createdAt || 0).getTime();
        return aT - cT;
      }),
    }));
  }, [orders]);

  const totalAction = grouped.reduce((sum, g) => sum + g.items.length, 0);

  // All-clear state — nothing to do.
  if (totalAction === 0) {
    return (
      <div className="rounded-2xl border-2 border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-md">
          <CheckCircle2 className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-lg font-bold text-emerald-900">All clear — no orders need your attention</p>
          <p className="text-sm text-emerald-700/80">New orders will appear here as soon as they come in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-blue-100 bg-white shadow-sm overflow-hidden">
      {/* Header — the big number forces attention on workload */}
      <div className="px-5 py-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
            <Inbox className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-900 tracking-tight">Needs your action</p>
            <p className="text-xs text-slate-600">
              {totalAction} order{totalAction === 1 ? '' : 's'} waiting on you — click any row to open
            </p>
          </div>
        </div>
        <Link
          to="/admin/orders"
          className="text-xs font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
        >
          View all orders <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="divide-y divide-slate-100">
        {grouped.map(({ bucket, items }) => {
          if (items.length === 0) return null;
          const Icon = bucket.icon;
          return (
            <div key={bucket.id}>
              <div className="px-5 py-2.5 flex items-center justify-between bg-slate-50/40">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${bucket.tint} flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{bucket.label}</p>
                    <p className="text-[10px] text-slate-500 truncate">{bucket.hint}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${bucket.pill} flex-shrink-0`}>
                  {items.length}
                </span>
              </div>
              {items.slice(0, 4).map((o) => {
                const id = o.id || o._id;
                const isRush = (o.rushFeeAmount || 0) > 0 || (o.urgencyTier && o.urgencyTier !== 'standard');
                return (
                  <Link
                    key={id}
                    to={`/admin/orders?id=${id}`}
                    className="px-5 py-2.5 flex items-center gap-3 hover:bg-blue-50/40 transition-colors group"
                  >
                    <code className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
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
              })}
              {items.length > 4 && (
                <Link
                  to={`/admin/orders?status=${bucket.match.toString().includes("status === 'pending'") ? 'pending' : items[0].status}`}
                  className="block px-5 py-2 text-center text-[10px] font-bold text-blue-700 hover:bg-blue-50/60 transition-colors"
                >
                  + {items.length - 4} more — see them all
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
