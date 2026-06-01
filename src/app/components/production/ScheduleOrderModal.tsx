import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Modal';
import { Input } from '../Input';
import { Textarea } from '../Textarea';
import { Button } from '../Button';
import {
  Calendar,
  Clock,
  Flag,
  User as UserIcon,
  AlertCircle,
  Sparkles,
  Zap,
} from 'lucide-react';
import { scheduleProductionOrder, getProductionTeam } from '../../api';
import { OrderDesignPreview } from './OrderDesignPreview';

/**
 * Map the order's urgencyTier (set at checkout when the customer picks a
 * rush option or a tight delivery date) to one of the four production
 * priority levels the modal shows. The backend already computes
 * productionPriority for us, so we mostly read that — this is the
 * fallback path for older orders where productionPriority wasn't set yet.
 */
function priorityFromTier(tier?: string): 'urgent' | 'high' | 'medium' | 'low' {
  switch ((tier || '').toLowerCase()) {
    case 'priority': return 'urgent';
    case 'rush':     return 'high';
    case 'express':  return 'high';
    case 'standard': return 'medium';
    default:         return 'medium';
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onSuccess: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent', color: 'bg-rose-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-500' },
  { value: 'low', label: 'Low', color: 'bg-slate-400' },
];

/**
 * Modal to schedule or reschedule one order. Calculates the auto-due-date
 * based on `estimatedDurationDays` and lets the admin override it manually.
 */
export function ScheduleOrderModal({ isOpen, onClose, order, onSuccess }: Props) {
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState(3);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [team, setTeam] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill form when opened. Order of precedence for each field:
  //   Due date    → admin's existing pick > customer's requestedDeliveryDate > auto from start+duration
  //   Priority    → admin's existing pick > backend productionPriority > derived from urgencyTier > 'medium'
  //   Assignee    → admin's existing pick > (empty — must be a production_staff user)
  useEffect(() => {
    if (!isOpen || !order) return;
    setError(null);
    setSubmitting(false);
    setDate(order.productionDate ? new Date(order.productionDate).toISOString().slice(0, 10) : '');
    setDuration(order.estimatedDurationDays || 3);

    // Due-date precedence:
    //  1. A previously-saved productionDueDate (admin override sticks)
    //  2. The customer's requestedDeliveryDate from checkout — this is
    //     the deadline the customer is paying us to meet, so default
    //     the production due to that instead of inventing one.
    //  3. Empty (the auto-compute effect below fills it from start + duration)
    const customerDeadline = order.requestedDeliveryDate
      ? new Date(order.requestedDeliveryDate).toISOString().slice(0, 10)
      : '';
    setDueDate(
      order.productionDueDate
        ? new Date(order.productionDueDate).toISOString().slice(0, 10)
        : customerDeadline || ''
    );

    // Priority precedence:
    //  1. The order's own productionPriority (set by the backend based on
    //     the urgency tier at checkout — rush picks 'urgent'/'high'
    //     automatically, standard picks 'medium').
    //  2. Derived from urgencyTier (handles older orders without
    //     productionPriority set).
    //  3. 'medium' default.
    setPriority(order.productionPriority || priorityFromTier(order.urgencyTier));

    setAssignedTo(order.assignedTo?._id || '');
    setNotes(order.productionNotes || '');

    (async () => {
      try {
        const list = await getProductionTeam();
        // Only production_staff can be assigned tasks. Production Manager
        // (admin) sees the dropdown but isn't a valid assignee — they
        // route work, they don't sew it.
        const staffOnly = (Array.isArray(list) ? list : []).filter(
          (m: any) => m.role === 'production_staff'
        );
        setTeam(staffOnly);
      } catch {
        setTeam([]);
      }
    })();
  }, [isOpen, order?._id]);

  // Auto-compute due date when start date or duration changes
  const computedDue = useMemo(() => {
    if (!date) return '';
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + (Number(duration) || 0));
    return d.toISOString().slice(0, 10);
  }, [date, duration]);

  useEffect(() => {
    if (!dueDate && computedDue) setDueDate(computedDue);
  }, [computedDue]); // eslint-disable-line

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!date) {
      setError('Please pick a production start date');
      return;
    }
    setSubmitting(true);
    try {
      await scheduleProductionOrder(order._id, {
        productionDate: date,
        productionDueDate: dueDate || computedDue,
        estimatedDurationDays: Number(duration) || 0,
        productionPriority: priority,
        productionNotes: notes.trim(),
        assignedTo: assignedTo || null,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={order.productionDate ? 'Reschedule Production' : 'Schedule for Production'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting}>
            <Calendar className="w-4 h-4 mr-1.5" />
            {order.productionDate ? 'Update Schedule' : 'Schedule'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
        {/* Order summary */}
        <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {/* Design preview thumbnail + download link — so the manager
                  can see (and grab) the exact artwork before scheduling. */}
              <OrderDesignPreview order={order} size="lg" showDownload filenamePrefix="schedule" />
              <div className="min-w-0">
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                  Order #{String(order._id).slice(-6)}
                </p>
                <p className="font-bold text-slate-900 truncate">{order.customer?.name || 'Customer'}</p>
                <p className="text-xs text-slate-600 truncate">{order.customer?.email}</p>
                {/* Per-item specs surfaced for quick verification */}
                {(order.items || []).slice(0, 2).map((it: any, idx: number) => (
                  <div key={idx} className="mt-1 text-[10px] text-slate-600 truncate">
                    <span className="font-bold">{it.name}</span>
                    {it.customization?.size && <> · {it.customization.size}</>}
                    {it.customization?.color && <> · {it.customization.color}</>}
                    {it.customization?.placement && <> · {it.customization.placement}</>}
                    {it.customization?.text && <> · "{it.customization.text}"</>}
                  </div>
                ))}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Total</p>
              <p className="text-lg font-black text-slate-900">{order.totalQty} units</p>
              <p className="text-xs text-slate-500">₱{Number(order.totalPrice || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* ─── Customer expectations banner ──────────────────────────────
            Surface the deadline the customer chose at checkout AND
            whether they paid for rush — both are the reason the due
            date + priority chip below got auto-filled the way they
            did. Admin sees this BEFORE they look at the date pickers
            so the defaults make sense at a glance. */}
        {(order.requestedDeliveryDate || order.rushFeeAmount > 0 || order.urgencyTier !== 'standard') && (
          <div className={`p-3 rounded-2xl border ${
            order.rushFeeAmount > 0 || order.urgencyTier !== 'standard'
              ? 'bg-rose-50 border-rose-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {order.rushFeeAmount > 0 || order.urgencyTier !== 'standard' ? (
                  <Zap className="w-4 h-4 text-rose-600 flex-shrink-0" />
                ) : (
                  <Calendar className="w-4 h-4 text-amber-600 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className={`text-[10px] uppercase tracking-wider font-bold ${
                    order.rushFeeAmount > 0 || order.urgencyTier !== 'standard'
                      ? 'text-rose-700'
                      : 'text-amber-700'
                  }`}>
                    {order.rushFeeAmount > 0 || order.urgencyTier !== 'standard'
                      ? 'Rush order — customer paid for fast delivery'
                      : 'Customer-set deadline'}
                  </p>
                  {order.requestedDeliveryDate && (
                    <p className="text-sm font-bold text-slate-900">
                      Customer expects this by{' '}
                      <span className="underline">
                        {new Date(order.requestedDeliveryDate).toLocaleDateString(undefined, {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              {order.urgencyTier && order.urgencyTier !== 'standard' && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-rose-600 text-white">
                  {order.urgencyTier}
                </span>
              )}
            </div>
            <p className={`text-[11px] mt-1 ${
              order.rushFeeAmount > 0 || order.urgencyTier !== 'standard'
                ? 'text-rose-700/80'
                : 'text-amber-700/80'
            }`}>
              We've auto-filled the due date and priority for you — change them if you need to.
            </p>
          </div>
        )}

        {/* Date row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              Start date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              <Clock className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              Est. days
            </label>
            <Input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Due by
            </label>
            <input
              type="date"
              value={dueDate || computedDue}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Priority chips */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            <Flag className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            Priority
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {PRIORITY_OPTIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value as any)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                  priority === p.value
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${p.color}`} />
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Assignee */}
        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            <UserIcon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            Assigned to
          </label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full h-11 px-3 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-blue-500/15 focus:border-blue-500 bg-white"
          >
            <option value="">Unassigned</option>
            {team.map((m) => {
              const w = (m as any).workload || {};
              const total = w.total ?? 0;
              const blocked = w.blocked ?? 0;
              const tier = w.loadTier || 'light';
              const tierLabel = tier === 'heavy' ? 'HEAVY' : tier === 'medium' ? 'MEDIUM' : 'LIGHT';
              const blockedSuffix = blocked > 0 ? ` · ${blocked} blocked` : '';
              return (
                <option key={m._id} value={m._id}>
                  {m.name} ({m.role}) — {total} active [{tierLabel}]{blockedSuffix}
                </option>
              );
            })}
          </select>
          {/* Visual workload chips below the dropdown so admin can pick by
              eye instead of reading every option. Click to select. */}
          {team.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {team.map((m) => {
                const w = (m as any).workload || {};
                const total = w.total ?? 0;
                const tier = w.loadTier || 'light';
                const tint =
                  tier === 'heavy' ? 'bg-rose-100 text-rose-700 border-rose-300'
                  : tier === 'medium' ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-emerald-100 text-emerald-700 border-emerald-300';
                const isSelected = assignedTo === m._id;
                return (
                  <button
                    key={m._id}
                    type="button"
                    onClick={() => setAssignedTo(m._id)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-bold transition ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white scale-105 shadow-md'
                        : tint + ' hover:scale-105'
                    }`}
                    title={m.role === 'admin' ? 'Production Manager' : 'Production Staff'}
                  >
                    <span className="truncate max-w-[120px]">{m.name}</span>
                    <span className="font-mono">{total}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Textarea
          label="Production notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything the team should know — special materials, customer requests, blockers…"
        />

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-[11px] text-slate-500 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Scheduling moves this order into the production pipeline starting at <strong>Design Review</strong>. Every change is logged.
        </p>
      </form>
    </Modal>
  );
}
