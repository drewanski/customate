import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ListTodo,
  LayoutGrid,
  Layers,
  Settings,
  Flag,
  User as UserIcon,
  Search,
  ChevronRight,
  Package,
  TrendingUp,
  Sparkles,
  Truck,
  RefreshCw,
  ChevronLeft,
} from 'lucide-react';
import {
  getProductionQueue,
  getProductionSchedule,
  getProductionActive,
  getProductionStats,
  advanceProductionStage,
  bulkScheduleOrders,
} from '../api';
import { ScheduleOrderModal } from '../components/production/ScheduleOrderModal';
import { BulkScheduleModal } from '../components/production/BulkScheduleModal';
import { OrderDetailDrawer } from '../components/production/OrderDetailDrawer';
import { CapacitySettingsModal } from '../components/production/CapacitySettingsModal';
import { AIProductionForecast } from '../components/production/AIProductionForecast';
import { AdminQcAndBlockerPanel } from '../components/production/AdminQcAndBlockerPanel';
import { AutoAssignToggle } from '../components/production/AutoAssignToggle';

const STAGES = [
  { id: 'design_review', label: 'Design', tint: 'from-purple-500 to-pink-500', bg: 'bg-purple-50 border-purple-100' },
  { id: 'printing', label: 'Printing', tint: 'from-blue-500 to-indigo-500', bg: 'bg-blue-50 border-blue-100' },
  { id: 'assembly', label: 'Assembly', tint: 'from-cyan-500 to-blue-500', bg: 'bg-cyan-50 border-cyan-100' },
  { id: 'quality_check', label: 'QC', tint: 'from-amber-500 to-orange-500', bg: 'bg-amber-50 border-amber-100' },
  { id: 'packing', label: 'Packing', tint: 'from-emerald-500 to-teal-500', bg: 'bg-emerald-50 border-emerald-100' },
  { id: 'ready', label: 'Ready', tint: 'from-green-500 to-emerald-500', bg: 'bg-green-50 border-green-100' },
];

