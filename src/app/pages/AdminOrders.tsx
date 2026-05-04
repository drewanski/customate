import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Table, TableColumn } from '../components/Table';
import { Badge } from '../components/Badge';
import { Select } from '../components/Select';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { apiRequest } from '../api';
import { Order } from '../data/types';
import { Search, Filter, Eye, Clock, CheckCircle, XCircle, Package, Truck, DollarSign, TrendingUp, Users, Printer, CreditCard } from 'lucide-react';
import { formatPeso, shortOrderCode } from '../utils/format';

export function AdminOrders() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal for status updates
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [newStatus, setNewStatus] = useState('');

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      const qs = params.toString();

      const data = await apiRequest(qs ? `/orders?${qs}` : '/orders');
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, searchTerm]);

  const handleUpdateStatus = async () => {
    if (!selectedOrder || !newStatus) return;
    try {
      await apiRequest(`/orders/${selectedOrder.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      setIsStatusModalOpen(false);
      fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const columns: TableColumn<any>[] = [
    {
      key: 'id',
      header: 'Order',
      width: '120px',
      render: (order) => (
        <span className="font-mono font-bold text-blue-600">#{shortOrderCode(order.id)}</span>
      )
    },
    { 
      key: 'customerName', 
      header: 'Customer',
      render: (order) => (
        <div>
          <p className="font-medium text-gray-900">{order.customerName}</p>
          <p className="text-[10px] text-gray-500 uppercase">{order.customerEmail}</p>
        </div>
      )
    },
    {
      key: 'totalPrice',
      header: 'Amount',
      render: (order) => <span className="font-bold">{formatPeso(order.totalPrice || 0)}</span>
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (order) => {
        const variants: Record<string, any> = {
          pending: 'warning',
          partial: 'info',
          paid: 'success',
          failed: 'danger'
        };
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={variants[order.paymentStatus] || 'default'}>
              {order.paymentStatus}
            </Badge>
            <span className="text-[10px] text-gray-500">
              {order.paymentMethod === 'cod' ? 'COD' : 
               order.paymentMethod === 'gcash' ? 'GCash' :
               order.paymentMethod === 'paymaya' ? 'Maya' : 'Bank'}
            </span>
          </div>
        );
      }
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => {
        const variants: Record<string, any> = {
          pending: 'warning',
          approved: 'info',
          in_production: 'info',
          ready: 'info',
          completed: 'success',
          rejected: 'danger'
        };
        return (
          <Badge variant={variants[order.status] || 'default'}>
            {order.status.replace('_', ' ')}
          </Badge>
        );
      }
    },
    {
      key: 'createdAt',
      header: 'Date',
      render: (order) => (
        <div className="flex items-center gap-1.5 text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          {new Date(order.createdAt).toLocaleDateString()}
        </div>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (order) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            setSelectedOrder(order);
            setNewStatus(order.status);
            setIsStatusModalOpen(true);
          }}>
            Status
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/orders/${order.id}`)}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
        </div>
      )
    }
  ];
  
  // Calculate order statistics
  const orderStats = useMemo(() => {
    const stats = {
      total: orders.length,
      pending: orders.filter(o => o.status === 'pending').length,
      inProduction: orders.filter(o => o.status === 'in_production').length,
      completed: orders.filter(o => o.status === 'completed').length,
      totalRevenue: orders.reduce((sum, o) => sum + (o.totalPrice || 0), 0),
      paid: orders.filter(o => o.paymentStatus === 'paid').length,
    };
    return stats;
  }, [orders]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Orders</h1>
        <p className="text-gray-500">Manage customer orders and track fulfillment status.</p>
      </div>

      {/* Order Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{orderStats.total}</p>
              <p className="text-xs text-gray-500">Total Orders</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{orderStats.pending}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Printer className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{orderStats.inProduction}</p>
              <p className="text-xs text-gray-500">In Production</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{orderStats.completed}</p>
              <p className="text-xs text-gray-500">Completed</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{orderStats.paid}</p>
              <p className="text-xs text-gray-500">Paid Orders</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatPeso(orderStats.totalRevenue)}</p>
              <p className="text-xs text-gray-500">Total Revenue</p>
            </div>
          </div>
        </div>
      </div>
      
      <Card className="mb-6 border-0 shadow-sm bg-gray-50/50">
        <CardContent className="p-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by ID, customer name, or email..."
                className="pl-10"
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Select
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'in_production', label: 'In Production' },
                  { value: 'ready', label: 'Ready for Pickup' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
                value={statusFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-0 shadow-xl shadow-gray-200/50 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Loading orders...</p>
          </div>
        ) : (
          <Table columns={columns} data={orders} />
        )}
      </Card>

      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Update Order Status"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsStatusModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateStatus}>Update Status</Button>
          </>
        }
      >
        {selectedOrder && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Order Details</p>
              <p className="font-bold text-gray-900">#{shortOrderCode(selectedOrder.id)}</p>
              <p className="text-sm text-gray-600">{selectedOrder.customerName}</p>
              <p className="text-sm text-gray-600">{selectedOrder.customerEmail}</p>
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500">Amount: <span className="font-semibold text-blue-600">{formatPeso(selectedOrder.totalPrice || 0)}</span></p>
                <p className="text-xs text-gray-500">Items: <span className="font-semibold">{selectedOrder.totalQty || (selectedOrder.items?.length || 0)}</span></p>
                <p className="text-xs text-gray-500">Current Status: <span className="font-semibold capitalize">{selectedOrder.status?.replace('_', ' ')}</span></p>
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">New Status</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'pending', label: 'Pending', icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
                  { id: 'approved', label: 'Approved', icon: CheckCircle, color: 'text-blue-600 bg-blue-50' },
                  { id: 'in_production', label: 'Production', icon: Package, color: 'text-purple-600 bg-purple-50' },
                  { id: 'ready', label: 'Ready', icon: Truck, color: 'text-indigo-600 bg-indigo-50' },
                  { id: 'completed', label: 'Completed', icon: CheckCircle, color: 'text-green-600 bg-green-50' },
                  { id: 'rejected', label: 'Rejected', icon: XCircle, color: 'text-red-600 bg-red-50' },
                ].map((status) => (
                  <button
                    key={status.id}
                    onClick={() => setNewStatus(status.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                      newStatus === status.id 
                        ? 'border-blue-600 bg-blue-50' 
                        : 'border-gray-100 hover:border-gray-200 bg-white'
                    }`}
                  >
                    <status.icon className={`w-4 h-4 ${newStatus === status.id ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className={`text-xs font-bold ${newStatus === status.id ? 'text-blue-700' : 'text-gray-600'}`}>
                      {status.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
