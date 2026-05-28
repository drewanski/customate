import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Play,
  Package,
  Image as ImageIcon,
  AlertCircle,
  RefreshCw,
  Download,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { getMyTasks, advanceProductionStage } from '../api';
import { useAuth } from '../hooks/useAuth';

/**
 * Staff Task Board — kanban view of tasks assigned to the logged-in
 * production_staff user.
 *
 * Columns (mapped from order.status):
 *   To Do        ← status='approved'      (work has not started)
 *   In Progress  ← status='in_production' (currently being made)
 *   Done         ← status='ready'         (awaiting admin sign-off)
 *
 * Cards intentionally hide:
 *   - customer name, email, phone, address
 *   - pricing, payment, refunds
 *   - other staff members' tasks
 * They show only the production information needed to physically make
 * the item: design preview, product type, qty, size, color, placement,
 * text, internal notes.
 *
 * Status moves: forward = "Start" or "Mark Done"; backward = "Move back".
 * Each click hits /api/production/:id/advance which the backend filters
 * to assignedTo === current user, so staff cannot accidentally touch
 * someone else's work.
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
  { key: 'done',        label: 'Done',        hint: 'Awaiting manager sign-off',
    Icon: CheckCircle2,  tint: 'text-emerald-700', accent: 'border-emerald-300',bg: 'bg-emerald-50/60' },
];

export function StaffTaskBoard() {
  const { user } = useAuth();
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
  }, [load]);

  /** Move an order forward or backward through the kanban. */
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
      {/* Hero header */}
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
              These are the orders your manager has assigned to you. Move each card across the board as you work.
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
        {/* Counts strip */}
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
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                        {col.label}
                      </p>
                      <p className="text-2xl font-black text-slate-900 leading-tight">
                        {data.counts[col.key]}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading / error states */}
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
              <div
                key={col.key}
                className={`rounded-2xl border ${col.accent} ${col.bg} p-3 min-h-[60vh]`}
              >
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
                    <div className="text-center py-8 text-xs text-slate-500 italic">
                      Loading tasks…
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="text-center py-12 text-xs text-slate-400 italic">
                      Nothing in this column right now.
                    </div>
                  ) : (
                    tasks.map((t: any) => (
                      <TaskCard
                        key={t._id}
                        task={t}
                        column={col.key}
                        busy={busyId === String(t._id)}
                        onAdvance={(dir) => advance(String(t._id), dir)}
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
    </div>
  );
}

interface TaskCardProps {
  task: any;
  column: 'todo' | 'in_progress' | 'done';
  busy: boolean;
  onAdvance: (direction: 'forward' | 'backward') => void;
}

function TaskCard({ task, column, busy, onAdvance }: TaskCardProps) {
  const items = task.items || [];
  const totalQty = items.reduce((sum: number, it: any) => sum + (it.quantity || 1), 0);
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

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Top strip — priority + ref + due */}
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
        {dueDate && (
          <span className="text-[10px] font-bold text-slate-500">Due {dueDate}</span>
        )}
      </div>

      {/* Items — design preview + specs per line item */}
      <div className="p-3 space-y-2.5">
        {items.map((it: any, idx: number) => {
          const preview = it.customization?.previewImage;
          const customText = it.customization?.text;
          return (
            <div key={idx} className="flex gap-2.5">
              {/* Design thumbnail */}
              {preview ? (
                <a
                  href={preview}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 hover:border-blue-400 hover:shadow-md transition"
                  title="Open design preview"
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
                  <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.5 rounded">
                    ×{it.quantity}
                  </span>
                  {it.customization?.size && (
                    <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.5 rounded">
                      {it.customization.size}
                    </span>
                  )}
                  {it.customization?.color && (
                    <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.5 rounded">
                      {it.customization.color}
                    </span>
                  )}
                  {it.customization?.placement && (
                    <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1 py-0.5 rounded">
                      {it.customization.placement}
                    </span>
                  )}
                </div>
                {customText && (
                  <p className="mt-1 text-[10px] text-slate-600 italic">"{customText}"</p>
                )}
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

      {/* Production notes (internal) */}
      {task.productionNotes && (
        <div className="px-3 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">Notes</p>
          <p className="text-[11px] text-slate-700 leading-snug">{task.productionNotes}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex border-t border-slate-100">
        {column !== 'todo' && (
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
        {column === 'in_progress' && (
          <button
            onClick={() => onAdvance('forward')}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {busy ? 'Saving…' : <><CheckCircle2 className="w-3 h-3" /> Mark Done</>}
          </button>
        )}
        {column === 'done' && (
          <div className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-bold text-emerald-700 bg-emerald-50">
            <CheckCircle2 className="w-3 h-3" />
            Waiting for manager
          </div>
        )}
      </div>
    </div>
  );
}
