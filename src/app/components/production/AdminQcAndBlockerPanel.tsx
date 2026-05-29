import React, { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ChevronDown,
  AlertTriangle,
  Clock,
  User as UserIcon,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  getQcPending,
  getActiveBlockers,
  approveQc,
  rejectQc,
  clearBlocker,
  getProductionTeam,
} from '../../api';

/**
 * Sits above the existing production queue. Two stacked panels:
 *   1. QC Review queue   — pending finished-product photos awaiting approve/reject
 *   2. Active blockers   — paused tasks waiting for the manager to unblock
 *
 * Each is collapsible (defaults to open if there's content). Designed
 * to be the first thing the manager sees on the Production page so they
 * never miss a QC-pending or blocked order.
 */
export function AdminQcAndBlockerPanel({ onChange }: { onChange?: () => void }) {
  const [qcOrders, setQcOrders] = useState<any[]>([]);
  const [blockedOrders, setBlockedOrders] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [qcOpen, setQcOpen] = useState(true);
  const [blockersOpen, setBlockersOpen] = useState(true);

  const [rejectModal, setRejectModal] = useState<any | null>(null);
  const [clearModal, setClearModal] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qc, blockers, t] = await Promise.all([
        getQcPending().catch(() => []),
        getActiveBlockers().catch(() => []),
        getProductionTeam().catch(() => []),
      ]);
      setQcOrders(Array.isArray(qc) ? qc : []);
      setBlockedOrders(Array.isArray(blockers) ? blockers : []);
      setTeam(Array.isArray(t) ? t : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const handleApprove = async (orderId: string) => {
    try {
      await approveQc(orderId);
      await load();
      onChange?.();
    } catch (err: any) {
      alert(err?.message || 'Approve failed');
    }
  };

  if (loading && qcOrders.length === 0 && blockedOrders.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {/* QC Review */}
      {qcOrders.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-200 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setQcOpen((v) => !v)}
            className="w-full px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-amber-700" />
              <p className="text-sm font-black text-slate-900">
                QC Review · {qcOrders.length} {qcOrders.length === 1 ? 'photo' : 'photos'} waiting
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform ${qcOpen ? 'rotate-180' : ''}`} />
          </button>
          {qcOpen && (
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {qcOrders.map((o) => (
                <QcReviewCard
                  key={o._id}
                  order={o}
                  onApprove={() => handleApprove(String(o._id))}
                  onReject={() => setRejectModal(o)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Blockers */}
      {blockedOrders.length > 0 && (
        <div className="rounded-2xl border-2 border-rose-200 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setBlockersOpen((v) => !v)}
            className="w-full px-4 py-3 bg-gradient-to-r from-rose-50 to-orange-50 border-b border-rose-100 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-700" />
              <p className="text-sm font-black text-slate-900">
                Blocked · {blockedOrders.length} {blockedOrders.length === 1 ? 'task' : 'tasks'} need attention
              </p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-600 transition-transform ${blockersOpen ? 'rotate-180' : ''}`} />
          </button>
          {blockersOpen && (
            <div className="p-3 space-y-2">
              {blockedOrders.map((o) => (
                <BlockerRow
                  key={o._id}
                  order={o}
                  onClear={() => setClearModal(o)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {rejectModal && (
        <RejectQcModal
          order={rejectModal}
          onClose={() => setRejectModal(null)}
          onRejected={async () => {
            setRejectModal(null);
            await load();
            onChange?.();
          }}
        />
      )}
      {clearModal && (
        <ClearBlockerModal
          order={clearModal}
          team={team}
          onClose={() => setClearModal(null)}
          onCleared={async () => {
            setClearModal(null);
            await load();
            onChange?.();
          }}
        />
      )}
    </div>
  );
}

// ─── QC Review Card ────────────────────────────────────────────────────

function QcReviewCard({ order, onApprove, onReject }: any) {
  const items = order.items || [];
  const designPreview = items[0]?.customization?.previewImage;
  const refShort = String(order._id).slice(-6).toUpperCase();
  const uploadedBy = order.qcPhotoUploadedBy?.name || 'Staff';
  const ago = order.qcPhotoUploadedAt
    ? timeAgo(new Date(order.qcPhotoUploadedAt))
    : '';

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <div className="grid grid-cols-2 gap-1 p-2">
        {/* Design (what was ordered) */}
        <div className="flex flex-col">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1">Design</p>
          {designPreview ? (
            <a href={designPreview} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:border-blue-400">
              <img src={designPreview} alt="Design" className="w-full h-32 object-contain" />
            </a>
          ) : (
            <div className="w-full h-32 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-[10px]">No preview</div>
          )}
        </div>
        {/* Finished (what staff made) */}
        <div className="flex flex-col">
          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700 mb-1">Finished by staff</p>
          {order.qcPhoto ? (
            <a href={order.qcPhoto} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden bg-slate-100 border-2 border-emerald-300 hover:border-emerald-500">
              <img src={order.qcPhoto} alt="QC" className="w-full h-32 object-cover" />
            </a>
          ) : (
            <div className="w-full h-32 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 text-[10px]">No photo</div>
          )}
        </div>
      </div>
      <div className="px-3 py-2 text-[11px] text-slate-600 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono font-bold text-slate-700">#{refShort}</span>
          <span className="text-slate-400">·</span>
          <span className="font-bold truncate">{items[0]?.name}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <UserIcon className="w-3 h-3" />
          {uploadedBy}
          <span className="text-slate-400">·</span>
          <Clock className="w-3 h-3" />
          {ago}
        </div>
      </div>
      <div className="flex border-t border-slate-100">
        <button
          onClick={onReject}
          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-black text-rose-700 hover:bg-rose-50 border-r border-slate-100 transition"
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </button>
        <button
          onClick={onApprove}
          className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-700 transition"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Approve
        </button>
      </div>
    </div>
  );
}

// ─── Blocker Row ───────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  material_out_of_stock: 'Material out of stock',
  machine_issue: 'Machine issue / broken',
  design_unclear: 'Design unclear / corrupted',
  customer_change_requested: 'Customer change',
  damaged_during_production: 'Damaged in production',
  other: 'Other',
};

function BlockerRow({ order, onClear }: any) {
  const refShort = String(order._id).slice(-6).toUpperCase();
  const items = order.items || [];
  const ago = order.blockedAt ? timeAgo(new Date(order.blockedAt)) : '';
  const reasonLabel = REASON_LABELS[order.blockerReason] || order.blockerReason;
  const blockedBy = order.blockedBy?.name || 'Staff';

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-rose-200 bg-rose-50/40">
      <div className="shrink-0 w-9 h-9 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700">
        <AlertTriangle className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white px-1.5 py-0.5 rounded">
            {reasonLabel}
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-700">#{refShort}</span>
          <span className="text-[11px] text-slate-600 font-bold truncate">{items[0]?.name}</span>
        </div>
        {order.blockerNote && (
          <p className="text-[11px] text-slate-700 mt-1 leading-snug">"{order.blockerNote}"</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
          <UserIcon className="w-3 h-3" />
          {blockedBy}
          <span className="text-slate-400">·</span>
          <Clock className="w-3 h-3" />
          {ago} ago
        </div>
      </div>
      <button
        onClick={onClear}
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black text-white bg-rose-600 hover:bg-rose-700 transition"
      >
        <RotateCcw className="w-3 h-3" />
        Resolve
      </button>
    </div>
  );
}

// ─── Reject QC Modal ───────────────────────────────────────────────────

function RejectQcModal({ order, onClose, onRejected }: any) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) {
      setError('Tell staff what to fix.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await rejectQc(String(order._id), reason.trim());
      onRejected();
    } catch (err: any) {
      setError(err?.message || 'Reject failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-rose-50">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-600" />
            <h3 className="font-black text-slate-900">Reject QC Photo</h3>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600">
            Reason will be shown to the assigned staff so they know exactly what to fix.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. 'The text is off-center — please re-print with the design centered horizontally.'"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
          {error && <p className="text-xs text-rose-700">{error}</p>}
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 rounded-lg text-xs font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
          >
            {submitting ? 'Rejecting…' : 'Send rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Clear Blocker Modal ───────────────────────────────────────────────

function ClearBlockerModal({ order, team, onClose, onCleared }: any) {
  const [resolution, setResolution] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staff = team.filter((m: any) => m.role === 'production_staff');

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await clearBlocker(String(order._id), {
        resolution: resolution.trim(),
        reassignTo: reassignTo || undefined,
      });
      onCleared();
    } catch (err: any) {
      setError(err?.message || 'Failed to clear');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-emerald-50">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-emerald-600" />
            <h3 className="font-black text-slate-900">Resolve Blocker</h3>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600">
            Order #{String(order._id).slice(-6).toUpperCase()} — {REASON_LABELS[order.blockerReason] || order.blockerReason}
          </p>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">Resolution note (optional)</label>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              rows={2}
              placeholder="e.g. 'Restocked XL black tees. Continue production.'"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
            />
          </div>
          {staff.length > 0 && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">Reassign to (optional)</label>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm bg-white"
              >
                <option value="">Keep current assignee</option>
                {staff.map((m: any) => {
                  const w = m.workload || {};
                  const load = w.total ?? 0;
                  const tier = w.loadTier || 'light';
                  return (
                    <option key={m._id} value={m._id}>
                      {m.name} — {load} active ({tier})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          {error && <p className="text-xs text-rose-700">{error}</p>}
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 rounded-lg text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Resolving…' : 'Mark resolved'}
          </button>
        </div>
      </div>
    </div>
  );
}

function timeAgo(d: Date) {
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
