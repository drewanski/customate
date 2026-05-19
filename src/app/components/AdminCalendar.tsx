import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Package,
  DollarSign,
  TrendingUp,
  CalendarDays,
  Flag,
  Layers,
  X,
  PlayCircle,
  CheckCircle2,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import {
  getProductionSchedule,
  getProductionCapacity,
  scheduleProductionOrder,
  bulkScheduleOrders,
} from '../api';

// ─── Types ─────────────────────────────────────────────────────────────────
//
// Order shape is intentionally loose because this component receives the
// parent's full order list (whatever shape it has) and ALSO loads its own
// production-schedule data from the API. Accessors below defend against both
// the legacy customerName/Email strings and the new populated customer object.

interface AnyOrder {
  _id?: string;
  id?: string;
  customer?: { name?: string; email?: string } | string;
  customerName?: string;
  customerEmail?: string;
  items?: Array<{ name?: string; quantity?: number; unitPrice?: number }>;
  totalQty?: number;
  totalPrice?: number;
  isBulk?: boolean;
  status?: string;
  paymentStatus?: string;
  productionDate?: string | Date | null;
  productionStage?: string;
  productionPriority?: 'urgent' | 'high' | 'medium' | 'low';
  productionDueDate?: string | Date | null;
  createdAt: string;
}

interface AdminCalendarProps {
  orders: AnyOrder[];
  onChanged?: () => void;
}

// ─── Accessors / helpers ───────────────────────────────────────────────────
const orderId = (o: AnyOrder) => String(o._id || o.id || '');
const orderRef = (o: AnyOrder) => orderId(o).slice(-6);
const customerName = (o: AnyOrder): string =>
  (typeof o.customer === 'object' && o.customer?.name) ||
  o.customerName ||
  'Customer';
const customerEmail = (o: AnyOrder): string =>
  (typeof o.customer === 'object' && o.customer?.email) ||
  o.customerEmail ||
  '';
const dateKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

