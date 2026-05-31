import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PrintablePage } from '../components/admin/PrintablePage';
import { Pagination, usePagination } from '../components/Pagination';
import {
  Percent,
  DollarSign,
  Truck,
  Gift,
  Plus,
  Search,
  Download,
  RefreshCw,
  Sparkles,
  Eye,
  Edit,
  Trash2,
  Tag,
  TrendingDown,
  Users as UsersIcon,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import {
  getCoupons,
  getCouponStats,
  deactivateCoupon,
  downloadCouponsCsv,
} from '../api';
import { formatPeso } from '../utils/format';
import { CouponFormModal } from '../components/coupons/CouponFormModal';
import { CouponUsageDrawer } from '../components/coupons/CouponUsageDrawer';

const TYPE_META: Record<string, { icon: any; tint: string; label: string }> = {
  percentage:    { icon: Percent,    tint: 'bg-blue-100 text-blue-700 border-blue-200',       label: 'Percentage' },
  fixed_amount:  { icon: DollarSign, tint: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Fixed' },
  free_shipping: { icon: Truck,      tint: 'bg-amber-100 text-amber-700 border-amber-200',       label: 'Free ship' },
  bogo:          { icon: Gift,       tint: 'bg-purple-100 text-purple-700 border-purple-200',     label: 'BOGO' },
};

function couponStatus(c: any): 'active' | 'scheduled' | 'expired' | 'inactive' {
  if (!c.isActive) return 'inactive';
  const now = new Date();
  if (c.validFrom && new Date(c.validFrom) > now) return 'scheduled';
  if (c.validUntil && new Date(c.validUntil) < now) return 'expired';
  if (c.usageLimit > 0 && c.usedCount >= c.usageLimit) return 'expired';
  return 'active';
}

const STATUS_TINT: Record<string, string> = {
  active:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  scheduled: 'bg-blue-100 text-blue-700 border-blue-200',
  expired:   'bg-rose-100 text-rose-700 border-rose-200',
  inactive:  'bg-slate-100 text-slate-600 border-slate-200',
};

export function AdminCoupons() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);

  const [usageOpen, setUsageOpen] = useState(false);
  const [viewingCoupon, setViewingCoupon] = useState<any>(null);

  const [exporting, setExporting] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [list, summary] = await Promise.all([
        getCoupons(),
        getCouponStats().catch(() => null),
      ]);
      setCoupons(Array.isArray(list) ? list : []);
      setStats(summary);
    } catch (err) {
      console.error('Failed to fetch coupons', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return coupons.filter((c) => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (statusFilter !== 'all') {
        if (couponStatus(c) !== statusFilter) return false;
      }
      if (!term) return true;
      return (
        (c.code || '').toLowerCase().includes(term) ||
        (c.name || '').toLowerCase().includes(term) ||
        (c.description || '').toLowerCase().includes(term)
      );
    });
  }, [coupons, searchTerm, statusFilter, typeFilter]);

  // Pagination — resets on any filter / search change.
  const { page, pageSize, setPage, setPageSize } = usePagination(12, [searchTerm, statusFilter, typeFilter]);
  const paginated = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  const openCreate = () => { setEditingCoupon(null); setFormOpen(true); };
  const openEdit = (c: any) => { setEditingCoupon(c); setFormOpen(true); };
  const openUsage = (c: any) => { setViewingCoupon(c); setUsageOpen(true); };

  const handleDeactivate = async (c: any) => {
    if (!confirm(`Deactivate "${c.code}"? Customers won't be able to use it but existing orders are unaffected.`)) return;
    try {
      await deactivateCoupon(c._id);
      fetchAll();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadCouponsCsv();
    } catch (err: any) {
      alert(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <PrintablePage title="CustoMate — Coupons Report" subtitle="Active promo codes and redemption history">
    <div className="min-h-screen bg-slate-50">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white no-print">
        <div className="absolute -top-32 -left-24 w-80 h-80 rounded-full bg-blue-400/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-purple-400/40 blur-3xl pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[10px] font-bold uppercase tracking-widest mb-3">
              <Sparkles className="w-3 h-3" /> Promotions
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Coupons &amp; Discounts</h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Create and manage promo codes. Track redemptions and discount spend in real time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
            >
              <Download className="w-4 h-4" /> Export PDF
            </button>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-blue-600 bg-white hover:bg-slate-50 shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4" /> New coupon
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 -mt-2 relative z-10">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KpiTile label="Active coupons" value={stats?.activeCoupons ?? '—'} hint={`of ${stats?.totalCoupons || 0} total`} icon={Tag} tint="from-blue-500 to-indigo-500" blob="bg-blue-100" />
          <KpiTile label="Total redemptions" value={stats?.totalRedemptions ?? '—'} hint={`${stats?.activeRedemptions || 0} active`} icon={UsersIcon} tint="from-emerald-500 to-teal-500" blob="bg-emerald-100" />
          <KpiTile label="Total discount given" value={stats ? formatPeso(stats.totalDiscountGiven) : '—'} icon={TrendingDown} tint="from-rose-500 to-orange-500" blob="bg-rose-100" />
          <KpiTile label="Avg discount" value={stats ? formatPeso(stats.avgDiscount) : '—'} hint="per redemption" icon={DollarSign} tint="from-purple-500 to-pink-500" blob="bg-purple-100" />
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Search by code, name or description…" className="pl-10" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex p-1 rounded-full bg-white border border-slate-200">
              {['all', 'active', 'scheduled', 'expired', 'inactive'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                    statusFilter === s ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s === 'all' ? 'All status' : s}
                </button>
              ))}
            </div>
            <div className="inline-flex p-1 rounded-full bg-white border border-slate-200">
              {['all', 'percentage', 'fixed_amount', 'free_shipping', 'bogo'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                    typeFilter === t ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t === 'all' ? 'All types' : t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Coupons table */}
        <Card className="border-0 shadow-xl shadow-gray-200/50 overflow-visible">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Loading coupons…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3">
                <Tag className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No coupons match</p>
              <p className="text-xs text-slate-500 mt-1">Click "New coupon" to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="text-left px-3 py-3">Code</th>
                    <th className="text-left px-3 py-3">Type</th>
                    <th className="text-right px-3 py-3">Value</th>
                    <th className="text-center px-3 py-3">Status</th>
                    <th className="text-right px-3 py-3">Used</th>
                    <th className="text-right px-3 py-3">Discount given</th>
                    <th className="text-right px-3 py-3">Expires</th>
                    <th className="text-right px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((c) => {
                    const meta = TYPE_META[c.type] || TYPE_META.percentage;
                    const Icon = meta.icon as any;
                    const status = couponStatus(c);
                    return (
                      <tr key={c._id} className="border-b border-slate-100 hover:bg-slate-50/60 transition cursor-pointer" onClick={() => openUsage(c)}>
                        <td className="px-3 py-2.5">
                          <p className="font-mono text-sm font-bold text-slate-900">{c.code}</p>
                          <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{c.name}</p>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${meta.tint}`}>
                            <Icon className="w-2.5 h-2.5" />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                          {c.type === 'percentage' ? `${c.value}%` :
                           c.type === 'fixed_amount' ? formatPeso(c.value) :
                           c.type === 'free_shipping' ? 'shipping' :
                           c.type === 'bogo' ? `B${c.value}G1` : c.value}
                          {c.maxDiscount > 0 && c.type === 'percentage' && (
                            <p className="text-[10px] text-slate-500 font-normal">max {formatPeso(c.maxDiscount)}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${STATUS_TINT[status]}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                          {c.stats?.activeRedemptions || 0}
                          {c.usageLimit > 0 ? <span className="text-slate-400 font-normal"> / {c.usageLimit}</span> : ''}
                          {c.stats?.uniqueCustomers > 0 && (
                            <p className="text-[10px] text-slate-500 font-normal">{c.stats.uniqueCustomers} unique</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-rose-600">
                          {formatPeso(c.stats?.totalDiscount || 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-slate-600">
                          {c.validUntil ? new Date(c.validUntil).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => openUsage(c)}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50"
                              title="View usage"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openEdit(c)}
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                              title="Edit"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            {c.isActive && (
                              <button
                                onClick={() => handleDeactivate(c)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50"
                                title="Deactivate"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > pageSize && (
                <div className="p-4 border-t border-slate-100 bg-slate-50/40">
                  <Pagination
                    page={page}
                    total={filtered.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    pageSizeOptions={[12, 25, 50]}
                    itemLabel="coupon"
                    itemLabelPlural="coupons"
                  />
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <CouponFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        coupon={editingCoupon}
        onSaved={fetchAll}
      />
      <CouponUsageDrawer
        isOpen={usageOpen}
        onClose={() => setUsageOpen(false)}
        coupon={viewingCoupon}
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
