import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  Flame,
  Zap,
  Clock,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Package,
  User as UserIcon,
} from 'lucide-react';
import {
  getDeliveryCalendar,
  getPriorityQueue,
  getProductionSchedule,
  getProductionQueue,
  bulkScheduleOrders,
} from '../api';
import { formatPeso } from '../utils/format';
import { ScheduleOrderModal } from '../components/production/ScheduleOrderModal';
import { OrderDesignPreview } from '../components/production/OrderDesignPreview';

/**
 * AdminCalendar — production priority view.
 *
 * Two panels:
 *   1. Month calendar with color-coded cells (highest urgency that day)
 *   2. Priority queue list (flat, urgency desc → due date asc)
 *
 * The calendar gives the production team a quick "what's hot this week" view;
 * the queue tells them precisely what to work on next, regardless of date.
 */

const TIER_META: Record<
  string,
  { label: string; color: string; bg: string; ring: string; icon: any; weight: number }
> = {
  priority: { label: 'Priority', color: '#dc2626', bg: 'bg-rose-50', ring: 'ring-rose-200', icon: Flame, weight: 4 },
  rush: { label: 'Rush', color: '#ea580c', bg: 'bg-orange-50', ring: 'ring-orange-200', icon: Zap, weight: 3 },
  express: { label: 'Express', color: '#ca8a04', bg: 'bg-yellow-50', ring: 'ring-yellow-200', icon: Clock, weight: 2 },
  standard: { label: 'Standard', color: '#16a34a', bg: 'bg-emerald-50', ring: 'ring-emerald-200', icon: Package, weight: 1 },
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function AdminCalendar() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [calendar, setCalendar] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ─── Production data layered on top of the delivery calendar ──────────
  // schedule.orders has productionDate + productionDueDate spans we paint
  // across each day cell. pendingOrders are orders waiting to be scheduled
  // — the admin selects them and clicks any cell to drop them onto that day.
  const [schedule, setSchedule] = useState<any>(null);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalOrder, setScheduleModalOrder] = useState<any | null>(null);
  const [bulkScheduling, setBulkScheduling] = useState(false);

  const from = month;
  const to = endOfMonth(month);

  // We need a wider window than just the visible month for production-span
  // queries — orders started in the previous month but finishing this month
  // (or vice versa) need to be included.
  const scheduleFrom = useMemo(() => {
    const d = new Date(from);
    d.setDate(d.getDate() - 14);
    return d;
  }, [from]);
  const scheduleTo = useMemo(() => {
    const d = new Date(to);
    d.setDate(d.getDate() + 14);
    return d;
  }, [to]);

  const reload = () => {
    setLoading(true);
    Promise.all([
      getDeliveryCalendar(from, to),
      getPriorityQueue(),
      getProductionSchedule({ from: ymd(scheduleFrom), to: ymd(scheduleTo) }),
      getProductionQueue(),
    ])
      .then(([cal, q, sched, pq]: any) => {
        setCalendar(cal);
        setQueue(Array.isArray(q) ? q : []);
        setSchedule(sched);
        // Production queue returns both pending and approved-unscheduled.
        // The "pending strip" should show orders that need a date assigned.
        const list = Array.isArray(pq) ? pq : pq?.queue || pq?.orders || [];
        setPendingOrders(
          list.filter(
            (o: any) =>
              !o.productionDate &&
              (o.status === 'pending' || o.status === 'approved'),
          ),
        );
      })
      .catch((err) => console.error('Calendar load error', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getDeliveryCalendar(from, to),
      getPriorityQueue(),
      getProductionSchedule({ from: ymd(scheduleFrom), to: ymd(scheduleTo) }),
      getProductionQueue(),
    ])
      .then(([cal, q, sched, pq]: any) => {
        if (cancelled) return;
        setCalendar(cal);
        setQueue(Array.isArray(q) ? q : []);
        setSchedule(sched);
        const list = Array.isArray(pq) ? pq : pq?.queue || pq?.orders || [];
        setPendingOrders(
          list.filter(
            (o: any) =>
              !o.productionDate &&
              (o.status === 'pending' || o.status === 'approved'),
          ),
        );
      })
      .catch((err) => console.error('Calendar load error', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  /**
   * For a given day, return every scheduled order whose [productionDate,
   * productionDueDate] window overlaps that day, annotated with span
   * metadata (day number, total span length, start/end flags) so the cell
   * can render Start/Due/Day N/M badges.
   */
  const ordersOnDay = (date: Date) => {
    const dayMs = new Date(ymd(date) + 'T00:00:00Z').getTime();
    const all = schedule?.orders || [];
    return all
      .filter((o: any) => {
        if (!o.productionDate) return false;
        const s = new Date(o.productionDate);
        s.setUTCHours(0, 0, 0, 0);
        const dRaw = o.productionDueDate
          ? new Date(o.productionDueDate)
          : new Date(s.getTime() + (Math.max(1, Number(o.estimatedDurationDays) || 1) - 1) * 86400000);
        dRaw.setUTCHours(0, 0, 0, 0);
        return dayMs >= s.getTime() && dayMs <= dRaw.getTime();
      })
      .map((o: any) => {
        const s = new Date(o.productionDate);
        s.setUTCHours(0, 0, 0, 0);
        const dRaw = o.productionDueDate
          ? new Date(o.productionDueDate)
          : new Date(s.getTime() + (Math.max(1, Number(o.estimatedDurationDays) || 1) - 1) * 86400000);
        dRaw.setUTCHours(0, 0, 0, 0);
        const totalDays = Math.round((dRaw.getTime() - s.getTime()) / 86400000) + 1;
        const dayNum = Math.round((dayMs - s.getTime()) / 86400000) + 1;
        return {
          ...o,
          _dayNum: dayNum,
          _totalDays: totalDays,
          _isStart: dayMs === s.getTime(),
          _isEnd: dayMs === dRaw.getTime(),
        };
      });
  };

  /**
   * Drop selected pending orders onto the clicked day. Confirms before
   * scheduling and reloads everything when done.
   */
  const handleDropToDay = async (date: Date) => {
    if (selectedIds.size === 0) return;
    const targetDate = ymd(date);
    if (!window.confirm(`Schedule ${selectedIds.size} order${selectedIds.size === 1 ? '' : 's'} to ${targetDate}?`)) return;
    setBulkScheduling(true);
    try {
      await bulkScheduleOrders({
        orderIds: Array.from(selectedIds),
        productionDate: targetDate,
      });
      setSelectedIds(new Set());
      reload();
    } catch (err: any) {
      window.alert('Schedule failed: ' + (err?.message || 'unknown error'));
    } finally {
      setBulkScheduling(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const daysByKey = useMemo(() => {
    const map = new Map<string, any>();
    if (calendar?.days) {
      for (const d of calendar.days) map.set(d.date, d);
    }
    return map;
  }, [calendar]);

  // Calendar grid: 6 weeks × 7 days. Pad with previous/next month days.
  const grid = useMemo(() => {
    const first = startOfMonth(month);
    const last = endOfMonth(month);
    const leading = first.getDay(); // 0=Sun
    const cells: Array<{ date: Date; inMonth: boolean; data?: any }> = [];
    for (let i = leading - 1; i >= 0; i--) {
      const d = new Date(first);
      d.setDate(first.getDate() - (i + 1));
      cells.push({ date: d, inMonth: false });
    }
    for (let day = 1; day <= last.getDate(); day++) {
      const d = new Date(month.getFullYear(), month.getMonth(), day);
      cells.push({ date: d, inMonth: true, data: daysByKey.get(ymd(d)) });
    }
    while (cells.length % 7 !== 0) {
      const last2 = cells[cells.length - 1].date;
      const d = new Date(last2);
      d.setDate(last2.getDate() + 1);
      cells.push({ date: d, inMonth: false });
    }
    return cells;
  }, [month, daysByKey]);

  const monthLabel = month.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const tierCounts = useMemo(() => {
    const c = { priority: 0, rush: 0, express: 0, standard: 0, total: 0 };
    for (const day of calendar?.days || []) {
      if (!day.counts) continue;
      c.priority += day.counts.priority || 0;
      c.rush += day.counts.rush || 0;
      c.express += day.counts.express || 0;
      c.standard += day.counts.standard || 0;
      c.total += day.counts.total || 0;
    }
    return c;
  }, [calendar]);

  const selectedDayOrders = selectedDay
    ? daysByKey.get(selectedDay)?.orders || []
    : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Hero */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
            Production Calendar
          </h1>
          <p className="text-slate-500 mt-1">
            Orders grouped by requested delivery date, sorted by urgency.
          </p>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {(['priority', 'rush', 'express', 'standard'] as const).map((tier) => {
            const meta = TIER_META[tier];
            const Icon = meta.icon;
            return (
              <div
                key={tier}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    {meta.label}
                  </p>
                </div>
                <p className="text-2xl font-black text-slate-900">
                  {(tierCounts as any)[tier]}
                </p>
                <p className="text-[10px] text-slate-500 font-semibold">
                  this month
                </p>
              </div>
            );
          })}
        </div>

        {/* ─── Pending-orders strip ─────────────────────────────────────
            Lists every order that's waiting for a production date. Admin
            ticks the orders they want to schedule, then clicks any day
            cell below to drop them onto that date in one batch. */}
        {pendingOrders.length > 0 && (
          <div className="mb-4 bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-700" />
                <p className="text-sm font-black text-slate-900">
                  Orders waiting to be scheduled · {pendingOrders.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 ? (
                  <>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                      {selectedIds.size} selected · click any day to schedule
                    </span>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="text-[11px] font-bold text-slate-600 hover:text-slate-900 px-2 py-1"
                    >
                      Clear
                    </button>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-500 font-semibold">
                    Tick orders below to bulk-schedule
                  </span>
                )}
              </div>
            </div>
            <div className="p-3 flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {pendingOrders.map((o: any) => {
                const isSelected = selectedIds.has(o._id);
                const tier = o.urgencyTier || 'standard';
                const meta = TIER_META[tier];
                return (
                  <button
                    key={o._id}
                    onClick={() => toggleSelected(o._id)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-[11px] font-bold transition ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400'
                    }`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="font-mono text-[10px]">#{String(o._id).slice(-6)}</span>
                    <span className="truncate max-w-[140px]">
                      {o.customer?.name || o.customerName || 'Customer'}
                    </span>
                    {o.status === 'pending' && (
                      <span className={`text-[8px] font-black px-1 py-0.5 rounded ${
                        isSelected ? 'bg-white/25' : 'bg-amber-100 text-amber-800'
                      }`}>
                        PENDING
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <button
                onClick={() => {
                  const d = new Date(month);
                  d.setMonth(d.getMonth() - 1);
                  setMonth(startOfMonth(d));
                  setSelectedDay(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-slate-500" />
                <h2 className="font-black text-slate-900 text-base">{monthLabel}</h2>
              </div>
              <button
                onClick={() => {
                  const d = new Date(month);
                  d.setMonth(d.getMonth() + 1);
                  setMonth(startOfMonth(d));
                  setSelectedDay(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
                aria-label="Next month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Color legend — small chips so the cell tints aren't a mystery */}
            <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/50">
              {(['priority', 'rush', 'express', 'standard'] as const).map((tier) => {
                const meta = TIER_META[tier];
                return (
                  <div key={tier} className="inline-flex items-center gap-1.5">
                    <div
                      className="w-3 h-3 rounded-sm"
                      style={{ backgroundColor: meta.color }}
                    />
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Day-of-week row */}
            <div className="grid grid-cols-7 text-center text-[10px] uppercase tracking-wider font-bold text-slate-500 border-b border-slate-100">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7">
              {grid.map((cell, i) => {
                const tier = cell.data?.highestTier;
                const meta = tier ? TIER_META[tier] : null;
                const count = cell.data?.counts?.total || 0;
                const isToday = ymd(cell.date) === ymd(new Date());
                const isSelected = selectedDay === ymd(cell.date);

                // Production-span data: orders whose [productionDate ..
                // productionDueDate] range covers this day. Used to paint
                // the cell with a blue gradient + ribbon and show Start /
                // Due / "Day N/M" badges.
                const productionOrders = cell.inMonth ? ordersOnDay(cell.date) : [];
                const hasProduction = productionOrders.length > 0;

                // Drop-target mode — when the admin has pending orders
                // selected upstairs, every working day becomes a clickable
                // target that schedules the batch onto that date.
                const dropMode = selectedIds.size > 0 && cell.inMonth;

                const cellBg = meta ? `${meta.color}22` : '';
                const cellRing = meta ? `${meta.color}55` : '';
                return (
                  <button
                    key={i}
                    onClick={() => {
                      if (!cell.inMonth) return;
                      if (dropMode) {
                        handleDropToDay(cell.date);
                      } else {
                        setSelectedDay(ymd(cell.date));
                      }
                    }}
                    disabled={!cell.inMonth || bulkScheduling}
                    style={
                      meta && cell.inMonth
                        ? { backgroundColor: cellBg, borderColor: cellRing }
                        : undefined
                    }
                    className={`relative aspect-square p-1.5 border-r border-b border-slate-100 text-left transition-all overflow-hidden ${
                      cell.inMonth
                        ? meta
                          ? 'cursor-pointer hover:brightness-95'
                          : hasProduction
                            ? 'bg-gradient-to-br from-blue-50/70 via-white to-indigo-50/40 cursor-pointer hover:brightness-95'
                            : 'hover:bg-slate-50 cursor-pointer'
                        : 'bg-slate-50/50 text-slate-300'
                    } ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10' : ''} ${
                      dropMode ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-white hover:ring-blue-600 z-10' : ''
                    }`}
                    title={
                      dropMode
                        ? `Schedule ${selectedIds.size} order${selectedIds.size === 1 ? '' : 's'} to ${ymd(cell.date)}`
                        : hasProduction
                          ? `${productionOrders.length} order${productionOrders.length === 1 ? '' : 's'} in production this day`
                          : undefined
                    }
                  >
                    {/* Production ribbon on cells with active production. */}
                    {hasProduction && !meta && cell.inMonth && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
                    )}
                    {/* Strong left-edge stripe in the tier color — visible
                        even when the cell background tint is subtle. */}
                    {meta && cell.inMonth && (
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1.5"
                        style={{ backgroundColor: meta.color }}
                      />
                    )}
                    <div
                      className={`text-xs font-bold ${
                        isToday ? 'text-blue-600' : cell.inMonth ? 'text-slate-700' : 'text-slate-300'
                      } ${meta ? 'pl-1' : ''}`}
                    >
                      {cell.date.getDate()}
                    </div>
                    {count > 0 && meta && (
                      <div
                        className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black text-white shadow-sm"
                        style={{ backgroundColor: meta.color }}
                      >
                        <meta.icon className="w-2.5 h-2.5" />
                        {count}
                      </div>
                    )}
                    {/* Mini tier breakdown dots */}
                    {cell.data?.counts && count > 0 && (
                      <div className="absolute bottom-1 left-1.5 right-1.5 flex gap-0.5">
                        {(['priority', 'rush', 'express', 'standard'] as const).map((t) => {
                          const n = cell.data.counts[t] || 0;
                          if (!n) return null;
                          return (
                            <div
                              key={t}
                              className="h-1 flex-1 rounded-full"
                              style={{ backgroundColor: TIER_META[t].color }}
                              title={`${TIER_META[t].label}: ${n}`}
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Production-span indicator — Start / Due / Day N/M */}
                    {hasProduction && cell.inMonth && (
                      <div className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
                        {productionOrders[0]._isStart && (
                          <span className="text-[7px] font-black bg-blue-600 text-white px-1 py-0.5 rounded uppercase tracking-wider leading-none">
                            Start
                          </span>
                        )}
                        {productionOrders[0]._isEnd && !productionOrders[0]._isStart && (
                          <span className="text-[7px] font-black bg-emerald-600 text-white px-1 py-0.5 rounded uppercase tracking-wider leading-none">
                            Due
                          </span>
                        )}
                        {!productionOrders[0]._isStart && !productionOrders[0]._isEnd && (
                          <span className="text-[7px] font-bold bg-slate-200 text-slate-700 px-1 py-0.5 rounded leading-none">
                            {productionOrders[0]._dayNum}/{productionOrders[0]._totalDays}
                          </span>
                        )}
                        {productionOrders.length > 1 && (
                          <span className="text-[7px] font-bold bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded leading-none">
                            +{productionOrders.length - 1}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority queue */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-600" />
                <h2 className="font-black text-slate-900 text-base">Priority queue</h2>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Sorted by urgency, then due date.
              </p>
            </div>
            <div className="max-h-[600px] overflow-y-auto p-3 space-y-2">
              {loading && queue.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">Loading…</p>
              ) : queue.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8 italic">
                  Production queue is clear 🎉
                </p>
              ) : (
                queue.slice(0, 40).map((o) => {
                  const meta = TIER_META[o.urgencyTier || 'standard'];
                  const Icon = meta.icon;
                  const due = o.requestedDeliveryDate
                    ? new Date(o.requestedDeliveryDate)
                    : null;
                  const isScheduled = !!o.productionDate;
                  return (
                    <div
                      key={o.id || o._id}
                      className="p-2.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        {/* Design preview thumbnail — surfaces customized
                            orders so manager sees what's being made before
                            opening the drawer. */}
                        <OrderDesignPreview order={o} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[10px] uppercase tracking-wider font-black"
                              style={{ color: meta.color }}
                            >
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-[10px] font-bold text-slate-500">
                              #{String(o.id || o._id).slice(-6)}
                            </span>
                            {isScheduled && (
                              <span className="text-[8px] font-black bg-blue-100 text-blue-700 px-1 py-0.5 rounded">SCHEDULED</span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-900 truncate mt-0.5">
                            {o.customerName || o.customer?.name || 'Customer'}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-slate-500 font-semibold">
                              {due
                                ? due.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : 'No date'}
                            </span>
                            <span className="text-[10px] font-bold text-slate-700">
                              {formatPeso(o.totalPrice || 0)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                setScheduleModalOrder(o);
                                setScheduleModalOpen(true);
                              }}
                              className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-black transition ${
                                isScheduled
                                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                              }`}
                            >
                              <CalendarIcon className="w-3 h-3" />
                              {isScheduled ? 'Reschedule' : 'Schedule'}
                            </button>
                            <Link
                              to={`/admin/orders/${o.id || o._id}`}
                              className="inline-flex items-center justify-center px-2 py-1 rounded-md text-[10px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                            >
                              Open
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Selected day orders */}
        {selectedDay && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-black text-slate-900 text-base">
                Orders due {new Date(selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            {selectedDayOrders.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500 italic">
                Nothing scheduled for this day.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {selectedDayOrders.map((o: any) => {
                  const meta = TIER_META[o.urgencyTier || 'standard'];
                  const Icon = meta.icon;
                  return (
                    <Link
                      key={o.id}
                      to={`/admin/orders/${o.id}`}
                      className="block px-4 py-3 hover:bg-slate-50 flex items-center gap-3"
                    >
                      {/* Compact design preview — sparkles badge marks
                          customized orders, placeholder for stock items. */}
                      <OrderDesignPreview order={o} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] uppercase tracking-wider font-black"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            #{String(o.id).slice(-6)}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold uppercase">
                            {o.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                          <UserIcon className="w-3 h-3" />
                          {o.customerName || 'Customer'} · {o.totalQty} item
                          {o.totalQty === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black text-slate-900">
                          {formatPeso(o.totalPrice || 0)}
                        </p>
                        {o.rushFeeAmount > 0 && (
                          <p
                            className="text-[10px] font-bold"
                            style={{ color: meta.color }}
                          >
                            +{formatPeso(o.rushFeeAmount)} rush
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <ScheduleOrderModal
          isOpen={scheduleModalOpen}
          onClose={() => {
            setScheduleModalOpen(false);
            setScheduleModalOrder(null);
          }}
          order={scheduleModalOrder}
          onSuccess={() => {
            reload();
          }}
        />
      </div>
    </div>
  );
}
