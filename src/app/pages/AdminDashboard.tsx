import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { NotificationBell } from '../components/NotificationBell';
import { Modal } from '../components/Modal';
import { AdminCalendar } from '../components/AdminCalendar';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import {
  Plus,
  Edit2,
  Trash2,
  Package,
  Image as ImageIcon,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  CalendarDays,
  Users,
  Sparkles,
  Shield,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  PieChart as PieIcon,
  ArrowUpRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface InventoryItem {
  _id: string;
  name: string;
  sku: string;
  category: string;
  stock: number;
  price: number;
  image?: string;
  description?: string;
  isActive: boolean;
  lowStockThreshold?: number;
}

interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalQty: number;
  totalPrice: number;
  isBulk: boolean;
  status: string;
  paymentStatus: string;
  paidAmount: number;
  requiredPayment: number;
  createdAt: string;
}

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'calendar' | 'inventory' | 'orders'>('overview');

  // Inventory Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    stock: 0,
    price: 0,
    image: '',
    description: '',
    isActive: true,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [salesView, setSalesView] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [dayStart, setDayStart] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const salesData = React.useMemo(() => {
    // DAILY
    if (salesView === 'daily') {
      const today = new Date();
      const result: { label: string; sales: number; sortValue: number }[] = [];
      const currentDay = today.getDate();

      for (let i = 0; i < 7 && dayStart + i <= currentDay; i++) {
        const current = new Date(today);
        current.setDate(dayStart + i);
        const day = current.getDate();
        let totalSales = 0;

        orders.forEach((order) => {
          const orderDate = new Date(order.createdAt);
          if (
            orderDate.getDate() === day &&
            orderDate.getMonth() === today.getMonth() &&
            orderDate.getFullYear() === today.getFullYear()
          ) {
            totalSales += Number(order.totalPrice || 0);
          }
        });

        result.push({
          label: String(day),
          sales: totalSales,
          sortValue: current.getTime(),
        });
      }
      return result;
    }

    // WEEKLY
    if (salesView === 'weekly') {
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();
      const weekly: Record<number, number> = {};

      orders.forEach((order) => {
        const date = new Date(order.createdAt);
        if (date.getFullYear() !== year || date.getMonth() !== month) return;
        const firstDay = new Date(year, month, 1);
        const dayOfMonth = date.getDate();
        const week = Math.ceil((dayOfMonth + firstDay.getDay()) / 7);
        weekly[week] = (weekly[week] || 0) + Number(order.totalPrice || 0);
      });

      return Object.entries(weekly)
        .map(([week, sales]) => ({
          label: `Week ${week}`,
          sales,
          sortValue: Number(week),
        }))
        .sort((a, b) => a.sortValue - b.sortValue);
    }

    // MONTHLY
    const result: Record<string, number> = {};
    const baseDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const monthsToShow = 6;

    for (let i = monthsToShow - 1; i >= 0; i--) {
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      result[key] = 0;
    }

    orders.forEach((order) => {
      const date = new Date(order.createdAt);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      if (result[key] !== undefined) {
        result[key] += Number(order.totalPrice || 0);
      }
    });

    return Object.entries(result)
      .map(([key, sales]) => {
        const [year, month] = key.split('-');
        const date = new Date(Number(year), Number(month));
        return {
          label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          sales,
          sortValue: date.getTime(),
        };
      })
      .sort((a, b) => a.sortValue - b.sortValue);
  }, [orders, salesView, dayStart, selectedMonth]);

  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f59e0b'];

  const categoryData = React.useMemo(() => {
    const result: Record<string, number> = {};
    orders.forEach((order) => {
      order.items?.forEach((item) => {
        const category = (item.name || 'uncategorized').toLowerCase().trim();
        result[category] = (result[category] || 0) + (item.quantity || 1);
      });
    });

    return Object.entries(result)
      .map(([name, value], index) => ({
        name,
        value,
        color: colors[index % colors.length],
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [orders]);

  const totalRevenue = React.useMemo(
    () => orders.reduce((sum, o) => sum + Number(o.totalPrice || 0), 0),
    [orders]
  );

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const profileRes = await fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profileData = await profileRes.json();
      setUser(profileData);

      const [invRes, ordersRes] = await Promise.all([
        fetch(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/orders`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const invData = await invRes.json();
      const ordersData = await ordersRes.json();

      setInventory(invData);
      setOrders(ordersData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (item?: InventoryItem) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        sku: item.sku,
        category: item.category,
        stock: item.stock,
        price: item.price,
        image: item.image || '',
        description: item.description || '',
        isActive: item.isActive,
      });
    } else {
      setEditingItem(null);
      setFormData({
        name: '',
        sku: '',
        category: '',
        stock: 0,
        price: 0,
        image: '',
        description: '',
        isActive: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      const url = editingItem
        ? `${API_URL}/inventory/${editingItem._id}`
        : `${API_URL}/inventory`;
      const method = editingItem ? 'PUT' : 'POST';
      const token = localStorage.getItem('token');

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to save item');

      await loadData();
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving item:', err);
      alert('Failed to save item. Please check the logs.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/inventory/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete item');
      await loadData();
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Failed to delete item.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white shadow-xl p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Access denied</h2>
          <p className="text-sm text-slate-500">This area is reserved for administrators.</p>
        </div>
      </div>
    );
  }

  const lowStockItems = inventory.filter((item) => item.stock <= (item.lowStockThreshold || 10));

  const tabs: Array<{ id: typeof activeTab; label: string; icon: any }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'inventory', label: 'Inventory', icon: Package },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* HERO HEADER */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-purple-500/20 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-10 pb-20">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-xs font-medium mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Admin Workspace
              </div>
              <h1 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
                Welcome back, {user.name?.split(' ')[0] || 'Admin'}
              </h1>
              <p className="text-white/70 mt-1 text-sm lg:text-base">
                Here's a snapshot of your store today.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <NotificationBell />
              <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 text-white text-sm font-medium">
                <Shield className="w-4 h-4" />
                <span className="capitalize">{user.role || 'admin'}</span>
              </div>
              {activeTab === 'inventory' && (
                <button
                  onClick={() => handleOpenModal()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white text-slate-900 text-sm font-semibold shadow-lg hover:shadow-xl transition"
                >
                  <Plus className="w-4 h-4" />
                  New Item
                </button>
              )}
            </div>
          </div>

          {/* TAB PILLS */}
          <div className="mt-8 inline-flex p-1 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 -mt-12 relative z-10 pb-16">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: 'Inventory Items',
                  value: inventory.length,
                  hint: 'Unique SKUs',
                  icon: Package,
                  tint: 'from-blue-500 to-indigo-500',
                  blob: 'bg-blue-100',
                },
                {
                  label: 'Total Orders',
                  value: orders.length,
                  hint: 'All time',
                  icon: ShoppingCart,
                  tint: 'from-emerald-500 to-teal-500',
                  blob: 'bg-emerald-100',
                },
                {
                  label: 'Low Stock',
                  value: lowStockItems.length,
                  hint: 'Need restocking',
                  icon: AlertTriangle,
                  tint: 'from-amber-500 to-orange-500',
                  blob: 'bg-amber-100',
                },
                {
                  label: 'Bulk Orders',
                  value: orders.filter((o) => o.isBulk).length,
                  hint: '20+ items',
                  icon: Users,
                  tint: 'from-purple-500 to-pink-500',
                  blob: 'bg-purple-100',
                },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div
                    key={kpi.label}
                    className="relative overflow-hidden rounded-2xl bg-white border border-slate-200 p-5 shadow-sm hover:shadow-md transition"
                  >
                    <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${kpi.blob} opacity-50`} />
                    <div className="relative">
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${kpi.tint} flex items-center justify-center shadow-lg mb-3`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <p className="text-3xl font-black text-slate-900 tracking-tight">{kpi.value}</p>
                      <p className="text-sm font-semibold text-slate-700 mt-0.5">{kpi.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{kpi.hint}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* SALES + REVENUE */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* SALES ANALYTICS */}
              <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-md">
                        <BarChart3 className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">Sales Analytics</h3>
                        <p className="text-xs text-slate-500">
                          {salesView === 'monthly' &&
                            selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          {salesView === 'weekly' && 'Weekly breakdown'}
                          {salesView === 'daily' && 'Daily breakdown'}
                        </p>
                      </div>
                    </div>

                    <div className="inline-flex p-1 rounded-full bg-slate-100">
                      {(['daily', 'weekly', 'monthly'] as const).map((view) => (
                        <button
                          key={view}
                          onClick={() => setSalesView(view)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                            salesView === view
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {view}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Navigation row */}
                  {(salesView === 'monthly' || salesView === 'daily') && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (salesView === 'monthly') {
                            setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                          } else {
                            setDayStart((prev) => Math.max(1, prev - 1));
                          }
                        }}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition"
                      >
                        <ChevronLeft className="w-4 h-4 text-slate-700" />
                      </button>
                      <span className="text-xs font-medium text-slate-600 px-2">
                        {salesView === 'monthly'
                          ? selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                          : `Starting day ${dayStart}`}
                      </span>
                      <button
                        onClick={() => {
                          if (salesView === 'monthly') {
                            setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                          } else {
                            setDayStart((prev) => prev + 1);
                          }
                        }}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition"
                      >
                        <ChevronRight className="w-4 h-4 text-slate-700" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-6 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `₱${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                        }}
                        formatter={(value: any) => [`₱${Number(value).toLocaleString()}`, 'Sales']}
                      />
                      <Area
                        type="monotone"
                        dataKey="sales"
                        stroke="#6366f1"
                        strokeWidth={3}
                        fill="url(#salesGradient)"
                        dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, fill: '#6366f1', strokeWidth: 3, stroke: '#fff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* REVENUE TILE (DARK) */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 shadow-xl text-white">
                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-blue-500/20 blur-2xl" />
                <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-purple-500/20 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold">
                      <ArrowUpRight className="w-3 h-3" />
                      LIVE
                    </div>
                  </div>
                  <p className="text-white/60 text-xs font-medium uppercase tracking-wider">Lifetime Revenue</p>
                  <p className="text-4xl font-black mt-1 tracking-tight">
                    ₱{totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-white/50 text-xs mt-2">Across {orders.length} orders</p>

                  <div className="mt-6 pt-6 border-t border-white/10 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">Avg. order value</span>
                      <span className="font-semibold">
                        ₱{orders.length ? (totalRevenue / orders.length).toFixed(0) : 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">Bulk share</span>
                      <span className="font-semibold">
                        {orders.length
                          ? `${Math.round((orders.filter((o) => o.isBulk).length / orders.length) * 100)}%`
                          : '0%'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">Active SKUs</span>
                      <span className="font-semibold">
                        {inventory.filter((i) => i.isActive).length}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* POPULAR CATEGORIES + LOW STOCK */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* POPULAR CATEGORIES */}
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-md">
                      <PieIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Popular Items</h3>
                      <p className="text-xs text-slate-500">Top 5 by quantity sold</p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {categoryData.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                        <PieIcon className="w-7 h-7 text-slate-400" />
                      </div>
                      <p className="text-sm text-slate-500">No sales data yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryData}
                              dataKey="value"
                              nameKey="name"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={4}
                            >
                              {categoryData.map((entry, index) => (
                                <Cell key={index} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{
                                borderRadius: 12,
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        {categoryData.map((item) => (
                          <div
                            key={item.name}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="capitalize text-sm text-slate-700 truncate">{item.name}</span>
                            </div>
                            <span className="text-sm font-semibold text-slate-900">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* LOW STOCK */}
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-md">
                      <AlertTriangle className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Low Stock Alerts</h3>
                      <p className="text-xs text-slate-500">{lowStockItems.length} items need attention</p>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {lowStockItems.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                        <Package className="w-7 h-7 text-emerald-500" />
                      </div>
                      <p className="text-sm font-medium text-slate-700">All stocked up</p>
                      <p className="text-xs text-slate-500 mt-1">No items are running low.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lowStockItems.slice(0, 5).map((item) => {
                        const threshold = item.lowStockThreshold || 10;
                        const pct = Math.min(100, Math.max(5, (item.stock / threshold) * 100));
                        return (
                          <div key={item._id} className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center flex-shrink-0">
                                  <TrendingDown className="w-4 h-4 text-rose-600" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                                  <p className="text-xs text-slate-500 font-mono">{item.sku}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-rose-600">{item.stock} left</p>
                                <p className="text-[10px] text-slate-500">of {threshold}</p>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {lowStockItems.length > 5 && (
                        <p className="text-center text-xs text-slate-500 pt-2">
                          And {lowStockItems.length - 5} more items…
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <AdminCalendar orders={orders} />
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-md">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Inventory Management</h3>
                  <p className="text-xs text-slate-500">{inventory.length} items in catalog</p>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Item</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">SKU</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Category</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Stock</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Price</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => {
                    const lowStock = item.stock <= (item.lowStockThreshold || 10);
                    return (
                      <tr key={item._id} className="border-b border-slate-100 hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-10 h-10 object-cover rounded-lg" />
                            ) : (
                              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-slate-400" />
                              </div>
                            )}
                            <span className="font-medium text-slate-900">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.sku}</td>
                        <td className="px-4 py-3 text-slate-700">{item.category}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <span className={lowStock ? 'text-rose-600 font-bold' : 'text-slate-900 font-semibold'}>
                              {item.stock}
                            </span>
                            {lowStock && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          ₱{item.price.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                              item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {item.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleOpenModal(item)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item._id)}
                              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {inventory.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                          <Package className="w-7 h-7 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-700">No inventory items yet</p>
                        <p className="text-xs text-slate-500 mt-1">Click "New Item" to add your first product.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Order Management</h3>
                <p className="text-xs text-slate-500">{orders.length} total orders</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Items</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50/60 transition">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">#{order.id.slice(-6)}</td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">{order.customerName}</p>
                          <p className="text-xs text-slate-500">{order.customerEmail}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{order.totalQty}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        ₱{order.totalPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {order.isBulk ? (
                          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700">
                            Bulk
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                            order.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : order.status === 'pending'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="text-xs">
                          <p className="capitalize font-medium text-slate-700">{order.paymentStatus}</p>
                          {order.paidAmount > 0 && (
                            <p className="text-slate-500 mt-0.5">₱{order.paidAmount}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                          <ShoppingCart className="w-7 h-7 text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-700">No orders yet</p>
                        <p className="text-xs text-slate-500 mt-1">Orders will appear here once customers check out.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Inventory Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? 'Edit Inventory Item' : 'Add Inventory Item'}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Product Name"
              value={formData.name}
              onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input
              label="SKU"
              value={formData.sku}
              onChange={(e: any) => setFormData({ ...formData, sku: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Category"
              value={formData.category}
              onChange={(e: any) => setFormData({ ...formData, category: e.target.value })}
              required
            />
            <Input
              label="Image URL"
              value={formData.image}
              onChange={(e: any) => setFormData({ ...formData, image: e.target.value })}
              placeholder="https://images.unsplash.com/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Price (₱)"
              type="number"
              value={formData.price}
              onChange={(e: any) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
              required
            />
            <Input
              label="Stock"
              type="number"
              value={formData.stock}
              onChange={(e: any) => setFormData({ ...formData, stock: parseInt(e.target.value) })}
              required
            />
          </div>
          <Textarea
            label="Description"
            value={formData.description}
            onChange={(e: any) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
          <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-slate-700">
              Item is active and visible to customers
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={formLoading}>
              {editingItem ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
