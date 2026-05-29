import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Play,
  Package,
  Image as ImageIcon,
  AlertCircle,
  RefreshCw,
  Download,
  ChevronLeft,
  Camera,
  Upload,
  Flag,
  X,
  AlertTriangle,
  ShieldAlert,
  TimerReset,
} from 'lucide-react';
import { getMyTasks, advanceProductionStage, submitQcPhoto, flagBlocker } from '../api';
import { useAuth } from '../hooks/useAuth';

/**
 * Staff Task Board — kanban view of tasks assigned to the logged-in
 * production_staff user, with QC photo submission and blocker reporting.
 *
 * Columns:
 *   To Do        ← status='approved'      (work has not started)
 *   In Progress  ← status='in_production' (currently being made)
 *   Done         ← status='ready'         (admin already QC-approved)
 *
 * The "Submit for QC" button is the staff equivalent of "Mark Done":
 *   - opens a photo capture modal (camera + file fallback)
 *   - uploads the finished-product photo
 *   - sets qcStatus='pending'
 *   - card stays in In Progress with an "Awaiting QC" badge
 *   - admin reviews → approves → card auto-moves to Done on next refresh
 *
 * The "Flag Issue" button on every active card surfaces production
 * problems back to the manager fast (out of material, machine broken, etc).
 */

interface BoardData {
  columns: string[];
  board: { todo: any[]; in_progress: any[]; done: any[] };
  counts: { todo: number; in_progress: number; done: number; total: number };
}

const COLUMNS: Array<{
  key: keyof BoardData['board'];
  label: string;
  hint: string;
  Icon: any;
  tint: string;
  accent: string;
  bg: string;
}> = [
  { key: 'todo',        label: 'To Do',       hint: 'Approved & assigned — ready to start',
    Icon: Clock,         tint: 'text-slate-700',   accent: 'border-slate-300',  bg: 'bg-slate-50' },
  { key: 'in_progress', label: 'In Progress', hint: 'You are working on these',
    Icon: Play,          tint: 'text-blue-700',    accent: 'border-blue-300',   bg: 'bg-blue-50/60' },
  { key: 'done',        label: 'Done',        hint: 'QC approved by your manager',
    Icon: CheckCircle2,  tint: 'text-emerald-700', accent: 'border-emerald-300',bg: 'bg-emerald-50/60' },
];

const BLOCKER_REASONS: Array<{ value: string; label: string }> = [
  { value: 'material_out_of_stock',   label: 'Material out of stock' },
  { value: 'machine_issue',           label: 'Machine issue / broken' },
  { value: 'design_unclear',          label: 'Design file unclear / corrupted' },
  { value: 'customer_change_requested', label: 'Customer requested change' },
  { value: 'damaged_during_production', label: 'Damaged during production' },
  { value: 'other',                   label: 'Other (describe below)' },
];

