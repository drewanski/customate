import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import {
  Search,
  Eye,
  ShoppingCart,
  DollarSign,
  Clock,
  AlertCircle,
  RotateCcw,
  Download,
  CheckCircle2,
  XCircle,
  Layers,
  Sparkles,
  ChevronRight,
  CreditCard,
  Filter,
} from 'lucide-react';
import { apiRequest, getOrderStats, bulkUpdateOrderStatus, downloadOrderCsv } from '../api';
import { formatPeso } from '../utils/format';
import { OrderDetailDrawer } from '../components/orders/OrderDetailDrawer';
import { PrintablePage, ExportPdfButton } from '../components/admin/PrintablePage';

const STATUS_TINT: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-blue-100 text-blue-700 border-blue-200',
  in_production: 'bg-purple-100 text-purple-700 border-purple-200',
  ready: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  shipped: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  delivered: 'bg-green-100 text-green-700 border-green-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  rejected: 'bg-rose-100 text-rose-700 border-rose-200',
  refunded: 'bg-rose-100 text-rose-700 border-rose-200',
};
const PAYMENT_TINT: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  awaiting_payment: 'bg-amber-100 text-amber-700',
  partial: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
};

const STATUS_OPTIONS = [
  'all', 'pending', 'approved', 'in_production', 'ready', 'completed', 'shipped', 'delivered', 'cancelled', 'rejected', 'refunded',
];