const PRIORITY_TINTS: Record<string, { dot: string; pill: string }> = {
  urgent: { dot: 'bg-rose-500', pill: 'bg-rose-100 text-rose-700 border-rose-200' },
  high:   { dot: 'bg-orange-500', pill: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { dot: 'bg-amber-500', pill: 'bg-amber-100 text-amber-700 border-amber-200' },
  low:    { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const STAGE_LABEL: Record<string, string> = {
  queued: 'Queued',
  design_review: 'Design',
  printing: 'Printing',
  assembly: 'Assembly',
  quality_check: 'QC',
  packing: 'Packing',
  ready: 'Ready',
};
const STAGE_TINT: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700',
  design_review: 'bg-purple-100 text-purple-700',
  printing: 'bg-blue-100 text-blue-700',
  assembly: 'bg-cyan-100 text-cyan-700',
  quality_check: 'bg-amber-100 text-amber-700',
  packing: 'bg-emerald-100 text-emerald-700',
  ready: 'bg-green-100 text-green-700',
};

function utilTint(util: number) {
  if (util >= 1) return 'bg-rose-500';
  if (util > 0.8) return 'bg-amber-500';
  if (util > 0.5) return 'bg-blue-500';
  return 'bg-emerald-500';
}

// ─── Component ─────────────────────────────────────────────────────────────

export function AdminCalendar({ orders, onChanged }: AdminCalendarProps) {
  // View state
  const [anchor, setAnchor] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  // Capacity & schedule (from the new production API)
  const [scheduleDays, setScheduleDays] = useState<any[]>([]);
  const [scheduledOrders, setScheduledOrders] = useState<AnyOrder[]>([]);
  const [defaultCapacity, setDefaultCapacity] = useState<number>(100);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [loading, setLoading] = useState(false);

  // Day-detail modal
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [activeDay, setActiveDay] = useState<Date | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionPending, setActionPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null);

  // ─── Visible date range (month or week) ──────────────────────────────────
  const range = useMemo(() => {
    if (viewMode === 'week') {
      const start = new Date(anchor);
      start.setUTCDate(start.getUTCDate() - start.getUTCDay());
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { start, end };
    }
    // Month view — include leading/trailing days for full grid
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    const start = new Date(monthStart);
    start.setUTCDate(start.getUTCDate() - monthStart.getUTCDay()); // back to Sunday
    const end = new Date(monthEnd);
    end.setUTCDate(end.getUTCDate() + (6 - monthEnd.getUTCDay())); // forward to Saturday
    return { start, end };
  }, [anchor, viewMode]);

  // ─── Load production data for the visible range ──────────────────────────
  const refresh = async () => {
    setLoading(true);
    try {
      const [sch, cap] = await Promise.all([
        getProductionSchedule({
          from: dateKey(range.start),
          to: dateKey(range.end),
        }),
        getProductionCapacity().catch(() => null),
      ]);
      setScheduleDays(Array.isArray(sch?.days) ? sch.days : []);
      setScheduledOrders(Array.isArray(sch?.orders) ? sch.orders : []);
      if (cap) {
        setDefaultCapacity(cap.defaultDailyCapacity);
        setWorkingDays(cap.workingDays || [1, 2, 3, 4, 5, 6]);
      }
    } catch (err) {
      console.error('Calendar refresh error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.toISOString(), range.end.toISOString()]);

  // ─── Group orders by date received (createdAt) ───────────────────────────
  const ordersByCreatedDay = useMemo(() => {
    const m: Record<string, AnyOrder[]> = {};
    for (const o of orders) {
      const k = dateKey(o.createdAt);
      if (!m[k]) m[k] = [];
      m[k].push(o);
    }
    return m;
  }, [orders]);

  // Scheduled orders by their productionDate
  const scheduledByDay = useMemo(() => {
    const m: Record<string, AnyOrder[]> = {};
    for (const o of scheduledOrders) {
      if (!o.productionDate) continue;
      const k = dateKey(o.productionDate);
      if (!m[k]) m[k] = [];
      m[k].push(o);
    }
    return m;
  }, [scheduledOrders]);

  // Capacity lookup by date
  const capacityByDay = useMemo(() => {
    return Object.fromEntries(scheduleDays.map((d) => [d.date, d]));
  }, [scheduleDays]);

  // ─── Header stats ────────────────────────────────────────────────────────
  const todayKey = dateKey(new Date());
  const stats = useMemo(() => {
    const todays = ordersByCreatedDay[todayKey] || [];
    const totalToday = todays.length;
    const valueToday = todays.reduce((s, o) => s + Number(o.totalPrice || 0), 0);
    const highPriToday = todays.filter((o) =>
      ['urgent', 'high'].includes(o.productionPriority || '')
    ).length;
    const scheduledThisRange = scheduledOrders.length;
    const unitsScheduled = scheduledOrders.reduce(
      (s, o) => s + Number(o.totalQty || 0),
      0
    );
    const capacityThisRange = scheduleDays.reduce(
      (s, d) => s + (d.capacity || 0),
      0
    );
    const utilPct = capacityThisRange > 0
      ? Math.round((unitsScheduled / capacityThisRange) * 100)
      : 0;
    return {
      totalToday,
      valueToday,
      highPriToday,
      scheduledThisRange,
      unitsScheduled,
      utilPct,
    };
  }, [ordersByCreatedDay, todayKey, scheduledOrders, scheduleDays]);

  // ─── Pending-schedule shortlist for the right rail ───────────────────────
  // Approved orders that haven't been given a production date yet, sorted by
  // priority then creation date.
  const pendingShortlist = useMemo(() => {
    const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return [...orders]
      .filter((o) => o.status === 'approved' && !o.productionDate)
      .sort((a, b) => {
        const ra = PRIORITY_RANK[a.productionPriority || 'medium'] ?? 9;
        const rb = PRIORITY_RANK[b.productionPriority || 'medium'] ?? 9;
        if (ra !== rb) return ra - rb;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .slice(0, 6);
  }, [orders]);

  // ─── Generate the grid cells ─────────────────────────────────────────────
  const gridDays = useMemo(() => {
    const days: Date[] = [];
    const cur = new Date(range.start);
    while (cur <= range.end) {
      days.push(new Date(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }, [range.start, range.end]);

  // ─── Day modal helpers ───────────────────────────────────────────────────
  const openDay = (d: Date) => {
    setActiveDay(d);
    setSelectedIds(new Set());
    setFeedback(null);
    setDayModalOpen(true);
  };

  const dayInfo = useMemo(() => {
    if (!activeDay) return null;
    const k = dateKey(activeDay);
    const createdHere = ordersByCreatedDay[k] || [];
    const scheduledHere = scheduledByDay[k] || [];
    const capRow = capacityByDay[k];
    return {
      key: k,
      createdHere,
      scheduledHere,
      capacity: capRow?.capacity ?? defaultCapacity,
      units: capRow?.units ?? scheduledHere.reduce((s, o) => s + (o.totalQty || 0), 0),
      isWorking: capRow?.isWorking ?? workingDays.includes(activeDay.getUTCDay()),
      overCapacity: capRow?.overCapacity ?? false,
    };
  }, [activeDay, ordersByCreatedDay, scheduledByDay, capacityByDay, defaultCapacity, workingDays]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Pending-schedule orders that could be assigned to this day (any
  // approved order without a production date)
  const candidatesForDay = useMemo(() => {
    if (!activeDay) return [];
    return orders.filter(
      (o) => o.status === 'approved' && !o.productionDate
    );
  }, [orders, activeDay]);

  // ─── Mutations ──────────────────────────────────────────────────────────
  const handleScheduleOne = async (order: AnyOrder, dateStr: string) => {
    setActionPending(true);
    setFeedback(null);
    try {
      await scheduleProductionOrder(orderId(order), {
        productionDate: dateStr,
        productionPriority: order.productionPriority || 'medium',
      });
      setFeedback({ kind: 'success', msg: `#${orderRef(order)} scheduled for ${new Date(dateStr).toLocaleDateString()}` });
      await refresh();
      onChanged?.();
    } catch (err: any) {
      setFeedback({ kind: 'error', msg: err.message || 'Failed to schedule' });
    } finally {
      setActionPending(false);
    }
  };

  const handleBulkSchedule = async () => {
    if (!activeDay || selectedIds.size === 0) return;
    setActionPending(true);
    setFeedback(null);
    try {
      const result = await bulkScheduleOrders({
        orderIds: Array.from(selectedIds),
        productionDate: dateKey(activeDay),
      });
      setFeedback({
        kind: 'success',
        msg: `Scheduled ${result.scheduledCount} of ${selectedIds.size} orders for ${activeDay.toLocaleDateString()}`,
      });
      setSelectedIds(new Set());
      await refresh();
      onChanged?.();
    } catch (err: any) {
      setFeedback({ kind: 'error', msg: err.message || 'Bulk schedule failed' });
    } finally {
      setActionPending(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const monthLabel = anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekLabel = `Week of ${range.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${range.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <div className="p-5 space-y-5">
      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Today's orders" value={stats.totalToday} icon={Package} tint="from-blue-500 to-indigo-500" blob="bg-blue-100" />
        <StatTile label="Today's value" value={`₱${stats.valueToday.toLocaleString()}`} icon={DollarSign} tint="from-emerald-500 to-teal-500" blob="bg-emerald-100" />
        <StatTile label="High priority today" value={stats.highPriToday} icon={Flag} tint="from-rose-500 to-orange-500" blob="bg-rose-100" />
        <StatTile
          label={viewMode === 'month' ? 'Capacity used (mo.)' : 'Capacity used (wk.)'}
          value={`${stats.utilPct}%`}
          hint={`${stats.unitsScheduled.toLocaleString()} units scheduled`}
          icon={TrendingUp}
          tint="from-purple-500 to-pink-500"
          blob="bg-purple-100"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = new Date(anchor);
              if (viewMode === 'week') next.setUTCDate(next.getUTCDate() - 7);
              else next.setMonth(next.getMonth() - 1);
              setAnchor(next);
            }}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4 text-slate-700" />
          </button>
          <p className="font-bold text-slate-900 min-w-[180px] text-center">
            {viewMode === 'week' ? weekLabel : monthLabel}
          </p>
          <button
            onClick={() => {
              const next = new Date(anchor);
              if (viewMode === 'week') next.setUTCDate(next.getUTCDate() + 7);
              else next.setMonth(next.getMonth() + 1);
              setAnchor(next);
            }}
            className="w-10 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4 text-slate-700" />
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="px-3 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold"
          >
            Today
          </button>
        </div>

        <div className="inline-flex p-1 rounded-full bg-white border border-slate-200 self-start md:self-auto">
          {(['month', 'week'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                viewMode === m
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Main grid + side rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        {/* Calendar */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {/* Weekday header */}
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className={`grid grid-cols-7 ${viewMode === 'week' ? '' : ''}`}>
            {gridDays.map((d, idx) => {
              const k = dateKey(d);
              const cap = capacityByDay[k];
              const ordersHere = ordersByCreatedDay[k] || [];
              const schedHere = scheduledByDay[k] || [];
              const isToday = k === todayKey;
              const inMonth = viewMode === 'week' || d.getMonth() === anchor.getMonth();
              const isWorking = cap?.isWorking ?? workingDays.includes(d.getUTCDay());
              const capacity = cap?.capacity ?? (isWorking ? defaultCapacity : 0);
              const units = cap?.units ?? schedHere.reduce((s, o) => s + (o.totalQty || 0), 0);
              const util = capacity > 0 ? units / capacity : 0;
              const overCap = cap?.overCapacity ?? (capacity > 0 && units > capacity);
              const hasHighPri = ordersHere.some((o) => ['urgent', 'high'].includes(o.productionPriority || ''));

              return (
                <button
                  key={idx}
                  onClick={() => openDay(d)}
                  className={`text-left p-2 border-r border-b border-slate-100 transition relative ${
                    viewMode === 'week' ? 'min-h-[160px]' : 'min-h-[110px]'
                  } ${
                    !inMonth ? 'bg-slate-50/40 text-slate-400' : ''
                  } ${
                    !isWorking ? 'bg-slate-50' : 'bg-white'
                  } ${
                    overCap ? 'ring-1 ring-rose-300 ring-inset' : ''
                  } hover:bg-blue-50/40`}
                >
                  {/* Day number + today indicator */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        isToday
                          ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow'
                          : inMonth ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <div className="flex items-center gap-1">
                      {hasHighPri && (
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="High priority received" />
                      )}
                      {overCap && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                          Over
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mini chip stack */}
                  <div className="space-y-1">
                    {ordersHere.length > 0 && (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-semibold text-slate-700">
                        <Package className="w-2.5 h-2.5" />
                        {ordersHere.length} ord
                      </div>
                    )}
                    {schedHere.length > 0 && (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-100 text-[10px] font-semibold text-blue-700">
                        <PlayCircle className="w-2.5 h-2.5" />
                        {schedHere.length} prod · {units}u
                      </div>
                    )}
                  </div>

                  {/* Capacity bar */}
                  {isWorking && capacity > 0 && (
                    <div className="absolute bottom-1 left-2 right-2">
                      <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full transition-all ${utilTint(util)}`}
                          style={{ width: `${Math.min(100, util * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Loading bar */}
          {loading && (
            <div className="h-0.5 bg-blue-100 overflow-hidden">
              <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse" />
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 px-3 py-2 border-t border-slate-100 text-[10px] text-slate-500 bg-slate-50">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Healthy</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> &gt;80% load</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> At/over capacity</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Today</span>
          </div>
        </div>

        {/* Side rail — pending schedule shortlist */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Awaiting schedule</p>
              <p className="text-[11px] text-slate-500">{pendingShortlist.length} approved · oldest first</p>
            </div>
          </div>

          {pendingShortlist.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="text-sm font-semibold text-slate-900">All caught up</p>
              <p className="text-xs text-slate-500">No approved orders need scheduling.</p>
            </div>
          ) : (
            <ul className="space-y-1.5 overflow-y-auto max-h-[420px] -mr-2 pr-2">
              {pendingShortlist.map((o) => {
                const pri = (o.productionPriority || 'medium') as keyof typeof PRIORITY_TINTS;
                const tint = PRIORITY_TINTS[pri] || PRIORITY_TINTS.medium;
                return (
                  <li
                    key={orderId(o)}
                    className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-mono text-slate-500">#{orderRef(o)}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${tint.pill}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${tint.dot}`} />
                        {pri}
                      </span>
                      {o.isBulk && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          Bulk
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-900 truncate">{customerName(o)}</p>
                    <p className="text-[11px] text-slate-500 truncate">{o.totalQty} units · ₱{Number(o.totalPrice || 0).toLocaleString()}</p>
                    <button
                      onClick={() => handleScheduleOne(o, dateKey(new Date()))}
                      disabled={actionPending}
                      className="mt-1.5 w-full inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 disabled:opacity-50 transition"
                    >
                      <CalendarDays className="w-3 h-3" />
                      Schedule today
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      {/* DAY MODAL */}
      {dayModalOpen && activeDay && dayInfo && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDayModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="relative px-6 py-5 border-b border-slate-100 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/70">
                    {activeDay.toLocaleDateString(undefined, { weekday: 'long' })}
                    {dayInfo.key === todayKey && <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20">Today</span>}
                    {!dayInfo.isWorking && <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20">Off-day</span>}
                  </p>
                  <h2 className="text-2xl font-black mt-1">
                    {activeDay.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </h2>
                </div>
                <button
                  onClick={() => setDayModalOpen(false)}
                  className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Day capacity meter */}
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/70 font-bold">Units</p>
                  <p className="text-lg font-black">{dayInfo.units}/{dayInfo.capacity || '∞'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/70 font-bold">Orders received</p>
                  <p className="text-lg font-black">{dayInfo.createdHere.length}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-white/70 font-bold">In production</p>
                  <p className="text-lg font-black">{dayInfo.scheduledHere.length}</p>
                </div>
              </div>
              {dayInfo.capacity > 0 && (
                <div className="mt-3 h-1.5 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className={`h-full transition-all ${dayInfo.overCapacity ? 'bg-rose-400' : 'bg-emerald-300'}`}
                    style={{ width: `${Math.min(100, (dayInfo.units / Math.max(1, dayInfo.capacity)) * 100)}%` }}
                  />
                </div>
              )}
              {dayInfo.overCapacity && (
                <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-rose-100">
                  <AlertTriangle className="w-3.5 h-3.5" /> Day is over capacity — move some orders to another day.
                </div>
              )}
            </div>

            {/* Feedback strip */}
            {feedback && (
              <div className={`px-6 py-2 text-xs font-semibold ${
                feedback.kind === 'success' ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-100' : 'bg-rose-50 text-rose-700 border-b border-rose-100'
              }`}>
                {feedback.kind === 'success' ? '✓ ' : '⚠ '}
                {feedback.msg}
              </div>
            )}

            {/* Two-column body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: orders received this day */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Orders received</h3>
                    <p className="text-[11px] text-slate-500">Placed on this date</p>
                  </div>
                </div>

                {dayInfo.createdHere.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-6 text-center">No orders received this day.</p>
                ) : (
                  <ul className="space-y-2">
                    {dayInfo.createdHere.map((o) => {
                      const pri = (o.productionPriority || 'medium') as keyof typeof PRIORITY_TINTS;
                      const tint = PRIORITY_TINTS[pri] || PRIORITY_TINTS.medium;
                      const alreadyScheduled = !!o.productionDate;
                      return (
                        <li key={orderId(o)} className="p-3 rounded-xl border border-slate-200 bg-white hover:shadow-sm transition">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] font-mono text-slate-500">#{orderRef(o)}</span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${tint.pill}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${tint.dot}`} />
                              {pri}
                            </span>
                            {o.isBulk && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">Bulk</span>}
                            {alreadyScheduled && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">Scheduled</span>}
                          </div>
                          <p className="font-semibold text-slate-900 text-sm truncate">{customerName(o)}</p>
                          <p className="text-xs text-slate-500 truncate">{customerEmail(o)}</p>
                          <p className="text-[11px] text-slate-600 mt-1">
                            {o.totalQty} units · ₱{Number(o.totalPrice || 0).toLocaleString()}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              {/* Right: scheduled production for this day */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Production scheduled</h3>
                    <p className="text-[11px] text-slate-500">Starting on this date</p>
                  </div>
                </div>

                {dayInfo.scheduledHere.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-4 text-center">No production scheduled for this day yet.</p>
                ) : (
                  <ul className="space-y-2 mb-4">
                    {dayInfo.scheduledHere.map((o) => {
                      const stage = (o.productionStage as keyof typeof STAGE_LABEL) || 'queued';
                      return (
                        <li key={orderId(o)} className="p-3 rounded-xl border border-blue-100 bg-blue-50/60">
                          <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-mono text-slate-500">#{orderRef(o)}</span>
                              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${STAGE_TINT[stage] || STAGE_TINT.queued}`}>
                                {STAGE_LABEL[stage] || 'Queued'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 font-semibold">{o.totalQty} units</p>
                          </div>
                          <p className="font-semibold text-slate-900 text-sm truncate">{customerName(o)}</p>
                          {o.productionDueDate && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Due {new Date(o.productionDueDate).toLocaleDateString()}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Bulk add section */}
                {candidatesForDay.length > 0 && (
                  <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/30 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-900 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-blue-600" />
                        Add to this day
                      </p>
                      {selectedIds.size > 0 && (
                        <button
                          onClick={handleBulkSchedule}
                          disabled={actionPending}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 disabled:opacity-50 transition shadow"
                        >
                          {actionPending ? 'Scheduling…' : `Schedule ${selectedIds.size} order${selectedIds.size === 1 ? '' : 's'}`}
                          <ArrowUpRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <ul className="space-y-1 max-h-44 overflow-y-auto">
                      {candidatesForDay.map((o) => {
                        const checked = selectedIds.has(orderId(o));
                        const pri = (o.productionPriority || 'medium') as keyof typeof PRIORITY_TINTS;
                        const tint = PRIORITY_TINTS[pri] || PRIORITY_TINTS.medium;
                        return (
                          <li key={orderId(o)}>
                            <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-white cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelect(orderId(o))}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 flex-shrink-0"
                              />
                              <span className={`w-1.5 h-1.5 rounded-full ${tint.dot} flex-shrink-0`} />
                              <span className="text-[10px] font-mono text-slate-500">#{orderRef(o)}</span>
                              <span className="text-xs font-semibold text-slate-900 truncate flex-1">{customerName(o)}</span>
                              <span className="text-[11px] text-slate-500 flex-shrink-0">{o.totalQty}u</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small subcomponents ───────────────────────────────────────────────────

function StatTile({ label, value, hint, icon: Icon, tint, blob }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-4">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${blob} opacity-50`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center shadow-md mb-2`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs font-semibold text-slate-700">{label}</p>
        {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