const PRIORITY_TINTS: Record<string, string> = {
  urgent: 'bg-rose-100 text-rose-700 border-rose-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

function shortDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function weekRangeAround(date: Date) {
  // Returns Sunday→Saturday for the given date in ISO YYYY-MM-DD
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function AdminProduction() {
  const [tab, setTab] = useState<'queue' | 'calendar' | 'pipeline'>('queue');
  const [loading, setLoading] = useState(true);

  // Data
  const [queue, setQueue] = useState<any[]>([]);
  const [scheduleData, setScheduleData] = useState<{ orders: any[]; days: any[] } | null>(null);
  const [activeData, setActiveData] = useState<{ stages: string[]; byStage: Record<string, any[]> } | null>(null);
  const [stats, setStats] = useState<any>(null);

  // View state
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Selection (bulk)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any>(null);

  const week = useMemo(() => weekRangeAround(weekAnchor), [weekAnchor]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [q, sch, act, s] = await Promise.all([
        getProductionQueue(),
        getProductionSchedule(week),
        getProductionActive(),
        getProductionStats(),
      ]);
      setQueue(Array.isArray(q) ? q : []);
      setScheduleData(sch);
      setActiveData(act);
      setStats(s);
    } catch (err) {
      console.error('Failed to load production data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [week.from, week.to]);

  // Filtered queue
  const filteredQueue = useMemo(() => {
    const term = search.trim().toLowerCase();
    return queue.filter((o) => {
      if (priorityFilter !== 'all' && o.productionPriority !== priorityFilter) return false;
      if (!term) return true;
      const ref = String(o._id).slice(-6);
      const name = (o.customer?.name || '').toLowerCase();
      const email = (o.customer?.email || '').toLowerCase();
      return ref.includes(term) || name.includes(term) || email.includes(term);
    });
  }, [queue, search, priorityFilter]);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAll = () => setSelectedIds(new Set(filteredQueue.map((o) => o._id)));
  const selectedOrders = filteredQueue.filter((o) => selectedIds.has(o._id));

  // Detail/edit launchers
  const openDetail = (order: any) => {
    setActiveOrder(order);
    setDetailOpen(true);
  };
  const openSchedule = (order: any) => {
    setActiveOrder(order);
    setScheduleModalOpen(true);
  };

  // Kanban advance
  const handleQuickAdvance = async (orderId: string) => {
    try {
      await advanceProductionStage(orderId, { direction: 'forward' });
      fetchAll();
    } catch (err: any) {
      alert(err.message || 'Failed to advance');
    }
  };

  /**
   * Drop-on-day bulk scheduler. Triggered from the Calendar tab when admin
   * clicks any day cell while one-or-more orders are selected. We confirm
   * before submitting because this can move many orders at once, and the
   * action becomes part of each order's permanent timeline (ProductionLog).
   *
   * Off-days (e.g. Sundays — businessDays config) get a different warning
   * since scheduling production for a non-working day is usually a mistake,
   * not an intentional override.
   */
  const handleScheduleSelectedToDay = async (day: { date: string; isWorking: boolean; capacity: number; units: number; overCapacity: boolean }) => {
    if (selectedIds.size === 0) return;
    const orderCount = selectedIds.size;
    let confirmMsg = `Schedule ${orderCount} order${orderCount === 1 ? '' : 's'} to start production on ${
      new Date(day.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    }?`;
    if (!day.isWorking) {
      confirmMsg = `${day.date} is a non-working day (e.g. Sunday).\n\n${confirmMsg}`;
    } else if (day.overCapacity) {
      confirmMsg = `⚠ This day is already over capacity (${day.units} units booked, ${day.capacity} max).\n\n${confirmMsg}`;
    }
    if (!confirm(confirmMsg)) return;

    try {
      await bulkScheduleOrders({
        orderIds: Array.from(selectedIds),
        productionDate: day.date,
      });
      clearSelection();
      fetchAll();
    } catch (err: any) {
      alert(err.message || 'Failed to schedule orders');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-blue-400/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-purple-400/40 blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-widest mb-3">
              <Sparkles className="w-3 h-3" /> Production
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Production Hub</h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Schedule, dispatch and track every order from artwork to shipment.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCapacityOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
            >
              <Settings className="w-4 h-4" /> Capacity
            </button>
            <button
              onClick={fetchAll}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-blue-600 bg-white hover:bg-slate-50 shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 -mt-2 relative z-10">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <KpiTile label="In queue" value={stats?.queueCount ?? '—'} icon={ListTodo} tint="from-blue-500 to-indigo-500" blob="bg-blue-100" />
          <KpiTile label="In production" value={stats?.activeCount ?? '—'} icon={Layers} tint="from-purple-500 to-pink-500" blob="bg-purple-100" />
          <KpiTile label="Due today" value={stats?.dueToday ?? '—'} icon={Clock} tint="from-amber-500 to-orange-500" blob="bg-amber-100" />
          <KpiTile label="Overdue" value={stats?.overdue ?? '—'} icon={AlertTriangle} tint="from-rose-500 to-orange-500" blob="bg-rose-100" />
          <KpiTile label="Done today" value={stats?.completedToday ?? '—'} icon={CheckCircle2} tint="from-emerald-500 to-teal-500" blob="bg-emerald-100" />
        </div>

        {/* AI forecast — 7-day outlook + bottleneck detection. Rendered above
            the tab switcher so admins see the situation before drilling into
            queue/calendar/pipeline. */}
        <AIProductionForecast refreshKey={stats?.activeCount || 0} />

        {/* QC review + active blockers — the two things the manager needs
            to act on RIGHT NOW. Auto-hides when both queues are empty. */}
        <AdminQcAndBlockerPanel onChange={fetchAll} />

        {/* Auto-assign toggle — frees the manager from picking a staff
            member on every approval. Round-robins to the lowest-load
            production_staff user. */}
        <div className="mb-4 flex items-center justify-end">
          <AutoAssignToggle />
        </div>

        {/* Tab switcher */}
        <div className="mb-6 inline-flex p-1 rounded-full bg-white border border-slate-200 shadow-sm">
          {[
            { id: 'queue', label: 'Queue', icon: ListTodo },
            { id: 'calendar', label: 'Calendar', icon: Calendar },
            { id: 'pipeline', label: 'Pipeline', icon: LayoutGrid },
          ].map((t) => {
            const Icon = t.icon as any;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id as any); clearSelection(); }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                  tab === t.id ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {/* QUEUE TAB */}
        {tab === 'queue' && (
          <div>
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by order #, customer name or email…"
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="inline-flex p-1 rounded-full bg-white border border-slate-200">
                {['all', 'urgent', 'high', 'medium', 'low'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriorityFilter(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                      priorityFilter === p ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {p === 'all' ? 'All' : p}
                  </button>
                ))}
              </div>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="mb-4 p-3 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 text-white flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm">
                  <span className="font-bold">{selectedIds.size}</span> orders selected ·{' '}
                  <span className="text-white/70">
                    {selectedOrders.reduce((s, o) => s + (o.totalQty || 0), 0)} units
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={clearSelection} className="!text-white !border-white/30 hover:!bg-white/10">Clear</Button>
                  <Button size="sm" onClick={() => setBulkOpen(true)}>
                    <Layers className="w-3.5 h-3.5 mr-1" /> Bulk schedule
                  </Button>
                </div>
              </div>
            )}

            {/* Queue list */}
            {loading ? (
              <LoaderCard />
            ) : filteredQueue.length === 0 ? (
              <EmptyCard
                icon={CheckCircle2}
                title="Queue is empty"
                hint={queue.length === 0 ? 'No approved orders waiting for production.' : 'Try a different filter.'}
              />
            ) : (
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={filteredQueue.length > 0 && filteredQueue.every((o) => selectedIds.has(o._id))}
                      onChange={(e) => (e.target.checked ? selectAll() : clearSelection())}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    Select all on page
                  </label>
                  <span className="text-xs text-slate-500">{filteredQueue.length} orders</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {filteredQueue.map((o) => {
                    // Pending = customer just placed it; needs admin attention
                    // to schedule a production date. Approved = already triaged
                    // but no date yet. Visual treatment differs so admins see
                    // at a glance what needs reviewing vs what just needs a
                    // calendar slot.
                    const isPending = o.status === 'pending';
                    // Compute days until customer's requested delivery — if
                    // it's close, surface a warning so admin doesn't sleep
                    // on it. Skip if no delivery date was requested.
                    let dueWarning: string | null = null;
                    if (o.requestedDeliveryDate) {
                      const due = new Date(o.requestedDeliveryDate);
                      const days = Math.ceil((+due - Date.now()) / (24 * 60 * 60 * 1000));
                      if (days < 0) dueWarning = `${Math.abs(days)}d overdue`;
                      else if (days <= 2) dueWarning = `due in ${days}d`;
                    }
                    return (
                      <li key={o._id} className={`px-4 py-3 hover:bg-slate-50/60 transition ${isPending ? 'bg-amber-50/30' : ''}`}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(o._id)}
                            onChange={() => toggleSelect(o._id)}
                            className="w-4 h-4 rounded border-slate-300 flex-shrink-0"
                          />
                          <button onClick={() => openDetail(o)} className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-mono text-[11px] text-slate-500">#{String(o._id).slice(-6)}</span>
                              {/* PENDING badge — most visible signal so admin
                                  knows they're approving by scheduling. */}
                              {isPending && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-sm">
                                  ⏱ Pending Review
                                </span>
                              )}
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${PRIORITY_TINTS[o.productionPriority] || PRIORITY_TINTS.medium}`}>
                                <Flag className="w-2.5 h-2.5 inline-block mr-1 -mt-0.5" />
                                {o.productionPriority}
                              </span>
                              {/* Urgency tier badge if set (Priority/Rush/Express) */}
                              {o.urgencyTier && o.urgencyTier !== 'standard' && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                                  {o.urgencyTier}
                                </span>
                              )}
                              {o.isBulk && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">Bulk</span>
                              )}
                              {dueWarning && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-600 text-white">
                                  ⚠ {dueWarning}
                                </span>
                              )}
                            </div>
                            <p className="font-semibold text-slate-900 truncate">{o.customer?.name || 'Customer'}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {o.totalQty} units · ₱{Number(o.totalPrice || 0).toLocaleString()} · ordered {shortDate(o.createdAt)}
                              {o.requestedDeliveryDate && (
                                <>{' · '}<span className="font-semibold">deliver by {shortDate(o.requestedDeliveryDate)}</span></>
                              )}
                            </p>
                          </button>
                          <Button size="sm" onClick={() => openSchedule(o)}>
                            <Calendar className="w-3.5 h-3.5 mr-1" />
                            {isPending ? 'Approve & Schedule' : 'Schedule'}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* CALENDAR TAB */}
        {tab === 'calendar' && (
          <div>
            {/* Pending-orders strip — anything still waiting to be scheduled
                shows up here above the calendar. Admin can select one or
                more orders, then click any day in the calendar grid below
                to schedule them all to that date in a single action. */}
            {queue.length > 0 && (
              <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <p className="text-xs font-black uppercase tracking-wider text-amber-800">
                      {queue.length} order{queue.length === 1 ? '' : 's'} awaiting a production date
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={selectedIds.size === queue.length ? clearSelection : () => setSelectedIds(new Set(queue.map((o) => o._id)))}
                      className="text-[10px] font-bold text-amber-700 hover:text-amber-900 underline"
                    >
                      {selectedIds.size === queue.length ? 'Clear' : 'Select all'}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {queue.map((o) => {
                    const sel = selectedIds.has(o._id);
                    return (
                      <button
                        key={o._id}
                        onClick={() => toggleSelect(o._id)}
                        className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg border text-left transition ${
                          sel
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            o.productionPriority === 'urgent' ? 'bg-rose-500' :
                            o.productionPriority === 'high' ? 'bg-orange-500' :
                            o.productionPriority === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                          }`} />
                          <span className={`text-[10px] font-mono ${sel ? 'text-white/80' : 'text-slate-500'}`}>
                            #{String(o._id).slice(-6)}
                          </span>
                          {o.status === 'pending' && !sel && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded">
                              PENDING
                            </span>
                          )}
                        </div>
                        <p className={`text-xs font-semibold truncate max-w-[140px] ${sel ? 'text-white' : 'text-slate-900'}`}>
                          {o.customer?.name || 'Customer'}
                        </p>
                        <p className={`text-[10px] ${sel ? 'text-white/70' : 'text-slate-500'}`}>
                          {o.totalQty} units
                        </p>
                      </button>
                    );
                  })}
                </div>
                {selectedIds.size > 0 && (
                  <p className="text-[11px] text-amber-900 mt-2 font-semibold">
                    👇 {selectedIds.size} order{selectedIds.size === 1 ? '' : 's'} selected — click any day below to schedule production
                  </p>
                )}
              </div>
            )}

            {/* Week nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  const next = new Date(weekAnchor);
                  next.setUTCDate(next.getUTCDate() - 7);
                  setWeekAnchor(next);
                }}
                className="w-10 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4 text-slate-700" />
              </button>
              <p className="text-sm font-bold text-slate-900">
                Week of {new Date(week.from).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} — {new Date(week.to).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setWeekAnchor(new Date())}
                  className="px-3 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold"
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    const next = new Date(weekAnchor);
                    next.setUTCDate(next.getUTCDate() + 7);
                    setWeekAnchor(next);
                  }}
                  className="w-10 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center"
                >
                  <ChevronRight className="w-4 h-4 text-slate-700" />
                </button>
              </div>
            </div>

            {loading ? (
              <LoaderCard />
            ) : !scheduleData ? null : (
              <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                {scheduleData.days.map((day) => {
                  // Show every order whose [productionDate … productionDueDate]
                  // window overlaps this day. Annotate each with span position
                  // so the cell can render "Day N of M" + start/middle/end pip.
                  const dayMs = new Date(day.date + 'T00:00:00Z').getTime();
                  const ordersToday = scheduleData.orders
                    .filter((o: any) => {
                      if (!o.productionDate) return false;
                      const start = new Date(o.productionDate);
                      start.setUTCHours(0, 0, 0, 0);
                      const dueRaw = o.productionDueDate
                        ? new Date(o.productionDueDate)
                        : new Date(start.getTime() + (Math.max(1, Number(o.estimatedDurationDays) || 1) - 1) * 86400000);
                      dueRaw.setUTCHours(0, 0, 0, 0);
                      return dayMs >= start.getTime() && dayMs <= dueRaw.getTime();
                    })
                    .map((o: any) => {
                      const start = new Date(o.productionDate);
                      start.setUTCHours(0, 0, 0, 0);
                      const dueRaw = o.productionDueDate
                        ? new Date(o.productionDueDate)
                        : new Date(start.getTime() + (Math.max(1, Number(o.estimatedDurationDays) || 1) - 1) * 86400000);
                      dueRaw.setUTCHours(0, 0, 0, 0);
                      const totalDays = Math.round((dueRaw.getTime() - start.getTime()) / 86400000) + 1;
                      const dayNum = Math.round((dayMs - start.getTime()) / 86400000) + 1;
                      const isStart = dayMs === start.getTime();
                      const isEnd = dayMs === dueRaw.getTime();
                      return { ...o, _dayNum: dayNum, _totalDays: totalDays, _isStart: isStart, _isEnd: isEnd };
                    });
                  const hasActiveProduction = ordersToday.length > 0;
                  const utilPct = day.capacity > 0 ? Math.min(100, Math.round((day.units / day.capacity) * 100)) : 0;
                  const barTint = day.overCapacity
                    ? 'bg-rose-500'
                    : utilPct > 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';
                  // Drop-target mode — when admin has orders selected upstairs,
                  // every day cell becomes a clickable target that schedules
                  // the selected orders to that date. This is the core
                  // "select pending → click date → done" workflow.
                  const dropMode = selectedIds.size > 0;
                  return (
                    <div
                      key={day.date}
                      onClick={dropMode ? () => handleScheduleSelectedToDay(day) : undefined}
                      role={dropMode ? 'button' : undefined}
                      tabIndex={dropMode ? 0 : undefined}
                      onKeyDown={dropMode ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleScheduleSelectedToDay(day);
                        }
                      } : undefined}
                      title={dropMode ? `Click to schedule ${selectedIds.size} order${selectedIds.size === 1 ? '' : 's'} to this day` : undefined}
                      className={`relative rounded-2xl border shadow-sm overflow-hidden transition-all ${
                        !day.isWorking ? 'opacity-60 bg-white' :
                        hasActiveProduction ? 'bg-gradient-to-br from-blue-50/70 via-white to-indigo-50/40' :
                        'bg-white'
                      } ${day.overCapacity ? 'border-rose-300' : hasActiveProduction ? 'border-blue-300' : 'border-slate-200'} ${
                        dropMode
                          ? 'cursor-pointer hover:border-blue-500 hover:shadow-md hover:-translate-y-0.5 ring-2 ring-blue-100'
                          : ''
                      }`}
                    >
                      {hasActiveProduction && (
                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
                      )}
                      <div className="px-3 pt-3 pb-2">
                        <div className="flex items-baseline justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
                          </p>
                          <p className="text-sm font-black text-slate-900">{new Date(day.date).getDate()}</p>
                        </div>
                        <div className="mt-1.5">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="text-slate-500">
                              {day.units}/{day.capacity || '—'} units
                            </span>
                            {day.overCapacity && <span className="text-rose-600 font-bold">OVER</span>}
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full ${barTint} transition-all`}
                              style={{ width: `${utilPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <ul className="border-t border-slate-100 divide-y divide-slate-100">
                        {ordersToday.length === 0 ? (
                          <li className="px-3 py-4 text-[11px] text-slate-400 italic">
                            {day.isWorking ? 'Open' : 'Off-day'}
                          </li>
                        ) : (
                          ordersToday.map((o: any) => (
                            <li key={o._id}>
                              <button
                                onClick={() => openDetail(o)}
                                className={`w-full text-left px-3 py-2 hover:bg-white/80 transition ${
                                  o._isStart ? 'bg-blue-50/60' : o._isEnd ? 'bg-emerald-50/60' : ''
                                }`}
                              >
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    o.productionPriority === 'urgent' ? 'bg-rose-500' :
                                    o.productionPriority === 'high' ? 'bg-orange-500' :
                                    o.productionPriority === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                                  }`} />
                                  <span className="text-[10px] font-mono text-slate-500">#{String(o._id).slice(-6)}</span>
                                  {o._isStart && (
                                    <span className="text-[8px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">Start</span>
                                  )}
                                  {o._isEnd && !o._isStart && (
                                    <span className="text-[8px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">Due</span>
                                  )}
                                  {!o._isStart && !o._isEnd && (
                                    <span className="text-[8px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full">
                                      Day {o._dayNum}/{o._totalDays}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs font-semibold text-slate-900 truncate">{o.customer?.name || '—'}</p>
                                <div className="flex items-center justify-between mt-0.5">
                                  <p className="text-[10px] text-slate-500">{o.totalQty} units</p>
                                  {/* progress bar showing how far this order is through its span */}
                                  <div className="w-12 h-1 rounded-full bg-slate-200 overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600"
                                      style={{ width: `${Math.round((o._dayNum / o._totalDays) * 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PIPELINE (KANBAN) TAB */}
        {tab === 'pipeline' && (
          <div>
            {loading ? (
              <LoaderCard />
            ) : !activeData ? null : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {STAGES.map((stage) => {
                  const orders = activeData.byStage[stage.id] || [];
                  return (
                    <div key={stage.id} className={`rounded-2xl border ${stage.bg} overflow-hidden flex flex-col min-h-[260px]`}>
                      <div className="p-3 border-b border-white/40 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${stage.tint} flex items-center justify-center text-white text-xs font-bold`}>
                            {STAGES.findIndex((s) => s.id === stage.id) + 1}
                          </div>
                          <p className="text-xs font-bold text-slate-900">{stage.label}</p>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{orders.length}</span>
                      </div>
                      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[600px]">
                        {orders.length === 0 ? (
                          <p className="text-[10px] text-slate-400 italic px-2 py-4 text-center">Empty</p>
                        ) : (
                          orders.map((o: any) => (
                            <div key={o._id} className="rounded-xl bg-white border border-slate-200 p-2 shadow-sm hover:shadow-md transition">
                              <button onClick={() => openDetail(o)} className="text-left w-full">
                                <div className="flex items-center gap-1 mb-1 flex-wrap">
                                  <span className="text-[10px] font-mono text-slate-500">#{String(o._id).slice(-6)}</span>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    o.productionPriority === 'urgent' ? 'bg-rose-500' :
                                    o.productionPriority === 'high' ? 'bg-orange-500' :
                                    o.productionPriority === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                                  }`} />
                                </div>
                                <p className="text-xs font-bold text-slate-900 truncate">{o.customer?.name || '—'}</p>
                                <p className="text-[10px] text-slate-500">{o.totalQty} units</p>
                                {o.assignedTo?.name && (
                                  <p className="text-[10px] text-slate-600 mt-1 flex items-center gap-0.5">
                                    <UserIcon className="w-2.5 h-2.5" /> {o.assignedTo.name}
                                  </p>
                                )}
                              </button>
                              {stage.id !== 'ready' && (
                                <button
                                  onClick={() => handleQuickAdvance(o._id)}
                                  className="mt-2 w-full text-[10px] font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 py-1 rounded-md inline-flex items-center justify-center gap-1"
                                >
                                  Advance <ChevronRight className="w-2.5 h-2.5" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <ScheduleOrderModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        order={activeOrder}
        onSuccess={() => { fetchAll(); clearSelection(); }}
      />
      <BulkScheduleModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        selectedOrders={selectedOrders}
        onSuccess={() => { fetchAll(); clearSelection(); }}
      />
      <OrderDetailDrawer
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        order={activeOrder}
        onChanged={fetchAll}
        onEdit={() => { setDetailOpen(false); setScheduleModalOpen(true); }}
      />
      <CapacitySettingsModal
        isOpen={capacityOpen}
        onClose={() => setCapacityOpen(false)}
        onSaved={fetchAll}
      />
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, tint, blob }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${blob} opacity-50`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center shadow-lg mb-2.5`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs font-semibold text-slate-700 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function LoaderCard() {
  return (
    <div className="p-12 rounded-2xl bg-white border border-slate-200 text-center">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-slate-500 text-sm">Loading…</p>
    </div>
  );
}

function EmptyCard({ icon: Icon, title, hint }: any) {
  return (
    <div className="p-12 rounded-2xl bg-white border border-slate-200 text-center">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
        <Icon className="w-7 h-7 text-emerald-500" />
      </div>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{hint}</p>
    </div>
  );
}
