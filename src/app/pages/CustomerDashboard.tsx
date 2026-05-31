import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  ClipboardList,
  Palette,
  ArrowRight,
  Sparkles,
  TrendingUp,
  Clock,
  DollarSign,
  ShoppingCart,
  User,
  Calendar,
  Truck,
  CheckCircle,
  AlertCircle,
  Eye,
  Download,
  Star,
  Heart,
  Settings,
  Bell,
  Search,
  Filter,
  MoreVertical,
  ChevronRight,
  Activity,
  Zap,
  Target,
  Award,
  Gift,
  BarChart3,
  PieChart,
  Users,
  ShoppingBag,
  RefreshCw,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { getMyReviews } from '../api';
import { OrderCard } from '../components/orders/OrderCard';

interface Order {
  id: string;
  orderNumber: string;
  date: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'approved' | 'in_production' | 'ready' | 'completed' | 'rejected';
  totalAmount: number;
  items: number;
  totalQty: number;
  estimatedDelivery?: string;
  trackingNumber?: string;
  customerName?: string;
  customerEmail?: string;
  paymentStatus?: string;
  isBulk?: boolean;
  shippingAddress?: string;
  notes?: string;
}

interface CustomerStats {
  totalOrders: number;
  totalSpent: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  lastOrderDate: Date | null;
  recentOrders: Order[];
  bulkOrders: number;
}

interface CustomerActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  date: string;
  orderId: string;
  amount: number;
}

interface StatCard {
  title: string;
  value: string | number;
  change: string;
  changeType: 'increase' | 'decrease' | 'neutral';
  icon: React.ElementType;
  color: string;
}

interface QuickAction {
  title: string;
  description: string;
  to: string;
  Icon: React.ElementType;
  color: string;
  badge?: string;
}