export function StaffTaskBoard() {
  const { user } = useAuth();
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // QC photo modal
  const [qcModal, setQcModal] = useState<{ orderId: string; task: any } | null>(null);
  // Blocker modal
  const [blockerModal, setBlockerModal] = useState<{ orderId: string; task: any } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMyTasks();
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh every 30s so staff sees QC approvals without manually reloading
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const advance = async (orderId: string, direction: 'forward' | 'backward') => {
    setBusyId(orderId);
    try {
      await advanceProductionStage(orderId, { direction });
      await load();
    } catch (err: any) {
      alert(err?.message || 'Failed to update task');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-blue-400/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-purple-400/40 blur-3xl pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-widest mb-3">
              <Package className="w-3 h-3" />
              My Production Tasks
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">
              {user?.name ? `Hi ${user.name.split(' ')[0]}` : 'Welcome back'}
            </h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Move tasks across the board as you work. Submit a finished-product photo when each task is done — your manager reviews before shipping.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={load}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-blue-600 bg-white hover:bg-slate-50 shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 -mt-2 relative z-10">
        {/* Counts */}
        {data && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {COLUMNS.map((col) => {
              const Icon = col.Icon;
              return (
                <div
                  key={col.key}
                  className={`relative overflow-hidden rounded-2xl bg-white border ${col.accent} p-4 shadow-sm`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-xl ${col.bg} flex items-center justify-center ${col.tint}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{col.label}</p>
                      <p className="text-2xl font-black text-slate-900 leading-tight">{data.counts[col.key]}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Kanban */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const tasks = data?.board[col.key] || [];
            const Icon = col.Icon;
            return (
              <div key={col.key} className={`rounded-2xl border ${col.accent} ${col.bg} p-3 min-h-[60vh]`}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${col.tint}`} />
                    <h2 className={`font-black text-sm ${col.tint}`}>{col.label}</h2>
                    <span className="text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                      {tasks.length}
                    </span>
                  </div>
                </div>
                <p className="px-1 text-[10px] text-slate-500 font-semibold mb-3">{col.hint}</p>

                <div className="space-y-2.5">
                  {loading && tasks.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500 italic">Loading…</div>
                  ) : tasks.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-400 italic">Nothing here right now.</div>
                  ) : (
                    tasks.map((t: any) => (
                      <TaskCard
                        key={t._id}
                        task={t}
                        column={col.key}
                        busy={busyId === String(t._id)}
                        onAdvance={(dir) => advance(String(t._id), dir)}
                        onSubmitQc={() => setQcModal({ orderId: String(t._id), task: t })}
                        onFlagIssue={() => setBlockerModal({ orderId: String(t._id), task: t })}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-[11px] text-slate-500 text-center">
          Your task board is private — your manager sees all tasks across the team, but you only see the ones assigned to you.
        </p>
      </div>

      {qcModal && (
        <QcPhotoModal
          task={qcModal.task}
          onClose={() => setQcModal(null)}
          onSubmitted={async () => { setQcModal(null); await load(); }}
        />
      )}
      {blockerModal && (
        <FlagIssueModal
          task={blockerModal.task}
          onClose={() => setBlockerModal(null)}
          onFlagged={async () => { setBlockerModal(null); await load(); }}
        />
      )}
    </div>
  );
}

// ─── Task Card ─────────────────────────────────────────────────────────

interface TaskCardProps {
  task: any;
  column: 'todo' | 'in_progress' | 'done';
  busy: boolean;
  onAdvance: (direction: 'forward' | 'backward') => void;
  onSubmitQc: () => void;
  onFlagIssue: () => void;
}

function TaskCard({ task, column, busy, onAdvance, onSubmitQc, onFlagIssue }: TaskCardProps) {
  const items = task.items || [];
  const refShort = String(task._id || '').slice(-6).toUpperCase();
  const priority = task.productionPriority || 'medium';
  const priorityMeta: any = {
    urgent: { color: '#dc2626', label: 'Urgent' },
    high: { color: '#ea580c', label: 'High' },
    medium: { color: '#ca8a04', label: 'Medium' },
    low: { color: '#16a34a', label: 'Low' },
  };
  const pri = priorityMeta[priority] || priorityMeta.medium;
  const dueDate = task.productionDueDate
    ? new Date(task.productionDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  const isBlocked = task.blockerStatus === 'active';
  const isQcPending = task.qcStatus === 'pending';
  const isQcRejected = task.qcStatus === 'rejected';

  // Time elapsed on this task
  let elapsed = task.productionTimeMinutes || 0;
  if (task.productionLastStartedAt) {
    const live = Math.round((Date.now() - new Date(task.productionLastStartedAt).getTime()) / 60000);
    elapsed += Math.max(0, live);
  }
  const elapsedLabel = elapsed > 60
    ? `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`
    : `${elapsed}m`;

  return (
    <div className={`bg-white rounded-xl border ${isBlocked ? 'border-rose-300 ring-2 ring-rose-200' : 'border-slate-200'} shadow-sm overflow-hidden`}>
      {/* Top strip */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
            style={{ backgroundColor: `${pri.color}15`, color: pri.color }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pri.color }} />
            {pri.label}
          </span>
          <span className="text-[10px] font-mono font-bold text-slate-500">#{refShort}</span>
        </div>
        {dueDate && <span className="text-[10px] font-bold text-slate-500">Due {dueDate}</span>}
      </div>

      {/* Status banners */}
      {isBlocked && (
        <div className="px-3 py-1.5 bg-rose-50 border-b border-rose-200 text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" />
          Blocked — your manager is notified
        </div>
      )}
      {isQcPending && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Awaiting QC approval
        </div>
      )}
      {isQcRejected && task.qcRejectionReason && (
        <div className="px-3 py-1.5 bg-rose-50 border-b border-rose-200 text-[11px] font-bold text-rose-700">
          <div className="flex items-center gap-1.5 mb-0.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            QC Rejected — please fix and re-submit
          </div>
          <p className="text-[10px] text-rose-600 font-medium italic">"{task.qcRejectionReason}"</p>
        </div>
      )}

      {/* Items */}
      <div className="p-3 space-y-2.5">
        {items.map((it: any, idx: number) => {
          const preview = it.customization?.previewImage;
          const customText = it.customization?.text;
          return (
            <div key={idx} className="flex gap-2.5">
              {preview ? (
                <a
                  href={preview}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:border-blue-400 hover:shadow-md transition"
                >
                  <img src={preview} alt="Design" className="w-full h-full object-contain" />
                </a>
              ) : (
                <div className="shrink-0 w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                  <ImageIcon className="w-5 h-5" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">{it.name}</p>
                <p className="text-[10px] font-mono text-slate-500 truncate">{it.sku}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.5 rounded">×{it.quantity}</span>
                  {it.customization?.size && (
                    <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.5 rounded">{it.customization.size}</span>
                  )}
                  {it.customization?.color && (
                    <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.5 rounded">{it.customization.color}</span>
                  )}
                  {it.customization?.placement && (
                    <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.5 rounded">{it.customization.placement}</span>
                  )}
                </div>
                {customText && <p className="mt-1 text-[10px] text-slate-600 italic">"{customText}"</p>}
                {preview && (
                  <a
                    href={preview}
                    download={`task-${refShort}-${idx + 1}.png`}
                    className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
                  >
                    <Download className="w-2.5 h-2.5" />
                    Download design
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Production notes */}
      {task.productionNotes && (
        <div className="px-3 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Notes</p>
          <p className="text-[11px] text-slate-700 leading-snug">{task.productionNotes}</p>
        </div>
      )}

      {/* Elapsed time pill (only when in progress) */}
      {column === 'in_progress' && (
        <div className="px-3 pb-2">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <TimerReset className="w-3 h-3" />
            {elapsedLabel} elapsed
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex border-t border-slate-100">
        {column !== 'todo' && !isQcPending && (
          <button
            onClick={() => onAdvance('backward')}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 border-r border-slate-100 transition"
          >
            <ChevronLeft className="w-3 h-3" />
            Back
          </button>
        )}
        {column === 'todo' && (
          <button
            onClick={() => onAdvance('forward')}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {busy ? 'Starting…' : <><Play className="w-3 h-3" /> Start work</>}
          </button>
        )}
        {column === 'in_progress' && !isQcPending && !isBlocked && (
          <>
            <button
              onClick={onSubmitQc}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 border-r border-slate-100 transition"
            >
              <Camera className="w-3 h-3" /> Submit for QC
            </button>
            <button
              onClick={onFlagIssue}
              disabled={busy}
              className="px-3 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition"
              title="Flag a blocker"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {column === 'in_progress' && isQcPending && (
          <div className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold text-amber-700 bg-amber-50">
            <Clock className="w-3 h-3" />
            Waiting for QC approval
          </div>
        )}
        {column === 'in_progress' && isBlocked && (
          <div className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-bold text-rose-700 bg-rose-50">
            <ShieldAlert className="w-3 h-3" />
            Waiting for manager to unblock
          </div>
        )}
        {column === 'done' && (
          <div className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-bold text-emerald-700 bg-emerald-50">
            <CheckCircle2 className="w-3 h-3" />
            Manager-approved
          </div>
        )}
      </div>
    </div>
  );
}

// ─── QC Photo Modal ────────────────────────────────────────────────────

function QcPhotoModal({
  task,
  onClose,
  onSubmitted,
}: {
  task: any;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file?: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Keep under 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || '');
      // Compress slightly to keep under upload limit and to reduce payload
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setPreview(data);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        setPreview(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => setPreview(data);
      img.src = data;
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!preview) {
      setError('Take or upload a photo first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitQcPhoto(String(task._id), preview, note.trim());
      onSubmitted();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-br from-emerald-50 to-blue-50/40">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-600" />
            <h3 className="font-black text-slate-900">Submit Finished-Product Photo</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 leading-snug">
            Take a clear photo of the completed item next to its workorder (or a clean white surface). Your manager reviews this before the order is shipped.
          </p>

          {preview ? (
            <div className="relative rounded-xl overflow-hidden border border-slate-200">
              <img src={preview} alt="Preview" className="w-full max-h-[40vh] object-contain bg-slate-100" />
              <button
                onClick={() => setPreview('')}
                className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-[10px] font-bold text-slate-700 hover:bg-white border border-slate-200"
              >
                Retake
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => cameraRef.current?.click()}
                className="flex flex-col items-center gap-2 p-6 rounded-xl bg-emerald-50 border-2 border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-100 transition"
              >
                <Camera className="w-7 h-7" />
                <span className="text-xs font-black">Use camera</span>
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center gap-2 p-6 rounded-xl bg-blue-50 border-2 border-dashed border-blue-300 text-blue-700 hover:bg-blue-100 transition"
              >
                <Upload className="w-7 h-7" />
                <span className="text-xs font-black">Upload file</span>
              </button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Optional note for manager
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Anything the manager should know? (e.g. substituted material, slight color shift)"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
            />
          </div>

          {error && (
            <div className="flex items-start gap-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
              {error}
            </div>
          )}
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!preview || submitting}
            className="px-5 py-2 rounded-lg text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 shadow-md shadow-emerald-200"
          >
            {submitting ? 'Submitting…' : 'Submit for QC review'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Flag Issue Modal ──────────────────────────────────────────────────

function FlagIssueModal({
  task,
  onClose,
  onFlagged,
}: {
  task: any;
  onClose: () => void;
  onFlagged: () => void;
}) {
  const [reason, setReason] = useState(BLOCKER_REASONS[0].value);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!note.trim() && reason === 'other') {
      setError('Please describe the issue.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await flagBlocker(String(task._id), reason, note.trim());
      onFlagged();
    } catch (err: any) {
      setError(err?.message || 'Failed to flag issue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-gradient-to-br from-rose-50 to-orange-50">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-rose-600" />
            <h3 className="font-black text-slate-900">Flag an Issue</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-600 leading-snug">
            Flagging a task as blocked pauses it and bumps it to <strong>urgent</strong> on your manager's queue. Use this when you can't continue (out of material, machine down, design unclear).
          </p>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold bg-white"
            >
              {BLOCKER_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Details {reason === 'other' && <span className="text-rose-600">(required)</span>}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What exactly is blocking you?"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
            />
          </div>

          {error && (
            <div className="flex items-start gap-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
              {error}
            </div>
          )}
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-5 py-2 rounded-lg text-xs font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 shadow-md shadow-rose-200"
          >
            {submitting ? 'Flagging…' : 'Flag as blocked'}
          </button>
        </div>
      </div>
    </div>
  );
}
