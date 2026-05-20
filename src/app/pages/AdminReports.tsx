import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Package,
  Clock,
  Download,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Calendar as CalendarIcon,
  Factory,
  Boxes,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
} from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { apiRequest } from '../api';
import { formatPeso } from '../utils/format';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';

// All data here comes from /api/analytics/* — NO hardcoded numbers.
// The legacy report page had a flat table; this rewrite gives admins the
// same visual depth as the rest of the admin redesign (KPI tiles + charts
// + drill-down tabs).

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#3b82f6',
  in_production: '#8b5cf6',
  ready: '#10b981',
  shipped: '#06b6d4',
  delivered: '#22c55e',
  completed: '#22c55e',
  cancelled: '#64748b',
  rejected: '#ef4444',
  refunded: '#ef4444',
};

export function AdminReports() {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'inventory' | 'operational'>('overview');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [orderAnalytics, setOrderAnalytics] = useState<any>(null);
  const [inventoryAnalytics, setInventoryAnalytics] = useState<any>(null);
  const [operationalAnalytics, setOperationalAnalytics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, ordersRes, inventoryRes, operationalRes] = await Promise.all([
        apiRequest('/analytics/summary'),
        apiRequest(`/analytics/orders?period=${period}`),
        apiRequest('/analytics/inventory'),
        apiRequest('/analytics/operational'),
      ]);
      setSummary(summaryRes);
      setOrderAnalytics(ordersRes);
      setInventoryAnalytics(inventoryRes);
      setOperationalAnalytics(operationalRes);
    } catch (err: any) {
      console.error('Failed to fetch analytics:', err);
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [period]);

  // Build chart-ready data structures from the raw API response. All numbers
  // are pulled from the live aggregations on the backend — no padding, no
  // defaults except for missing-data zeros that the charts handle naturally.

  const dailyChartData = useMemo(() => {
    if (!orderAnalytics?.dailyData) return [];
    return orderAnalytics.dailyData.map((d: any) => ({
      label: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      orders: d.orders || 0,
      revenue: d.revenue || 0,
    }));
  }, [orderAnalytics]);

  const statusChartData = useMemo(() => {
    if (!orderAnalytics?.statusBreakdown) return [];
    return Object.entries(orderAnalytics.statusBreakdown)
      .map(([status, count]: any) => ({
        name: status.replace('_', ' '),
        value: count,
        rawStatus: status,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [orderAnalytics]);

  const categoryChartData = useMemo(() => {
    if (!inventoryAnalytics?.categories) return [];
    return inventoryAnalytics.categories.map((c: any) => ({
      name: c.name,
      stock: c.stock || 0,
      value: c.value || 0,
      count: c.count || 0,
    }));
  }, [inventoryAnalytics]);

  const pipelineChartData = useMemo(() => {
    if (!operationalAnalytics?.productionPipeline) return [];
    return Object.entries(operationalAnalytics.productionPipeline)
      .map(([stage, count]: any) => ({ stage: stage.replace('_', ' '), count }))
      .filter((d) => d.count > 0);
  }, [operationalAnalytics]);

  // CSV export of the order analytics (uses the existing orders export
  // route since the analytics aggregation itself is too small to need its
  // own export — admins can run /orders/export/csv for raw data).
  const handleExport = async () => {
    const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/orders/export/csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    }
  };

  /**
   * PDF export — uses the browser's native print dialog (Ctrl+P) with a
   * heavily-customized `@media print` stylesheet so admins get a clean,
   * paginated document with just the data — no sidebar, no buttons, no
   * gradient hero. Save-as-PDF is one click from the print dialog.
   *
   * Why not jsPDF/html2canvas: that would add ~250KB to the bundle for a
   * feature most users will hit a few times per month. Browser print is
   * free, supports the chart SVGs natively, and produces a higher-quality
   * vector PDF than a rasterized html2canvas screenshot would.
   */
  const handleExportPDF = () => {
    // Give the user a moment to switch to the tab they want (Overview /
    // Orders / Inventory / Operations) — whatever's visible is what gets
    // printed. We set a brief delay so the active-tab content fully renders
    // before the print dialog opens.
    setTimeout(() => window.print(), 50);
  };

  const weeklyDelta = operationalAnalytics?.weeklyComparison?.changePercent || 0;

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
              <Sparkles className="w-3 h-3" /> Analytics
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Reports & Analytics</h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Live business intelligence — every number computed from real orders, inventory, and production data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
              title="Download raw orders data as CSV (for Excel / Google Sheets)"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              onClick={handleExportPDF}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
              title="Save the current report tab as a PDF (Save as PDF in the print dialog)"
            >
              <FileText className="w-4 h-4" /> Export PDF
            </button>
            <button
              onClick={fetchData}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-blue-600 bg-white hover:bg-slate-50 shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 -mt-2 relative z-10">
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            <AlertTriangle className="w-4 h-4 inline-block mr-1" />
            {error}
          </div>
        )}

        {/* KPI tiles — all real data */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiTile
            label="Today's revenue"
            value={summary ? formatPeso(summary.today?.revenue || 0) : '—'}
            hint={summary ? `${summary.today?.orders || 0} orders` : ''}
            icon={DollarSign}
            tint="from-emerald-500 to-teal-500"
            blob="bg-emerald-100"
          />
          <KpiTile
            label="Monthly revenue"
            value={summary ? formatPeso(summary.monthlyRevenue || 0) : '—'}
            icon={TrendingUp}
            tint="from-blue-500 to-indigo-500"
            blob="bg-blue-100"
            delta={weeklyDelta}
          />
          <KpiTile
            label="Pending orders"
            value={summary?.pendingOrders ?? '—'}
            hint="Need action"
            icon={ShoppingCart}
            tint="from-amber-500 to-orange-500"
            blob="bg-amber-100"
          />
          <KpiTile
            label="Low stock"
            value={summary?.lowStockAlert ?? '—'}
            hint={inventoryAnalytics ? `of ${inventoryAnalytics.summary?.totalProducts || 0} SKUs` : ''}
            icon={AlertTriangle}
            tint="from-rose-500 to-orange-500"
            blob="bg-rose-100"
          />
        </div>

        {/* Tab + period switcher */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="inline-flex p-1 rounded-full bg-white border border-slate-200 shadow-sm">
            {([
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'orders', label: 'Orders', icon: ShoppingCart },
              { id: 'inventory', label: 'Inventory', icon: Boxes },
              { id: 'operational', label: 'Operations', icon: Factory },
            ] as const).map((t) => {
              const Icon = t.icon as any;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition ${
                    activeTab === t.id ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>

          {(activeTab === 'orders' || activeTab === 'overview') && (
            <div className="inline-flex p-1 rounded-full bg-white border border-slate-200">
              {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                    period === p ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <Loader />
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <ChartCard
                  title="Revenue trend"
                  subtitle={`${period === 'daily' ? '24-hour' : period === 'weekly' ? 'last 12 weeks' : 'last 12 months'} · live`}
                  icon={TrendingUp}
                >
                  {dailyChartData.length === 0 ? (
                    <EmptyChart label="No revenue data for this period yet" />
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={dailyChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} formatter={(value: any) => [`₱${Number(value).toLocaleString()}`, 'Revenue']} />
                        <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} fill="url(#revGradient)" dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, fill: '#6366f1', strokeWidth: 3, stroke: '#fff' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Order status breakdown" subtitle="Live distribution" icon={ShoppingCart}>
                    {statusChartData.length === 0 ? (
                      <EmptyChart label="No orders yet" />
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={statusChartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                            {statusChartData.map((entry: any, idx: number) => (
                              <Cell key={idx} fill={STATUS_COLORS[entry.rawStatus] || '#94a3b8'} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                          <Legend formatter={(value: string) => <span className="text-xs capitalize">{value}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  <ChartCard title="Top products" subtitle="Most ordered" icon={Package}>
                    {!orderAnalytics?.topProducts || orderAnalytics.topProducts.length === 0 ? (
                      <EmptyChart label="No order data yet" />
                    ) : (
                      <div className="space-y-2 px-1">
                        {orderAnalytics.topProducts.slice(0, 6).map((p: any, i: number) => {
                          const maxCount = orderAnalytics.topProducts[0]?.count || 1;
                          const pct = (p.count / maxCount) * 100;
                          return (
                            <div key={i}>
                              <div className="flex items-center justify-between mb-1 text-xs">
                                <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                                <span className="text-slate-500 font-mono">{p.count}</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ChartCard>
                </div>
              </div>
            )}

            {/* ORDERS TAB */}
            {activeTab === 'orders' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <StatCard label="Total orders" value={orderAnalytics?.summary?.totalOrders || 0} sublabel={`${period} period`} />
                  <StatCard label="Total revenue" value={formatPeso(orderAnalytics?.summary?.totalRevenue || 0)} sublabel="paid only" />
                  <StatCard label="Average order value" value={formatPeso(orderAnalytics?.summary?.averageOrderValue || 0)} sublabel="per order" />
                </div>
                <ChartCard title="Orders vs revenue" subtitle="Per day in current period" icon={BarChart3}>
                  {dailyChartData.length === 0 ? (
                    <EmptyChart label="No orders in this period" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dailyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="orders" fill="#6366f1" radius={[8, 8, 0, 0]} name="Orders" />
                        <Bar yAxisId="right" dataKey="revenue" fill="#10b981" radius={[8, 8, 0, 0]} name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            )}

            {/* INVENTORY TAB */}
            {activeTab === 'inventory' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <StatCard label="SKUs" value={inventoryAnalytics?.summary?.totalProducts || 0} sublabel="active" />
                  <StatCard label="Total stock" value={(inventoryAnalytics?.summary?.totalStock || 0).toLocaleString()} sublabel="units" />
                  <StatCard label="Stock value" value={formatPeso(inventoryAnalytics?.summary?.totalValue || 0)} sublabel="catalog × stock" />
                  <StatCard label="Low / out" value={`${inventoryAnalytics?.summary?.lowStockCount || 0} / ${inventoryAnalytics?.summary?.outOfStockCount || 0}`} sublabel="alerts" />
                </div>
                <ChartCard title="Stock value by category" subtitle="Where your money is" icon={Boxes}>
                  {categoryChartData.length === 0 ? (
                    <EmptyChart label="No inventory data" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={categoryChartData} layout="horizontal">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} formatter={(value: any) => [`₱${Number(value).toLocaleString()}`, 'Value']} />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
                {inventoryAnalytics?.lowStock?.length > 0 && (
                  <ChartCard title="Low-stock items" subtitle={`${inventoryAnalytics.lowStock.length} items need restocking`} icon={AlertTriangle}>
                    <div className="space-y-2">
                      {inventoryAnalytics.lowStock.slice(0, 8).map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-rose-50 border border-rose-100">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                            <p className="text-[11px] text-slate-500">{item.category}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-rose-700">{item.stock} left</p>
                            <p className="text-[10px] text-slate-500">min {item.minStock}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ChartCard>
                )}
              </div>
            )}

            {/* OPERATIONAL TAB */}
            {activeTab === 'operational' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <StatCard
                    label="Avg turnaround"
                    value={`${operationalAnalytics?.turnaroundTime?.averageDays?.toFixed(1) || 0}d`}
                    sublabel={`${operationalAnalytics?.turnaroundTime?.averageHours?.toFixed(1) || 0} hrs avg`}
                  />
                  <StatCard
                    label="This week"
                    value={operationalAnalytics?.weeklyComparison?.thisWeek || 0}
                    sublabel="orders processed"
                    delta={Number(operationalAnalytics?.weeklyComparison?.changePercent || 0)}
                  />
                  <StatCard
                    label="Last week"
                    value={operationalAnalytics?.weeklyComparison?.lastWeek || 0}
                    sublabel="orders processed"
                  />
                </div>

                <ChartCard title="Production pipeline" subtitle="Where every order stands right now" icon={Factory}>
                  {pipelineChartData.length === 0 ? (
                    <EmptyChart label="No orders in production" />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={pipelineChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }} />
                        <Bar dataKey="count" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Print-only stylesheet ───────────────────────────────────────
          When the admin clicks "Export PDF" → window.print() opens. This
          stylesheet ensures the printed output is clean and paginated:
            · Sidebar / nav chrome (.no-print) is hidden
            · Hero gradient becomes a thin header strip (saves toner + ink)
            · Charts/tables get appropriate page breaks
            · Backgrounds are removed (most printers can't render them anyway)
          User just picks "Save as PDF" in the destination dropdown. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }

          /* Reset the dark sidebar + any sticky chrome from AdminLayout. */
          body, html { background: white !important; }

          /* Anything tagged .no-print disappears in the printed copy. */
          .no-print { display: none !important; }

          /* Strip the colorful hero gradient — wastes ink and looks muddy
             on most printers. Keep the title text. */
          .bg-gradient-to-br,
          .bg-gradient-to-r,
          .bg-gradient-to-b {
            background: white !important;
            color: #0f172a !important;
          }

          /* Hide the AdminLayout sidebar entirely. */
          aside { display: none !important; }

          /* Reset main content margin since the sidebar is gone. */
          main { margin-left: 0 !important; padding-top: 0 !important; }

          /* Page breaks: each chart card stays together when possible. */
          .recharts-wrapper { break-inside: avoid; }
          h1, h2, h3, h4 { break-after: avoid; }

          /* Cards lose the heavy shadow on paper. */
          .shadow-sm, .shadow-md, .shadow-lg, .shadow-xl {
            box-shadow: none !important;
          }

          /* Ensure SVG chart text is dark enough for print. */
          .recharts-text { fill: #1f2937 !important; }
          .recharts-cartesian-axis-tick-value { fill: #4b5563 !important; }
        }
      `}</style>
    </div>
  );
}

function Loader() {
  return (
    <div className="p-16 rounded-2xl bg-white border border-slate-200 text-center">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-slate-500 text-sm">Crunching the numbers…</p>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-48 flex items-center justify-center text-sm text-slate-500 italic">
      {label}
    </div>
  );
}

function ChartCard({ title, subtitle, icon: Icon, children }: any) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md flex-shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatCard({ label, value, sublabel, delta }: { label: string; value: any; sublabel?: string; delta?: number }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-2xl font-black text-slate-900 tracking-tight mt-1">{value}</p>
      <div className="flex items-center gap-1 mt-1">
        {sublabel && <p className="text-[11px] text-slate-500">{sublabel}</p>}
        {typeof delta === 'number' && Number.isFinite(delta) && (
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${
            delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-500'
          }`}>
            {delta > 0 ? <ArrowUpRight className="w-3 h-3" /> : delta < 0 ? <ArrowDownRight className="w-3 h-3" /> : null}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function KpiTile({ label, value, hint, icon: Icon, tint, blob, delta }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${blob} opacity-50`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center shadow-lg mb-2.5`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{value}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-xs font-semibold text-slate-700">{label}</p>
          {typeof delta === 'number' && Number.isFinite(delta) && delta !== 0 && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${
              delta > 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {delta > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
              {Math.abs(delta).toFixed(0)}%
            </span>
          )}
        </div>
        {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
