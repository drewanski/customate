import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api';
import {
  Package, Clock, CheckCircle, AlertTriangle, CalendarDays,
  TrendingUp, ArrowUpRight, ChevronRight, Boxes, BarChart3,
  Sparkles, ShoppingBag,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPeso, shortOrderCode } from '../utils/format';
import { Calendar } from '../components/Calendar';

export function AdminOverview() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'calendar'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([apiRequest('/orders').catch(() => []), apiRequest('/inventory').catch(() => [])])
      .then(([o, i]) => {
        setOrders(o || []);
        setInventory(i || []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Calendar events derived from orders
  const calendarEvents = useMemo(() => {
    const events: Array<{
      id: string;
      title: string;
      date: string;
      type: 'pickup' | 'delivery' | 'turnover' | 'order' | 'production';
      status?: string;
      orderId?: string;
      customer?: string;
    }> = [];

    orders.forEach((order) => {
      if (order.createdAt) {
        events.push({
          id: `${order.id}-created`,
          title: `Order #${shortOrderCode(order.id)}`,
          date: order.createdAt,
          type: 'order',
          status: order.status,
          orderId: order.id,
          customer: order.customerName,
        });
      }
      if (order.status === 'in_production' || order.status === 'completed' || order.status === 'ready') {
        events.push({
          id: `${order.id}-production`,
          title: `Production: #${shortOrderCode(order.id)}`,
          date: order.updatedAt || order.createdAt,
          type: 'production',
          status: order.status,
          orderId: order.id,
          customer: order.customerName,
        });
      }
      if (order.pickupDate || order.status === 'ready' || order.status === 'completed') {
        events.push({
          id: `${order.id}-pickup`,
          title: `Ready for Pickup: #${shortOrderCode(order.id)}`,
          date: order.pickupDate || order.updatedAt || order.createdAt,
          type: 'pickup',
          status: order.status,
          orderId: order.id,
          customer: order.customerName,
        });
      }
      if (order.deliveryDate || order.estimatedDelivery) {
        events.push({
          id: `${order.id}-delivery`,
          title: `Delivery: #${shortOrderCode(order.id)}`,
          date: order.deliveryDate || order.estimatedDelivery,
          type: 'delivery',
          status: order.status,
          orderId: order.id,
          customer: order.customerName,
        });
      }
    });

    return events;
  }, [orders]);

  const handleCalendarEventClick = (event: any) => {
    if (event.orderId) navigate(`/admin/orders/${event.orderId}`);
  };

  const pendingOrders = orders.filter((o) => o.status === 'pending').length;
  const inProductionOrders = orders.filter((o) => o.status === 'in_production').length;
  const completedOrders = orders.filter((o) => o.status === 'completed').length;
  const lowStockItems = inventory.filter((i) => i.quantity < i.minQuantity).length;
  const totalRevenue = orders
    .filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  // KPI cards — each carries its own gradient + trend label
  const kpis = [
    {
      title: 'Pending Orders',
      value: pendingOrders,
      icon: Clock,
      gradient: 'from-amber-400 to-orange-500',
      tint: 'bg-amber-50',
      hint: 'awaiting confirmation',
    },
    {
      title: 'In Production',
      value: inProductionOrders,
      icon: Package,
      gradient: 'from-blue-500 to-indigo-600',
      tint: 'bg-blue-50',
      hint: 'currently being made',
    },
    {
      title: 'Completed',
      value: completedOrders,
      icon: CheckCircle,
      gradient: 'from-emerald-400 to-teal-500',
      tint: 'bg-emerald-50',
      hint: 'delivered to customers',
    },
    {
      title: 'Low Stock',
      value: lowStockItems,
      icon: AlertTriangle,
      gradient: 'from-rose-500 to-red-600',
      tint: 'bg-rose-50',
      hint: 'items below threshold',
    },
  ];

  // Mock chart data — replace with real data when you wire it up
  const chartData = [
    { name: 'Mon', orders: 12 },
    { name: 'Tue', orders: 19 },
    { name: 'Wed', orders: 15 },
    { name: 'Thu', orders: 25 },
    { name: 'Fri', orders: 22 },
    { name: 'Sat', orders: 18 },
    { name: 'Sun', orders: 14 },
  ];

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
      case 'in_production':
        return 'bg-blue-50 text-blue-700 ring-blue-200';
      case 'ready':
        return 'bg-purple-50 text-purple-700 ring-purple-200';
      case 'cancelled':
        return 'bg-slate-50 text-slate-600 ring-slate-200';
      default:
        return 'bg-amber-50 text-amber-700 ring-amber-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ─── Hero header ───────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-blue-400/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-24 w-96 h-96 rounded-full bg-purple-400/40 blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-8 md:py-12">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-bold mb-3">
                <Sparkles className="w-3 h-3" />
                Admin Workspace
              </div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Welcome back, Admin</h1>
              <p className="text-sm md:text-base text-white/85 mt-1">
                Here's what's happening across your store today.
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white/10 backdrop-blur-md border border-white/20 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'overview'
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'calendar'
                    ? 'bg-white text-blue-600 shadow-md'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Calendar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 md:py-10 -mt-2 relative z-10">
        {activeTab === 'calendar' ? (
          <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
            <Calendar events={calendarEvents} onEventClick={handleCalendarEventClick} />
          </div>
        ) : (
          <>
            {/* ─── KPI cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {kpis.map((kpi, index) => (
                <div
                  key={index}
                  className="relative bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all border border-slate-100 p-5 group overflow-hidden"
                >
                  <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${kpi.tint} opacity-50 pointer-events-none`} />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <div
                        className={`w-11 h-11 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}
                      >
                        <kpi.icon className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      {kpi.title}
                    </p>
                    <p className="text-3xl font-black text-slate-900 leading-none">
                      {loading ? <span className="inline-block w-12 h-7 bg-slate-100 rounded animate-pulse" /> : kpi.value}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-2">{kpi.hint}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue + Quick stats row */}
            <div className="grid lg:grid-cols-3 gap-5 mb-6">
              {/* Revenue card spans 2 cols */}
              <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 md:p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Orders this week
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl md:text-3xl font-black text-slate-900">
                        {chartData.reduce((s, d) => s + d.orders, 0)}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600">
                        <ArrowUpRight className="w-3 h-3" />
                        +12.4%
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/admin/reports')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    View reports
                  </button>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={11}
                      fontWeight="bold"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      }}
                    />
                    <Bar dataKey="orders" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Revenue tile */}
              <div className="relative bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white rounded-2xl shadow-sm border border-slate-800 p-5 md:p-6 overflow-hidden">
                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-blue-500/30 blur-3xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-purple-500/30 blur-3xl pointer-events-none" />
                <div className="relative h-full flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] font-bold text-white/70 uppercase tracking-wider">
                      Lifetime Revenue
                    </p>
                  </div>
                  <p className="text-3xl md:text-4xl font-black mb-1">{formatPeso(totalRevenue)}</p>
                  <p className="text-xs text-white/60">From {completedOrders} completed orders</p>
                  <div className="mt-auto pt-4 flex items-center gap-2">
                    <button
                      onClick={() => navigate('/admin/orders')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/20 transition-colors"
                    >
                      View orders
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent orders + low stock */}
            <div className="grid lg:grid-cols-2 gap-5">
              {/* Recent orders */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                      <ShoppingBag className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Recent Orders</h3>
                      <p className="text-[11px] text-slate-500">Latest 4 orders</p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/admin/orders')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5"
                  >
                    View all
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {orders.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">No orders yet</div>
                  ) : (
                    orders.slice(0, 4).map((order) => (
                      <button
                        key={order.id}
                        onClick={() => navigate(`/admin/orders/${order.id}`)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
                      >
                        <div>
                          <p className="font-bold text-slate-900 text-sm">#{shortOrderCode(order.id)}</p>
                          <p className="text-xs text-slate-500">{order.customerName || 'Unknown customer'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-bold text-sm text-slate-900">{formatPeso(order.totalAmount)}</p>
                            <span
                              className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${statusBadgeColor(
                                order.status,
                              )}`}
                            >
                              {(order.status || 'pending').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Low stock alerts */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">Low Stock Alerts</h3>
                      <p className="text-[11px] text-slate-500">
                        {lowStockItems} {lowStockItems === 1 ? 'item' : 'items'} need attention
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/admin/inventory')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-0.5"
                  >
                    Inventory
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {lowStockItems === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center mb-2">
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">All stock looks good</p>
                      <p className="text-xs text-slate-500">No items below their threshold.</p>
                    </div>
                  ) : (
                    inventory
                      .filter((i) => i.quantity < i.minQuantity)
                      .slice(0, 4)
                      .map((item) => {
                        const pct = Math.min(100, (item.quantity / Math.max(1, item.minQuantity)) * 100);
                        return (
                          <div key={item.id} className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Boxes className="w-4 h-4 text-rose-500" />
                                <p className="font-bold text-slate-900 text-sm">{item.productName}</p>
                              </div>
                              <span className="text-xs font-bold text-rose-600">
                                {item.quantity} / {item.minQuantity}
                              </span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-600 transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {(item.size || item.color) && (
                              <p className="text-[11px] text-slate-500 mt-2">
                                {item.size}
                                {item.size && item.color ? ' • ' : ''}
                                {item.color}
                              </p>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
