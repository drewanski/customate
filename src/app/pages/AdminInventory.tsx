import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { apiRequest, getInventoryDashboard } from '../api';
import {
  Plus,
  AlertTriangle,
  Edit2,
  Trash2,
  ImageIcon,
  Search,
  PackagePlus,
  Clock,
  Wrench,
  Truck,
  Receipt,
  Sparkles,
  TrendingUp,
  Download,
} from 'lucide-react';
import { formatPeso } from '../utils/format';
import { RestockModal } from '../components/inventory/RestockModal';
import { StockHistoryModal } from '../components/inventory/StockHistoryModal';
import { InventoryAuditLogModal } from '../components/inventory/InventoryAuditLogModal';
import { PrintablePage } from '../components/admin/PrintablePage';
import { generateSimpleReport } from '../utils/pdfExport';
import { AdjustStockModal } from '../components/inventory/AdjustStockModal';
import { SuppliersManagerModal } from '../components/inventory/SuppliersManagerModal';
import { AIRestockPanel } from '../components/inventory/AIRestockPanel';
import { useAuth } from '../hooks/useAuth';

function timeAgo(iso?: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function AdminInventory() {
  // Role-aware UI:
  //   admin            — Production Manager / business owner. Full CRUD,
  //                      price visibility, all exports, supplier mgmt.
  //   production_staff — Floor worker. Read-only — no buttons, no modals,
  //                      just see what's on hand for production prep.
  const { user } = useAuth();
  const role = (user?.role || 'customer') as string;
  const canCreate = role === 'admin';
  const canEditMeta = role === 'admin';
  const canDelete = role === 'admin';
  const canMoveStock = role === 'admin';
  const canSeePrice = role === 'admin';
  const canExport = role === 'admin';

  // ─── Pagination & search ────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'mid' | 'sufficient'>('all');

  // ─── Data ───────────────────────────────────────────────────────────────
  const [inventory, setInventory] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ─── Modals ─────────────────────────────────────────────────────────────
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [restockModalOpen, setRestockModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [suppliersModalOpen, setSuppliersModalOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: 'Apparel',
    price: 0,
    minStock: 10,
    image: '',
    description: '',
    isActive: true,
    initialStock: 0, // Only used when creating
  });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [inv, dash] = await Promise.all([
        apiRequest('/inventory'),
        getInventoryDashboard().catch(() => null),
      ]);
      setInventory(Array.isArray(inv) ? inv : []);
      setDashboard(dash);
    } catch (err) {
      console.error('Failed to fetch inventory', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stockFilter]);

  // ─── Edit / Create modal ────────────────────────────────────────────────
  const openEditModal = (item?: any) => {
    if (item) {
      setSelectedItem(item);
      setFormData({
        name: item.name,
        sku: item.sku,
        category: item.category,
        price: item.price,
        minStock: item.minStock ?? 10,
        image: item.image || '',
        description: item.description || '',
        isActive: item.isActive ?? true,
        initialStock: 0,
      });
    } else {
      setSelectedItem(null);
      setFormData({
        name: '',
        sku: '',
        category: 'Apparel',
        price: 0,
        minStock: 10,
        image: '',
        description: '',
        isActive: true,
        initialStock: 0,
      });
    }
    setEditModalOpen(true);
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedItem) {
        // PUT only updates metadata — stock changes go through dedicated modals
        const { initialStock, ...meta } = formData;
        await apiRequest(`/inventory/${selectedItem._id}`, {
          method: 'PUT',
          body: JSON.stringify(meta),
        });
      } else {
        await apiRequest('/inventory', {
          method: 'POST',
          body: JSON.stringify({
            ...formData,
            stock: formData.initialStock, // logged as "initial" movement on backend
          }),
        });
      }
      setEditModalOpen(false);
      fetchAll();
    } catch (err: any) {
      alert(err.message || 'Failed to save item');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product? The stock history will remain in the audit log.')) return;
    try {
      await apiRequest(`/inventory/${id}`, { method: 'DELETE' });
      fetchAll();
    } catch (err: any) {
      alert(err.message || 'Failed to delete item');
    }
  };

  // ─── Quick action launchers ─────────────────────────────────────────────
  const openRestock = (item: any) => {
    setSelectedItem(item);
    setRestockModalOpen(true);
  };
  const openHistory = (item: any) => {
    setSelectedItem(item);
    setHistoryModalOpen(true);
  };
  const openAdjust = (item: any) => {
    setSelectedItem(item);
    setAdjustModalOpen(true);
  };

  // ─── Derived data ───────────────────────────────────────────────────────
  const filteredInventory = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return inventory.filter((item) => {
      const name = (item?.name || '').toLowerCase();
      const sku = (item?.sku || '').toLowerCase();
      const cat = (item?.category || '').toLowerCase();
      const matchesSearch = !search || name.includes(search) || sku.includes(search) || cat.includes(search);
      if (!matchesSearch) return false;

      const available = item.stock - (item.reservedStock || 0);
      const minStock = item.minStock ?? 10;
      const status =
        available <= minStock ? 'low' : available <= minStock * 3 ? 'mid' : 'sufficient';
      if (stockFilter !== 'all' && status !== stockFilter) return false;
      return true;
    });
  }, [inventory, searchTerm, stockFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredInventory.length / itemsPerPage));
  const visiblePages = 5;
  const startPage = Math.max(1, currentPage - Math.floor(visiblePages / 2));
  const endPage = Math.min(totalPages, startPage + visiblePages - 1);
  const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

  const paginatedInventory = filteredInventory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const goToPage = (page: number) => {
    const safe = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(safe);
  };

  // ─── KPI metrics ────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalSkus = inventory.length;
    const lowStock = inventory.filter(
      (i) => (i.stock - (i.reservedStock || 0)) <= (i.minStock ?? 10)
    ).length;
    const totalValue = inventory.reduce((sum, i) => sum + (i.stock * i.price || 0), 0);
    return { totalSkus, lowStock, totalValue };
  }, [inventory]);

  // ─── Table columns ──────────────────────────────────────────────────────
  const columns: TableColumn<any>[] = [
    {
      key: 'image',
      header: 'Product',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-100 flex-shrink-0 overflow-hidden border border-slate-200">
            {item.image ? (
              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-full h-full p-2.5 text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 leading-tight truncate">{item.name}</p>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-tight">{item.sku}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (item) => (
      <span className="inline-flex px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
        {item.category}
      </span>
    )},
    {
      key: 'price',
      header: 'Price',
      render: (item) => <span className="font-bold text-slate-900">{formatPeso(item.price)}</span>,
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (item) => {
        const available = item.stock - (item.reservedStock || 0);
        const minStock = item.minStock ?? 10;
        const ratio = minStock > 0 ? Math.min(1, available / (minStock * 4)) : 1;
        const tint =
          available <= minStock
            ? 'from-rose-500 to-orange-500'
            : available <= minStock * 3
            ? 'from-amber-500 to-yellow-500'
            : 'from-emerald-500 to-teal-500';
        const textTint =
          available <= minStock
            ? 'text-rose-600'
            : available <= minStock * 3
            ? 'text-amber-600'
            : 'text-emerald-600';
        return (
          <div className="min-w-[120px]">
            <div className="flex items-baseline justify-between mb-1">
              <span className={`font-black text-base ${textTint}`}>{available}</span>
              <span className="text-[10px] text-slate-400">min {minStock}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${tint}`}
                style={{ width: `${Math.max(8, ratio * 100)}%` }}
              />
            </div>
            {item.reservedStock > 0 && (
              <p className="text-[10px] text-slate-500 mt-1">
                {item.reservedStock} reserved
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'stockStatus',
      header: 'Status',
      render: (item) => {
        const available = item.stock - (item.reservedStock || 0);
        const minStock = item.minStock ?? 10;
        if (available <= minStock) return <Badge variant="danger">LOW</Badge>;
        if (available <= minStock * 3) return <Badge variant="warning">MID</Badge>;
        return <Badge variant="success">OK</Badge>;
      },
    },
    {
      key: '_id',
      header: 'Actions',
      render: (item) => (
        <div className="flex gap-1 flex-wrap">
          {canMoveStock && (
            <button
              onClick={() => openRestock(item)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
              title="Restock from supplier"
            >
              <PackagePlus className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Restock</span>
            </button>
          )}
          <button
            onClick={() => openHistory(item)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition"
            title="View stock history"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
          {canMoveStock && (
            <button
              onClick={() => openAdjust(item)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition"
              title="Adjust / record damage"
            >
              <Wrench className="w-3.5 h-3.5" />
            </button>
          )}
          {canEditMeta && (
            <button
              onClick={() => openEditModal(item)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition"
              title="Edit details"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => handleDelete(item._id)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PrintablePage title="CustoMate — Inventory Report" subtitle="Stock levels, suppliers, and audit-logged actions">
    <div className="min-h-screen bg-slate-50">
      {/* Premium header */}
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
              <Sparkles className="w-3 h-3" />
              Inventory
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Stock & Catalog</h1>
            <p className="text-sm md:text-base text-white/85 mt-1 max-w-2xl">
              Track every restock, sale, adjustment, and supplier interaction with a full audit trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 no-print">
            <button
              onClick={() => setAuditLogOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
            >
              <Receipt className="w-4 h-4" />
              Audit Log
            </button>
            {canMoveStock && (
              <button
                onClick={() => setSuppliersModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
              >
                <Truck className="w-4 h-4" />
                Suppliers
              </button>
            )}
            {canExport && (
              <button
                onClick={async () => {
                  // Build a real branded PDF — fixes the previous
                  // window.print() flow that produced blank/mangled output.
                  const totalUnits = inventory.reduce((s, i) => s + (i.stock || 0), 0);
                  const totalValue = inventory.reduce((s, i) => s + (i.stock || 0) * (i.price || 0), 0);
                  const lowCount = inventory.filter((i) => (i.stock || 0) <= (i.minStock || 0)).length;
                  const outCount = inventory.filter((i) => (i.stock || 0) === 0).length;
                  const body = [...inventory]
                    .sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name))
                    .map((i) => [
                      i.sku || '—',
                      i.name,
                      i.category || '—',
                      String(i.stock ?? 0),
                      String(i.minStock ?? 0),
                      formatPeso(i.price || 0),
                      formatPeso((i.stock || 0) * (i.price || 0)),
                      (i.stock || 0) === 0 ? 'OUT OF STOCK'
                        : (i.stock || 0) <= (i.minStock || 0) ? 'LOW'
                        : 'OK',
                    ]);
                  const lowBody = inventory
                    .filter((i) => (i.stock || 0) <= (i.minStock || 0))
                    .map((i) => [i.sku || '—', i.name, i.category || '—', String(i.stock ?? 0), String(i.minStock ?? 0)]);
                  await generateSimpleReport({
                    title: 'Inventory Report',
                    subtitle: 'Stock levels, valuations, and restock alerts',
                    kpis: [
                      { label: 'SKUs', value: String(inventory.length) },
                      { label: 'Total units', value: totalUnits.toLocaleString() },
                      { label: 'Stock value', value: formatPeso(totalValue) },
                      { label: 'Low / Out', value: `${lowCount} / ${outCount}` },
                    ],
                    tables: [
                      { title: 'Full catalog', head: ['SKU', 'Name', 'Category', 'Stock', 'Min', 'Unit Price', 'Stock Value', 'Status'], body },
                      ...(lowBody.length
                        ? [{ title: 'Restock needed', head: ['SKU', 'Name', 'Category', 'Stock', 'Min'], body: lowBody }]
                        : []),
                    ],
                    filename: 'bryle-closet-inventory',
                  });
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white bg-white/15 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition"
              >
                <Download className="w-4 h-4" />
                Export PDF
              </button>
            )}
            {canCreate && (
              <button
                onClick={() => openEditModal()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-blue-600 bg-white hover:bg-slate-50 shadow-xl shadow-black/10 transition-all hover:-translate-y-0.5"
              >
                <Plus className="w-4 h-4" />
                New Product
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 -mt-2 relative z-10">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <MetricTile
            label="Total SKUs"
            value={metrics.totalSkus.toString()}
            hint="Unique products"
            icon={Receipt}
            tint="from-blue-500 to-indigo-500"
            blob="bg-blue-100"
          />
          <MetricTile
            label="Low stock"
            value={metrics.lowStock.toString()}
            hint="At or below min"
            icon={AlertTriangle}
            tint="from-rose-500 to-orange-500"
            blob="bg-rose-100"
          />
          <MetricTile
            label="Stock value"
            value={formatPeso(metrics.totalValue)}
            hint="Catalog × stock"
            icon={Receipt}
            tint="from-purple-500 to-pink-500"
            blob="bg-purple-100"
          />
          <MetricTile
            label="Restocked 7d"
            value={(dashboard?.restocked7d?.qty ?? 0).toLocaleString()}
            hint={dashboard ? `${formatPeso(dashboard.restocked7d?.cost || 0)} spent` : '—'}
            icon={TrendingUp}
            tint="from-emerald-500 to-teal-500"
            blob="bg-emerald-100"
          />
        </div>

        {/* AI Restock Suggestions — auto-hides when nothing needs reorder.
            Clicking "Restock" on any suggestion opens the existing
            RestockModal pre-filled with the item. */}
        <AIRestockPanel
          refreshKey={inventory.length}
          onRestock={(item) => {
            // Find the full inventory record for this suggestion
            const full = inventory.find((i) => i._id === item.inventoryId);
            if (full) {
              setSelectedItem(full);
              setRestockModalOpen(true);
            }
          }}
        />

        {/* Recent activity strip */}
        {dashboard?.recentMovements?.length > 0 && (
          <div className="mb-6 rounded-2xl bg-white border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-slate-500" />
              <h3 className="font-bold text-slate-900 text-sm">Recent activity</h3>
              <span className="text-[11px] text-slate-500">Last 7 days</span>
            </div>
            <div className="space-y-1.5">
              {dashboard.recentMovements.slice(0, 5).map((m: any) => (
                <div
                  key={m._id}
                  className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-lg hover:bg-slate-50"
                >
                  <span
                    className={`inline-flex w-2 h-2 rounded-full flex-shrink-0 ${
                      m.type === 'restock'
                        ? 'bg-emerald-500'
                        : m.type === 'sale'
                        ? 'bg-blue-500'
                        : m.type === 'damage'
                        ? 'bg-rose-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  <span className="font-semibold text-slate-900 capitalize">{m.type}</span>
                  <span className="text-slate-600 truncate flex-1">{m.inventoryName}</span>
                  {m.supplierSnapshot?.name && (
                    <span className="text-slate-500 truncate hidden md:inline">
                      from {m.supplierSnapshot.name}
                    </span>
                  )}
                  <span
                    className={`font-bold ${
                      m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {m.quantity > 0 ? '+' : ''}
                    {m.quantity}
                  </span>
                  <span className="text-slate-400 text-[10px]">{timeAgo(m.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name, SKU, or category…"
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="inline-flex p-1 rounded-full bg-white border border-slate-200">
            {(['all', 'low', 'mid', 'sufficient'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStockFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                  stockFilter === f
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f === 'all' ? 'All' : f === 'mid' ? 'Mid' : f === 'low' ? 'Low' : 'OK'}
              </button>
            ))}
          </div>
        </div>

        <Card className="border-0 shadow-xl shadow-gray-200/50 overflow-visible">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Loading inventory…</p>
            </div>
          ) : paginatedInventory.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3">
                <ImageIcon className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">No products match</p>
              <p className="text-xs text-slate-500 mt-1">Try a different search or filter.</p>
            </div>
          ) : (
            <Table columns={columns} data={paginatedInventory} />
          )}
          {!loading && filteredInventory.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6 pb-2">
              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
                Prev
              </Button>
              {pages.map((page) => (
                <Button
                  key={page}
                  onClick={() => goToPage(page)}
                  variant={currentPage === page ? 'primary' : 'outline'}
                  size="sm"
                  className="w-10"
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </Card>

        {/* Edit / Create modal (metadata only) */}
        <Modal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title={selectedItem ? 'Edit Product' : 'Add New Product'}
          footer={
            <>
              <Button variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveMeta}>
                {selectedItem ? 'Save Changes' : 'Create Product'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveMeta} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Product Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              {selectedItem ? (
                // Editing — SKU stays locked because orders + audit logs
                // reference it. Cannot be changed mid-life.
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
                    SKU
                  </label>
                  <div className="h-10 px-3 flex items-center rounded-lg bg-slate-100 border border-slate-200 text-sm font-mono text-slate-600">
                    {formData.sku || '—'}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">SKU is locked once the product exists</p>
                </div>
              ) : (
                // Creating — admin enters SKU manually (compliance item:
                // "SKU – manual only"). Server validates uniqueness.
                <div>
                  <Input
                    label="SKU (manual)"
                    value={formData.sku || ''}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase().trim() })}
                    placeholder="e.g. TS-CLASSIC-RED-M"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Letters, digits, dashes. Must be unique.</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full h-10 border border-slate-200 rounded-lg px-3 text-sm focus:ring-2 focus:ring-blue-500/20"
                >
                  {['Apparel', 'Accessories', 'Drinkware', 'Stationery', 'Bags', 'Small Goods'].map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <Input
                type="number"
                label="Base Price"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              {!selectedItem && (
                <Input
                  type="number"
                  label="Initial stock"
                  value={formData.initialStock}
                  onChange={(e) => setFormData({ ...formData, initialStock: Number(e.target.value) })}
                />
              )}
              <Input
                type="number"
                label="Min. stock alert"
                value={formData.minStock}
                onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
                required
              />
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm font-medium text-slate-700">Active</span>
                </label>
              </div>
            </div>

            {selectedItem && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs">
                <p className="font-semibold mb-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Stock changes go through audit-logged actions
                </p>
                <p>
                  To change stock, close this dialog and use <strong>Restock</strong> (from supplier) or{' '}
                  <strong>Adjust</strong> (manual correction). Every change records who, when, why, and how much.
                </p>
              </div>
            )}

            <Input
              label="Image URL"
              value={formData.image}
              onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              placeholder="https://…"
            />

            <Textarea
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Product features, materials, etc."
              rows={3}
            />
          </form>
        </Modal>

        {/* Specialized modals */}
        <RestockModal
          isOpen={restockModalOpen}
          onClose={() => setRestockModalOpen(false)}
          item={selectedItem}
          onSuccess={fetchAll}
        />
        <StockHistoryModal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          item={selectedItem}
        />
        <AdjustStockModal
          isOpen={adjustModalOpen}
          onClose={() => setAdjustModalOpen(false)}
          item={selectedItem}
          onSuccess={fetchAll}
        />
        <SuppliersManagerModal
          isOpen={suppliersModalOpen}
          onClose={() => setSuppliersModalOpen(false)}
          onChanged={fetchAll}
        />
        <InventoryAuditLogModal
          isOpen={auditLogOpen}
          onClose={() => setAuditLogOpen(false)}
        />
      </div>
    </div>
    </PrintablePage>
  );
}

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  tint,
  blob,
}: {
  label: string;
  value: string;
  hint: string;
  icon: any;
  tint: string;
  blob: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
      <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${blob} opacity-50`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tint} flex items-center justify-center shadow-lg mb-2.5`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">{value}</p>
        <p className="text-xs font-semibold text-slate-700 mt-0.5">{label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{hint}</p>
      </div>
    </div>
  );
}