export function CustomerDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTimeRange, setSelectedTimeRange] = useState('30days');
  
  const { data, loading, error, refreshing, refreshData } = useDashboardData();
  const { user, orders, stats, activities } = data;

  // ─── Pending reviews banner ─────────────────────────────────────────────
  // After an order reaches completed/delivered/shipped, the customer should
  // be nudged to leave a review per item. We compute (orders awaiting review,
  // unreviewed SKU count) by cross-referencing /reviews/mine against the
  // customer's eligible orders.
  const [myReviewedSkus, setMyReviewedSkus] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    getMyReviews()
      .then((list: any[]) => {
        if (cancelled) return;
        setMyReviewedSkus(new Set((list || []).map((r) => r.sku)));
      })
      .catch(() => { /* non-fatal */ });
    return () => { cancelled = true; };
  }, [orders?.length]);

  const pendingReviewOrders = (orders || []).filter((o: any) =>
    ['completed', 'delivered', 'shipped'].includes(o.status) &&
    Array.isArray(o.items) &&
    o.items.some((it: any) => it?.sku && !myReviewedSkus.has(it.sku))
  );
  const pendingReviewSkuCount = pendingReviewOrders.reduce((n: number, o: any) =>
    n + (o.items || []).filter((it: any) => it?.sku && !myReviewedSkus.has(it.sku)).length, 0);

  // Generate stats cards from real data
  const getStatsCards = (): StatCard[] => {
    if (!stats) return [];

    const cards: StatCard[] = [
      {
        title: 'Total Orders',
        value: stats.totalOrders,
        change: stats.bulkOrders > 0 ? `${stats.bulkOrders} bulk orders` : 'All regular orders',
        changeType: 'neutral',
        icon: ShoppingBag,
        color: 'blue'
      },
      {
        title: 'Total Spent',
        value: `₱${stats.totalSpent.toFixed(2)}`,
        change: `Avg: ₱${stats.averageOrderValue.toFixed(0)} per order`,
        changeType: 'neutral',
        icon: DollarSign,
        color: 'green'
      },
      {
        title: 'Pending Orders',
        value: stats.pendingOrders,
        change: stats.pendingOrders > 0 ? 'Awaiting processing' : 'All orders completed',
        changeType: 'neutral',
        icon: Clock,
        color: 'yellow'
      },
      {
        title: 'Completed',
        value: stats.completedOrders,
        change: stats.completedOrders > 0 ? 'Successfully delivered' : 'No completed orders',
        changeType: 'increase',
        icon: CheckCircle,
        color: 'green'
      }
    ];

    return cards;
  };

  const quickActions: QuickAction[] = [
    {
      title: 'Browse Products',
      description: 'Explore our collection and start customizing',
      to: '/products',
      Icon: Package,
      color: 'blue',
      badge: stats?.totalOrders === 0 ? 'New' : undefined
    },
    {
      title: 'Track Orders',
      description: 'Monitor your order status in real-time',
      to: '/order-tracking',
      Icon: Truck,
      color: 'green'
    },
    {
      title: 'Design Studio',
      description: 'Create custom designs with our tools',
      to: '/product/1/customize',
      Icon: Palette,
      color: 'purple'
    },
    {
      title: 'Quick Reorder',
      description: orders.length > 0 ? 'Reorder your favorite items' : 'Place your first order',
      to: orders.length > 0 ? '/reorder' : '/products',
      Icon: Zap,
      color: 'orange',
      badge: orders.length > 2 ? 'Popular' : undefined
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'shipped':
      case 'ready':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
      case 'in_production':
      case 'approved':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return CheckCircle;
      case 'shipped':
      case 'ready':
        return Truck;
      case 'processing':
      case 'in_production':
      case 'approved':
        return Clock;
      case 'pending':
        return AlertCircle;
      case 'cancelled':
      case 'rejected':
        return XCircle;
      default:
        return Clock;
    }
  };

  const getActivityIcon = (activity: CustomerActivity) => {
    switch (activity.status) {
      case 'delivered':
      case 'completed':
        return CheckCircle;
      case 'shipped':
        return Truck;
      case 'processing':
        return Clock;
      case 'cancelled':
        return XCircle;
      default:
        return Activity;
    }
  };

  // Recent orders list: filter by search → newest first → show up to 5.
  // Anything older shows up via "View all orders" link at the bottom.
  const RECENT_LIMIT = 5;
  const matchingOrders = orders.filter((order) =>
    order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.status.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const sortedOrders = [...matchingOrders].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );
  const filteredOrders = searchTerm ? sortedOrders : sortedOrders.slice(0, RECENT_LIMIT);
  const hasMore = !searchTerm && sortedOrders.length > RECENT_LIMIT;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Unable to load dashboard</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={refreshData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header Section — premium gradient with decorative blobs */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="absolute -top-32 -left-24 w-96 h-96 rounded-full bg-blue-400/30 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-24 w-96 h-96 rounded-full bg-purple-400/40 blur-3xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.05] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 py-10 md:py-14">
          <div className="flex items-start justify-between gap-6 flex-col lg:flex-row">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg shadow-black/10 ring-1 ring-white/20">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-2xl object-cover" />
                  ) : (
                    <User className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight">Welcome back, {user?.name}!</h1>
                  <p className="text-sm text-white/75 mt-0.5">
                    Member since {new Date(user?.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <p className="text-white/85 max-w-2xl text-sm md:text-base">
                Manage your orders, track shipments, and discover new products all in one place.
              </p>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={refreshData}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-full text-xs font-bold transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <Link
                to="/products"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-blue-600 hover:bg-slate-50 rounded-full text-xs font-bold shadow-lg shadow-black/10 transition-all hover:-translate-y-0.5 hover:scale-105"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                Start Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8 md:py-10">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-8">
          {getStatsCards().map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-lg bg-${stat.color}-100 flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 text-${stat.color}-600`} />
                  </div>
                  <div className={`flex items-center gap-1 text-sm ${
                    stat.changeType === 'increase' ? 'text-green-600' : 
                    stat.changeType === 'decrease' ? 'text-red-600' : 'text-gray-600'
                  }`}>
                    {stat.changeType === 'increase' && <TrendingUp className="w-4 h-4" />}
                    {stat.changeType === 'decrease' && <TrendingUp className="w-4 h-4 rotate-180" />}
                    {stat.change}
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-sm text-gray-600 mt-1">{stat.title}</div>
              </div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Quick Actions</h2>
            <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
              View All <ChevronRight className="w-4 h-4 inline" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickActions.map((action, index) => {
              const Icon = action.Icon;
              return (
                <Link
                  key={index}
                  to={action.to}
                  className="group bg-white rounded-xl border border-gray-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all relative overflow-hidden"
                >
                  {action.badge && (
                    <span className="absolute top-3 right-3 px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                      {action.badge}
                    </span>
                  )}
                  <div className={`w-12 h-12 rounded-lg bg-${action.color}-100 flex items-center justify-center mb-4`}>
                    <Icon className={`w-6 h-6 text-${action.color}-600`} />
                  </div>
                  <div className="font-semibold text-gray-900 text-lg mb-2">{action.title}</div>
                  <div className="text-sm text-gray-600 mb-4">{action.description}</div>
                  <div className={`text-${action.color}-600 text-sm font-medium inline-flex items-center gap-2 group-hover:gap-3 transition-all`}>
                    Get Started <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Pending reviews banner — shown when the customer has completed/delivered
            items they haven't rated yet. Links to the first such order so they
            can leave reviews directly from order tracking. */}
        {pendingReviewSkuCount > 0 && (
          <div className="mb-8 rounded-2xl p-5 bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
              <Star className="w-7 h-7 fill-white text-white" />
            </div>
            <div className="flex-1">
              <p className="font-black text-lg">
                {pendingReviewSkuCount === 1
                  ? '1 item waiting for your review'
                  : `${pendingReviewSkuCount} items waiting for your review`}
              </p>
              <p className="text-sm text-white/90 mt-0.5">
                Your feedback helps other customers and our production team improve.
              </p>
            </div>
            <Link
              to={`/order-tracking/${pendingReviewOrders[0]?.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-amber-700 font-bold hover:bg-amber-50"
            >
              Leave reviews <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Recent Orders — Shopee/Lazada-style cards using the shared OrderCard */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-xl font-black text-slate-900 inline-flex items-center gap-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    Recent Orders
                  </h2>
                  <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-bold text-blue-700 hover:text-blue-800 hover:underline">
                    View all orders <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>

              <div className="p-5 space-y-3">
                {filteredOrders.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center mb-3">
                      <Package className="w-7 h-7 text-blue-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-700">No orders yet</p>
                    <p className="text-xs text-slate-500 mt-1">When you place an order, it shows up here.</p>
                    <Link
                      to="/products"
                      className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-md shadow-blue-200 hover:shadow-lg"
                    >
                      <ShoppingCart className="w-4 h-4" /> Place your first order
                    </Link>
                  </div>
                ) : (
                  filteredOrders.slice(0, 3).map((order: any) => (
                    <OrderCard key={order.id} order={order} />
                  ))
                )}
              </div>

            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Activity Feed */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {activities.slice(0, 5).map((activity) => {
                  const ActivityIcon = getActivityIcon(activity);
                  return (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        activity.status === 'delivered' || activity.status === 'completed' ? 'bg-green-100' :
                        activity.status === 'shipped' ? 'bg-blue-100' :
                        activity.status === 'processing' ? 'bg-yellow-100' :
                        'bg-gray-100'
                      }`}>
                        <ActivityIcon className={`w-4 h-4 ${
                          activity.status === 'delivered' || activity.status === 'completed' ? 'text-green-600' :
                          activity.status === 'shipped' ? 'text-blue-600' :
                          activity.status === 'processing' ? 'text-yellow-600' :
                          'text-gray-600'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-900">{activity.title}</p>
                        <p className="text-xs text-gray-500">{activity.description}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(activity.date).toLocaleDateString()} • {new Date(activity.date).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
                
                {activities.length === 0 && (
                  <div className="text-center py-4">
                    <Activity className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">No recent activity</p>
                  </div>
                )}
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl text-white p-6">
              <h3 className="font-semibold mb-3">Recommended for You</h3>
              <p className="text-sm text-purple-100 mb-4">
                {orders.length > 0 
                  ? 'Based on your order history, you might like these products'
                  : 'Start exploring our collection of customizable products'
                }
              </p>
              <Link
                to="/products"
                className="w-full bg-white text-purple-600 hover:bg-purple-50 rounded-lg py-2 font-medium transition-colors inline-block text-center"
              >
                {orders.length > 0 ? 'Explore Recommendations' : 'Browse Products'}
              </Link>
            </div>

            {/* Support */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Need Help?</h3>
              <div className="space-y-3">
                <Link
                  to="/contact"
                  className="flex items-center gap-3 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div className="text-sm">Customer Support</div>
                </Link>
                
                <Link
                  to="/faq"
                  className="flex items-center gap-3 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <HelpCircle className="w-4 h-4" />
                  </div>
                  <div className="text-sm">FAQ</div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
