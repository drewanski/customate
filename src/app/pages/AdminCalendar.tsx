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
import { getDeliveryCalendar, getPriorityQueue } from '../api';
import { formatPeso } from '../utils/format';

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

  const from = month;
  const to = endOfMonth(month);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getDeliveryCalendar(from, to), getPriorityQueue()])
      .then(([cal, q]) => {
        if (cancelled) return;
        setCalendar(cal);
        setQueue(Array.isArray(q) ? q : []);
      })
      .catch((err) => console.error('Calendar load error', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

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

                // Fill the whole cell with the highest-urgency color so the
                // calendar reads at a glance. Use a stronger tint than the
                // tiny dots we had before (~30% alpha for fill, full color
                // for the left-edge stripe + badge).
                const cellBg = meta ? `${meta.color}22` : '';
                const cellRing = meta ? `${meta.color}55` : '';
                return (
                  <button
                    key={i}
                    onClick={() => cell.inMonth && setSelectedDay(ymd(cell.date))}
                    disabled={!cell.inMonth}
                    style={
                      meta && cell.inMonth
                        ? { backgroundColor: cellBg, borderColor: cellRing }
                        : undefined
                    }
                    className={`relative aspect-square p-1.5 border-r border-b border-slate-100 text-left transition-all overflow-hidden ${
                      cell.inMonth
                        ? meta
                          ? 'cursor-pointer hover:brightness-95'
                          : 'hover:bg-slate-50 cursor-pointer'
                        : 'bg-slate-50/50 text-slate-300'
                    } ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-10' : ''}`}
                  >
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
                  return (
                    <Link
                      key={o.id}
                      to={`/admin/orders/${o.id}`}
                      className="block p-2.5 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
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
                              #{String(o.id).slice(-6)}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 truncate mt-0.5">
                            {o.customerName || 'Customer'}
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
                        </div>
                      </div>
                    </Link>
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
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
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
      </div>
    </div>
  );
}
