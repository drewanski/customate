import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Badge } from '../components/Badge';
import { useEffect, useState, useMemo } from 'react';
import { apiRequest } from '../api';
import { Package, Clock, CheckCircle, AlertTriangle, CalendarDays } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPeso, shortOrderCode } from '../utils/format';
import { Calendar } from '../components/Calendar';
import { useNavigate } from 'react-router-dom';

export function AdminOverview() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'calendar'>('overview');
  
  useEffect(() => {
    apiRequest('/orders').then(setOrders);
    apiRequest('/inventory').then(setInventory);
  }, []);

  // Generate calendar events from orders
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

    orders.forEach(order => {
      // Order created date
      if (order.createdAt) {
        events.push({
          id: `${order.id}-created`,
          title: `Order #${shortOrderCode(order.id)}`,
          date: order.createdAt,
          type: 'order',
          status: order.status,
          orderId: order.id,
          customer: order.customerName
        });
      }

      // Production start (when order moves to in_production)
      if (order.status === 'in_production' || order.status === 'completed' || order.status === 'ready') {
        events.push({
          id: `${order.id}-production`,
          title: `Production: #${shortOrderCode(order.id)}`,
          date: order.updatedAt || order.createdAt,
          type: 'production',
          status: order.status,
          orderId: order.id,
          customer: order.customerName
        });
      }

      // Pickup/Delivery dates (when ready or completed)
      if (order.pickupDate || (order.status === 'ready' || order.status === 'completed')) {
        events.push({
          id: `${order.id}-pickup`,
          title: `Ready for Pickup: #${shortOrderCode(order.id)}`,
          date: order.pickupDate || order.updatedAt || order.createdAt,
          type: 'pickup',
          status: order.status,
          orderId: order.id,
          customer: order.customerName
        });
      }

      // Delivery date if available
      if (order.deliveryDate || order.estimatedDelivery) {
        events.push({
          id: `${order.id}-delivery`,
          title: `Delivery: #${shortOrderCode(order.id)}`,
          date: order.deliveryDate || order.estimatedDelivery,
          type: 'delivery',
          status: order.status,
          orderId: order.id,
          customer: order.customerName
        });
      }
    });

    return events;
  }, [orders]);

  const handleCalendarEventClick = (event: any) => {
    if (event.orderId) {
      navigate(`/admin/orders/${event.orderId}`);
    }
  };
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const inProductionOrders = orders.filter(o => o.status === 'in_production').length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;
  const lowStockItems = inventory.filter(i => i.quantity < i.minQuantity).length;
  
  const kpis = [
    {
      title: 'Pending Orders',
      value: pendingOrders,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    {
      title: 'In Production',
      value: inProductionOrders,
      icon: Package,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Completed',
      value: completedOrders,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Low Stock Alerts',
      value: lowStockItems,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    }
  ];
  
  const chartData = [
    { name: 'Mon', orders: 12 },
    { name: 'Tue', orders: 19 },
    { name: 'Wed', orders: 15 },
    { name: 'Thu', orders: 25 },
    { name: 'Fri', orders: 22 },
    { name: 'Sat', orders: 18 },
    { name: 'Sun', orders: 14 },
  ];
  
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'calendar'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            Calendar
          </button>
        </div>
      </div>

      {activeTab === 'calendar' ? (
        <Calendar
          events={calendarEvents}
          onEventClick={handleCalendarEventClick}
          className="mb-8"
        />
      ) : (
        <>
      
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        {kpis.map((kpi, index) => (
          <Card key={index}>
            <CardContent className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${kpi.bgColor}`}>
                <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-sm text-gray-600">{kpi.title}</p>
                <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Orders This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="orders" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {orders.slice(0, 4).map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">#{shortOrderCode(order.id)}</p>
                    <p className="text-sm text-gray-600">{order.customerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatPeso(order.totalAmount)}</p>
                    <Badge
                      variant={
                        order.status === 'completed' ? 'success' :
                        order.status === 'in_production' ? 'info' :
                        'warning'
                      }
                      size="sm"
                    >
                      {order.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Low Stock Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {inventory.filter(i => i.quantity < i.minQuantity).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{item.productName}</p>
                  <p className="text-sm text-gray-600">{item.size} - {item.color}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-red-600 font-medium">
                    {item.quantity} / {item.minQuantity} minimum
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
