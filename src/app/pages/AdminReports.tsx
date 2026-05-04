import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Package, Clock, Calendar, Download, DollarSign, ShoppingCart, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { apiRequest } from '../api';

interface OrderAnalytics {
  period: string;
  dateRange: { start: string; end: string };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
  };
  statusBreakdown: Record<string, number>;
  dailyData: Array<{ date: string; orders: number; revenue: number }>;
  topProducts: Array<{ name: string; count: number }>;
}

interface InventoryAnalytics {
  summary: {
    totalProducts: number;
    totalStock: number;
    totalValue: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  categories: Array<{ name: string; count: number; stock: number; value: number }>;
  lowStock: Array<{ id: string; name: string; category: string; stock: number; minStock: number }>;
  outOfStock: Array<{ id: string; name: string; category: string }>;
}

interface OperationalAnalytics {
  turnaroundTime: {
    averageHours: number;
    averageDays: number;
    sampleSize: number;
  };
  productionPipeline: Record<string, number>;
  weeklyComparison: {
    thisWeek: number;
    lastWeek: number;
    changePercent: number;
  };
}

interface DashboardSummary {
  today: { orders: number; revenue: number };
  pendingOrders: number;
  lowStockAlert: number;
  monthlyRevenue: number;
}

export function AdminReports() {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'inventory' | 'operational'>('overview');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [orderAnalytics, setOrderAnalytics] = useState<OrderAnalytics | null>(null);
  const [inventoryAnalytics, setInventoryAnalytics] = useState<InventoryAnalytics | null>(null);
  const [operationalAnalytics, setOperationalAnalytics] = useState<OperationalAnalytics | null>(null);

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [summaryRes, ordersRes, inventoryRes, operationalRes] = await Promise.all([
        apiRequest('/analytics/summary'),
        apiRequest(`/analytics/orders?period=${period}`),
        apiRequest('/analytics/inventory'),
        apiRequest('/analytics/operational')
      ]);

      setSummary(summaryRes);
      setOrderAnalytics(ordersRes);
      setInventoryAnalytics(inventoryRes);
      setOperationalAnalytics(operationalRes);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => row[h]).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Today's Orders</p>
                <p className="text-2xl font-bold text-gray-900">{summary?.today.orders || 0}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Today's Revenue</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(summary?.today.revenue || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Orders</p>
                <p className="text-2xl font-bold text-orange-600">{summary?.pendingOrders || 0}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Monthly Revenue</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(summary?.monthlyRevenue || 0)}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {summary && summary.lowStockAlert > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          <div>
            <p className="font-medium text-yellow-800">Low Stock Alert</p>
            <p className="text-sm text-yellow-700">{summary.lowStockAlert} products are running low on inventory.</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-auto"
            onClick={() => setActiveTab('inventory')}
          >
            View Inventory
          </Button>
        </div>
      )}

      {/* Weekly Comparison */}
      {operationalAnalytics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly Order Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-sm text-gray-600">Last Week</p>
                <p className="text-3xl font-bold text-gray-900">{operationalAnalytics.weeklyComparison.lastWeek}</p>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <TrendingUp className={`w-5 h-5 ${operationalAnalytics.weeklyComparison.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                  <span className={`font-medium ${operationalAnalytics.weeklyComparison.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {operationalAnalytics.weeklyComparison.changePercent >= 0 ? '+' : ''}{operationalAnalytics.weeklyComparison.changePercent}%
                  </span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600">This Week</p>
                <p className="text-3xl font-bold text-blue-600">{operationalAnalytics.weeklyComparison.thisWeek}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderOrderReports = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Order Reports</h3>
        <div className="flex items-center gap-4">
          <select 
            value={period} 
            onChange={(e) => setPeriod(e.target.value as any)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => orderAnalytics && exportToCSV(orderAnalytics.dailyData, 'order_report')}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {orderAnalytics && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-600">Total Orders</p>
                <p className="text-3xl font-bold text-gray-900">{orderAnalytics.summary.totalOrders}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-600">Total Revenue</p>
                <p className="text-3xl font-bold text-green-600">{formatCurrency(orderAnalytics.summary.totalRevenue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-600">Average Order Value</p>
                <p className="text-3xl font-bold text-blue-600">{formatCurrency(orderAnalytics.summary.averageOrderValue)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(orderAnalytics.statusBreakdown).map(([status, count]) => (
                  <div key={status} className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 capitalize">{status.replace(/_/g, ' ')}</p>
                    <p className="text-2xl font-bold text-gray-900">{count}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top Selling Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {orderAnalytics.topProducts.map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium text-blue-600">
                        {index + 1}
                      </span>
                      <span className="font-medium">{product.name}</span>
                    </div>
                    <span className="text-gray-600">{product.count} sold</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

  const renderInventoryReports = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Inventory Reports</h3>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => inventoryAnalytics && exportToCSV(inventoryAnalytics.categories, 'inventory_report')}
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {inventoryAnalytics && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-600">Total Products</p>
                <p className="text-3xl font-bold text-gray-900">{inventoryAnalytics.summary.totalProducts}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-600">Total Stock</p>
                <p className="text-3xl font-bold text-blue-600">{inventoryAnalytics.summary.totalStock}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-gray-600">Inventory Value</p>
                <p className="text-3xl font-bold text-green-600">{formatCurrency(inventoryAnalytics.summary.totalValue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-red-600">Low Stock Alert</p>
                <p className="text-3xl font-bold text-red-600">{inventoryAnalytics.summary.lowStockCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* Category Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Inventory by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Category</th>
                      <th className="text-center py-3 px-4">Products</th>
                      <th className="text-center py-3 px-4">Total Stock</th>
                      <th className="text-right py-3 px-4">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryAnalytics.categories.map((cat, index) => (
                      <tr key={index} className="border-b last:border-0">
                        <td className="py-3 px-4 font-medium">{cat.name}</td>
                        <td className="py-3 px-4 text-center">{cat.count}</td>
                        <td className="py-3 px-4 text-center">{cat.stock}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(cat.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Low Stock Items */}
          {inventoryAnalytics.lowStock.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-orange-600">Low Stock Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">Product</th>
                        <th className="text-center py-3 px-4">Category</th>
                        <th className="text-center py-3 px-4">Current Stock</th>
                        <th className="text-center py-3 px-4">Min Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryAnalytics.lowStock.map((item) => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="py-3 px-4 font-medium">{item.name}</td>
                          <td className="py-3 px-4 text-center">{item.category}</td>
                          <td className="py-3 px-4 text-center text-orange-600 font-medium">{item.stock}</td>
                          <td className="py-3 px-4 text-center">{item.minStock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Out of Stock Items */}
          {inventoryAnalytics.outOfStock.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-red-600">Out of Stock Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {inventoryAnalytics.outOfStock.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-sm text-gray-600">{item.category}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );

  const renderOperationalReports = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Operational Analytics</h3>

      {operationalAnalytics && (
        <>
          {/* Turnaround Time */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Order Turnaround Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600">Average Turnaround</p>
                  <p className="text-4xl font-bold text-blue-600">{operationalAnalytics.turnaroundTime.averageDays}</p>
                  <p className="text-sm text-gray-500">days</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">In Hours</p>
                  <p className="text-4xl font-bold text-gray-900">{operationalAnalytics.turnaroundTime.averageHours}</p>
                  <p className="text-sm text-gray-500">hours</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Sample Size</p>
                  <p className="text-4xl font-bold text-gray-900">{operationalAnalytics.turnaroundTime.sampleSize}</p>
                  <p className="text-sm text-gray-500">completed orders</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Production Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Production Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(operationalAnalytics.productionPipeline)
                  .filter(([_, count]) => count > 0)
                  .map(([status, count]) => (
                    <div key={status} className="bg-gray-50 rounded-lg p-4 text-center">
                      <p className="text-sm text-gray-600 capitalize">{status.replace(/_/g, ' ')}</p>
                      <p className="text-2xl font-bold text-gray-900">{count}</p>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="text-gray-600">View comprehensive analytics and generate reports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'orders', label: 'Order Reports', icon: ShoppingCart },
          { id: 'inventory', label: 'Inventory', icon: Package },
          { id: 'operational', label: 'Operational', icon: TrendingUp }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as any)}
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors border-b-2 -mb-[2px] ${
              activeTab === id 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'orders' && renderOrderReports()}
      {activeTab === 'inventory' && renderInventoryReports()}
      {activeTab === 'operational' && renderOperationalReports()}
    </div>
  );
}
