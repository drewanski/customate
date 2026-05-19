import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { Textarea } from '../Textarea';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User as UserIcon,
  MessageCircle,
  Flag,
  Calendar,
  Truck,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Edit,
} from 'lucide-react';
import {
  advanceProductionStage,
  addProductionNote,
  getProductionHistory,
} from '../../api';

const STAGES = [
  { id: 'queued', label: 'Queued' },
  { id: 'design_review', label: 'Design Review' },
  { id: 'printing', label: 'Printing' },
  { id: 'assembly', label: 'Assembly' },
  { id: 'quality_check', label: 'Quality Check' },
  { id: 'packing', label: 'Packing' },
  { id: 'ready', label: 'Ready' },
];

const STAGE_TINTS: Record<string, string> = {
  queued: 'from-slate-500 to-slate-600',
  design_review: 'from-purple-500 to-pink-500',
  printing: 'from-blue-500 to-indigo-500',
  assembly: 'from-cyan-500 to-blue-500',
  quality_check: 'from-amber-500 to-orange-500',
  packing: 'from-emerald-500 to-teal-500',
  ready: 'from-green-500 to-emerald-500',
};

const TYPE_META: Record<string, { label: string; tint: string; icon: any }> = {
  scheduled: { label: 'Scheduled', tint: 'text-blue-700', icon: Calendar },
  rescheduled: { label: 'Rescheduled', tint: 'text-amber-700', icon: Calendar },
  stage_changed: { label: 'Stage advance', tint: 'text-indigo-700', icon: ChevronRight },
  priority_changed: { label: 'Priority change', tint: 'text-rose-700', icon: Flag },
  assigned: { label: 'Assigned', tint: 'text-emerald-700', icon: UserIcon },
  unassigned: { label: 'Unassigned', tint: 'text-slate-700', icon: UserIcon },
  note: { label: 'Note added', tint: 'text-slate-700', icon: MessageCircle },
  started: { label: 'Production started', tint: 'text-emerald-700', icon: Sparkles },
  completed: { label: 'Marked ready', tint: 'text-emerald-700', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', tint: 'text-rose-700', icon: AlertTriangle },
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
  if (log.type === 'rescheduled') {
    const from = log.from ? new Date(log.from).toLocaleDateString() : '—';
    const to = log.to ? new Date(log.to).toLocaleDateString() : '—';
    return `${from} → ${to}`;
  }
  if (log.type === 'scheduled') return new Date(log.to).toLocaleDateString();
  if (log.type === 'stage_changed') return `${log.from || '—'} → ${log.to || '—'}`;
  if (log.type === 'priority_changed') return `${log.from} → ${log.to}`;
  if (log.type === 'assigned' || log.type === 'unassigned') {
    return log.to ? `Assigned (${String(log.to).slice(-6)})` : 'Cleared assignment';
  }
  return log.note || '';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onChanged: () => void;
  onEdit: () => void;
}

/**
 * Order detail modal showing the full pipeline progress bar, current stage,
 * advance/back buttons, audit log, and an inline note composer.
 */
export function OrderDetailDrawer({ isOpen, onClose, order, onChanged, onEdit }: Props) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (!isOpen || !order) return;
    setNote('');
    (async () => {
      setLoadingLogs(true);
      try {
        const list = await getProductionHistory(order._id);
        setLogs(list);
      } catch {
        setLogs([]);
      } finally {
        setLoadingLogs(false);
      }
    })();
  }, [isOpen, order?._id]);

  const refresh = async () => {
    if (!order) return;
    const list = await getProductionHistory(order._id);
    setLogs(list);
    onChanged();
  };

  const handleAdvance = async (direction: 'forward' | 'backward') => {
    if (!order) return;
    setAdvancing(true);
    try {
      await advanceProductionStage(order._id, { direction });
      await refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to advance stage');
    } finally {
      setAdvancing(false);
    }
  };

  const handleAddNote = async () => {
    if (!order || !note.trim()) return;
    setSavingNote(true);
    try {
      await addProductionNote(order._id, note.trim());
      setNote('');
      await refresh();
    } catch (err: any) {
      alert(err.message || 'Failed to add note');
    } finally {
      setSavingNote(false);
    }
  };

  if (!order) return null;

  const currentStageIdx = STAGES.findIndex((s) => s.id === (order.productionStage || 'queued'));
  const canAdvance = currentStageIdx < STAGES.length - 1;
  const canRewind = currentStageIdx > 0;
  const overdue =
    order.productionDueDate &&
    new Date(order.productionDueDate) < new Date() &&
    order.productionStage !== 'ready';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order #${String(order._id).slice(-6)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" onClick={onEdit}>
            <Edit className="w-4 h-4 mr-1.5" /> Edit schedule
          </Button>
        </>
      }
    >
      <div className="space-y-5 max-h-[78vh] overflow-y-auto px-1">
        {/* Header card */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-bold text-slate-900 text-lg leading-tight">
                {order.customer?.name || 'Customer'}
              </p>
              <p className="text-xs text-slate-500">{order.customer?.email}</p>
              {order.contactPhone && (
                <p className="text-xs text-slate-500 mt-0.5">{order.contactPhone}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Order total</p>
              <p className="text-xl font-black text-slate-900">{order.totalQty} units</p>
              <p className="text-xs font-semibold text-slate-700">₱{Number(order.totalPrice || 0).toLocaleString()}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Started</p>
              <p className="font-semibold text-slate-900">
                {order.productionDate ? new Date(order.productionDate).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Due by</p>
              <p className={`font-semibold ${overdue ? 'text-rose-600' : 'text-slate-900'}`}>
                {order.productionDueDate
                  ? new Date(order.productionDueDate).toLocaleDateString()
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Assignee</p>
              <p className="font-semibold text-slate-900 truncate">
                {order.assignedTo?.name || 'Unassigned'}
              </p>
            </div>
          </div>
        </div>

        {/* Pipeline progress */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Production pipeline</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {STAGES.map((stage, idx) => {
              const isDone = idx < currentStageIdx;
              const isCurrent = idx === currentStageIdx;
              return (
                <React.Fragment key={stage.id}>
                  <div className="flex flex-col items-center min-w-[78px]">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
                        isCurrent
                          ? `bg-gradient-to-br ${STAGE_TINTS[stage.id]} text-white shadow-md ring-4 ring-blue-500/15`
                          : isDone
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                    </div>
                    <p className={`text-[10px] font-semibold mt-1 text-center ${
                      isCurrent ? 'text-slate-900' : isDone ? 'text-emerald-700' : 'text-slate-400'
                    }`}>
                      {stage.label}
                    </p>
                  </div>
                  {idx < STAGES.length - 1 && (
                    <div className={`flex-1 h-0.5 ${idx < currentStageIdx ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!canRewind || advancing}
              onClick={() => handleAdvance('backward')}
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous stage
            </Button>
            <Button
              size="sm"
              disabled={!canAdvance || advancing}
              onClick={() => handleAdvance('forward')}
              loading={advancing}
            >
              Advance to {canAdvance ? STAGES[currentStageIdx + 1].label : '—'}
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>

        {/* Items */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Line items</p>
          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {order.items?.map((item: any, idx: number) => (
              <div key={idx} className="flex items-start justify-between p-3 gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{item.name}</p>
                  {(item.customization?.size || item.customization?.color || item.customization?.text) && (
                    <p className="text-[11px] text-slate-500">
                      {[
                        item.customization?.size && `Size: ${item.customization.size}`,
                        item.customization?.color && `Color: ${item.customization.color}`,
                        item.customization?.text && `Text: "${item.customization.text}"`,
                      ].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold text-slate-900 flex-shrink-0">×{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Shipping */}
        {order.shippingAddress && (
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /> Shipping address
            </p>
            <p className="text-sm text-slate-700">{order.shippingAddress}</p>
          </div>
        )}

        {/* Notes composer */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" /> Add a note
          </p>
          <Textarea
            rows={2}
            placeholder="Status update, blocker, customer message…"
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
              Post note
            </Button>
          </div>
        </div>

        {/* Audit log */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Production history
          </p>
          {loadingLogs ? (
            <div className="py-6 flex items-center justify-center">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No production activity yet.</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log: any) => {
                const meta = TYPE_META[log.type] || TYPE_META.note;
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
    </Modal>
  );
}