function shortDate(iso?: string | Date | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function AdminOrders() {
  // Data
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showBulkOnly, setShowBulkOnly] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk action state
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState<string | null>(null); // 'approved', 'cancelled', etc

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);

  // Export
  const [exporting, setExporting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      const qs = params.toString();
      const [ordersData, statsData] = await Promise.all([
        apiRequest(qs ? `/orders?${qs}` : '/orders'),
        getOrderStats().catch(() => null),
      ]);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);
  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => fetchAll(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [statusFilter, paymentFilter, searchTerm, showBulkOnly]);

  // Client-side derived filter (payment + bulk-only chips)
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (paymentFilter !== 'all' && o.paymentStatus !== paymentFilter) return false;
      if (showBulkOnly && !o.isBulk) return false;
      return true;
    });
  }, [orders, paymentFilter, showBulkOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectAllOnPage = () => setSelectedIds(new Set(paginatedOrders.map((o) => o.id)));

  const selectedOrders = filteredOrders.filter((o) => selectedIds.has(o.id));

  const handleBulkStatus = async (status: string) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkUpdateOrderStatus(Array.from(selectedIds), status);
      clearSelection();
      await fetchAll();
      alert(`Updated ${result.updated} of ${result.results.length} orders (${result.skipped} unchanged, ${result.failed} failed)`);
    } catch (err: any) {
      alert(err.message || 'Bulk update failed');
    } finally {
      setBulkBusy(false);
      setShowBulkConfirm(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadOrderCsv({ status: statusFilter === 'all' ? undefined : statusFilter });
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));

  return (
    <PrintablePage title="CustoMate — Orders Report" subtitle="All orders, statuses, payment, and totals">
    <div className="min-h-screen bg-slate-50">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white no-print">
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
              <Sparkles className="w-3 h-3" /> Orders
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Order Management</h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Review, approve, refund and ship every order with full audit history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={fetchAll}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-blue-600 bg-white hover:bg-slate-50 shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 -mt-2 relative z-10">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <KpiTile label="Today's orders" value={stats?.todayCount ?? '—'} icon={ShoppingCart} tint="from-blue-500 to-indigo-500" blob="bg-blue-100" />
          <KpiTile label="Today's revenue" value={stats ? formatPeso(stats.todayRevenue) : '—'} icon={DollarSign} tint="from-emerald-500 to-teal-500" blob="bg-emerald-100" />
          <KpiTile label="Pending action" value={stats?.pendingCount ?? '—'} icon={Clock} tint="from-amber-500 to-orange-500" blob="bg-amber-100" />
          <KpiTile label="Awaiting payment" value={stats?.awaitingPaymentCount ?? '—'} icon={CreditCard} tint="from-rose-500 to-orange-500" blob="bg-rose-100" />
          <KpiTile
            label="Refunded 7d"
            value={stats ? formatPeso(stats.refunded7d?.amount || 0) : '—'}
            hint={stats ? `${stats.refunded7d?.count || 0} orders` : ''}
            icon={RotateCcw}
            tint="from-purple-500 to-pink-500"
            blob="bg-purple-100"
          />
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by order ID, customer name or email…"
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowBulkOnly((v) => !v)}
              className={`inline-flex items-center gap-2 px-4 h-11 rounded-xl text-sm font-semibold transition border ${
                showBulkOnly
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-4 h-4" /> Bulk orders only
            </button>
          </div>

          {/* Status chips */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap transition ${
                  statusFilter === s
                    ? 'bg-slate-900 text-white shadow'
                    : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-200'
                }`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Payment chips */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Payment:
            </span>
            <div className="flex gap-1">
              {['all', 'paid', 'awaiting_payment', 'partial', 'pending', 'failed'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPaymentFilter(p)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold capitalize transition ${
                    paymentFilter === p ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:text-slate-700 border border-slate-200'
                  }`}
                >
                  {p === 'all' ? 'Any' : p.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="mb-4 p-3 rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 text-white flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              <span className="font-bold">{selectedIds.size}</span> orders selected ·{' '}
              <span className="text-white/70">
                {selectedOrders.reduce((s, o) => s + Number(o.totalPrice || 0), 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={clearSelection} className="!text-white !border-white/30 hover:!bg-white/10">Clear</Button>
              <Button size="sm" onClick={() => setShowBulkConfirm('approved')} disabled={bulkBusy}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark approved
              </Button>
              <Button size="sm" onClick={() => setShowBulkConfirm('shipped')} disabled={bulkBusy}>
                Mark shipped
              </Button>
              <Button size="sm" variant="danger" onClick={() => setShowBulkConfirm('cancelled')} disabled={bulkBusy}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {showBulkConfirm && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-center justify-between flex-wrap gap-2">
            <span>
              Apply <strong className="capitalize">{showBulkConfirm.replace('_', ' ')}</strong> to {selectedIds.size} orders?
              {(showBulkConfirm === 'cancelled' || showBulkConfirm === 'rejected') && ' Stock will be restored automatically.'}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowBulkConfirm(null)}>Cancel</Button>
              <Button size="sm" loading={bulkBusy} onClick={() => handleBulkStatus(showBulkConfirm)}>Confirm</Button>
            </div>
          </div>
        )}

        {/* Orders table */}
        <Card className="border-0 shadow-xl shadow-gray-200/50 overflow-visible">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Loading orders…</p>
            </div>
          ) : paginatedOrders.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3">
                <ShoppingCart className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No orders match</p>
              <p className="text-xs text-slate-500 mt-1">Try a different search or filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="px-3 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={paginatedOrders.length > 0 && paginatedOrders.every((o) => selectedIds.has(o.id))}
                        onChange={(e) => (e.target.checked ? selectAllOnPage() : clearSelection())}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                    </th>
                    <th className="text-left px-3 py-3">Order</th>
                    <th className="text-left px-3 py-3">Customer</th>
                    <th className="text-right px-3 py-3">Items</th>
                    <th className="text-right px-3 py-3">Total</th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-center px-3 py-3">Payment</th>
                    <th className="text-right px-3 py-3">Date</th>
                    <th className="text-right px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((o) => (
                    <tr
                      key={o.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/60 transition cursor-pointer ${
                        selectedIds.has(o.id) ? 'bg-blue-50/40' : ''
                      }`}
                      onClick={() => { setActiveOrder(o); setDrawerOpen(true); }}
                    >
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(o.id)}
                          onChange={() => toggleSelect(o.id)}
                          className="w-4 h-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-mono text-xs text-slate-700">#{String(o.id).slice(-6)}</p>
                        {o.isBulk && (
                          <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 mt-0.5">
                            Bulk
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold text-slate-900 text-sm truncate max-w-[180px]">{o.customerName || '—'}</p>
                        <p className="text-[11px] text-slate-500 truncate max-w-[180px]">{o.customerEmail}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{o.totalQty}</td>
                      <td className="px-3 py-2.5 text-right">
                        <p className="font-bold text-slate-900">{formatPeso(o.totalPrice || 0)}</p>
                        {Number(o.refundedAmount) > 0 && (
                          <p className="text-[10px] text-rose-700">−{formatPeso(o.refundedAmount)} refunded</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_TINT[o.status] || STATUS_TINT.pending}`}>
                          {o.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${PAYMENT_TINT[o.paymentStatus] || PAYMENT_TINT.pending}`}>
                          {(o.paymentStatus || 'pending').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-600">{shortDate(o.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setActiveOrder(o); setDrawerOpen(true); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden md:inline">View</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && filteredOrders.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 mt-4 px-4 pb-4">
              <p className="text-xs text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredOrders.length)} of {filteredOrders.length}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>Prev</Button>
                <span className="px-3 py-1 text-xs font-semibold text-slate-700">{currentPage} / {totalPages}</span>
                <Button size="sm" variant="outline" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Detail drawer */}
      <OrderDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        order={activeOrder}
        onChanged={() => {
          fetchAll();
          // Also refresh the active order so the drawer reflects new state
          if (activeOrder?.id) {
            apiRequest(`/orders/${activeOrder.id}`).then((fresh) => setActiveOrder({
              ...fresh,
              id: fresh._id || fresh.id,
              customerName: fresh.customer?.name || fresh.customerName,
              customerEmail: fresh.customer?.email || fresh.customerEmail,
            })).catch(() => {});
          }
        }}
      />
    </div>
    </PrintablePage>
  );
}

function KpiTile({ label, value, hint, icon: Icon, tint, blob }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${blob} opacity-50`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center shadow-lg mb-2.5`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs font-semibold text-slate-700 mt-0.5">{label}</p>
        {hint && <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
