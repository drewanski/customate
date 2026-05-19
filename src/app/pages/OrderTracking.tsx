import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Stepper } from '../components/Stepper';
import { Badge } from '../components/Badge';
import { Package, CheckCircle, Clock, Truck, CreditCard, User, Printer, Sparkles } from 'lucide-react';
import { apiRequest } from '../api';
import { formatPeso, shortOrderCode } from '../utils/format';
import { useAuth } from '../hooks/useAuth';

export function OrderTracking() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const isAdminView = user?.role === 'admin' && location.pathname.startsWith('/admin');
  const hasAnyCustomItem = false; // computed below from order.items
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        if (!orderId) {
          const my = await apiRequest('/orders/my');
          setOrder(my?.[0] || null);
          return;
        }
        const data = await apiRequest(`/orders/${orderId}`);
        setOrder(data);
      } catch (err: any) {
        setError(err?.message || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  const statusMeta = useMemo(() => {
    const status = order?.status || 'pending';
    const map: Record<string, { badge: any; currentStep: number; label: string }> = {
      pending: { badge: 'warning', currentStep: 0, label: 'Pending' },
      approved: { badge: 'success', currentStep: 1, label: 'Approved' },
      in_production: { badge: 'info', currentStep: 2, label: 'In Production' },
      ready: { badge: 'info', currentStep: 3, label: 'Ready' },
      completed: { badge: 'success', currentStep: 4, label: 'Completed' },
      rejected: { badge: 'danger', currentStep: 0, label: 'Rejected' }
    };
    return map[status] || map.pending;
  }, [order?.status]);

  const steps = useMemo(
    () => [
      { id: '1', label: 'Received', description: order?.createdAt ? new Date(order.createdAt).toLocaleString() : '' },
      { id: '2', label: 'Approved', description: '' },
      { id: '3', label: 'In Production', description: '' },
      { id: '4', label: 'Ready', description: '' },
      { id: '5', label: 'Completed', description: '' },
    ],
    [order?.createdAt]
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-gray-600">No orders found.</p>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Order Tracking</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Order #{shortOrderCode(order.id)}</CardTitle>
            <Badge variant={statusMeta.badge}>{statusMeta.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Stepper steps={steps} currentStep={statusMeta.currentStep} />
        </CardContent>
      </Card>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Order Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Items</h4>
                {/* Admin-only call-to-action when at least one item has a saved design.
                    The print sheet is generated server-side from the saved snapshot,
                    so the production team can reproduce exactly what the customer saw. */}
                {isAdminView &&
                  (order.items || []).some(
                    (it: any) => it.isCustomized || it.customization?.previewImage,
                  ) && (
                    <Link
                      to={`/admin/orders/${orderId}/design`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-slate-900 hover:bg-slate-800"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Design Sheet
                    </Link>
                  )}
              </div>
              <div className="space-y-2">
                {(order.items || []).map((it: any, idx: number) => {
                  const c = it.customization || {};
                  const hasPreview = !!c.previewImage;
                  const isCustom = !!c.isCustomized;
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      {/* Use the saved design preview as the thumbnail when available */}
                      <div className="w-16 h-16 bg-blue-100 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                        {hasPreview ? (
                          <img src={c.previewImage} alt="Design" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="w-8 h-8 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium">{it.name}</p>
                          {isCustom && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wider">
                              <Sparkles className="w-2.5 h-2.5" />
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">Qty: {it.quantity} × {formatPeso(it.unitPrice)}</p>
                        {c && (
                          <div className="text-xs text-gray-500 mt-1">
                            {c.size && <span>Size: {c.size} | </span>}
                            {c.color && <span>Color: {c.color} | </span>}
                            {c.placement && <span>Placement: {c.placement}</span>}
                            {c.text && <p>Text: "{c.text}"</p>}
                          </div>
                        )}
                      </div>
                      <div className="font-medium">{formatPeso(it.quantity * it.unitPrice)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-4">
              {/* Recipient Info */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Recipient
                </h4>
                <p className="text-gray-600 text-sm">{order.recipientName || order.customerName}</p>
                {order.contactPhone && <p className="text-gray-600 text-sm">{order.contactPhone}</p>}
              </div>

              {/* Shipping Address */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Shipping Address
                </h4>
                <p className="text-gray-600 text-sm whitespace-pre-line">{order.shippingAddress}</p>
              </div>

              {/* Payment Info */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Payment
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Method:</span>
                    <span className="capitalize">{order.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`capitalize ${order.paymentStatus === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>
                      {order.paymentStatus}
                    </span>
                  </div>
                  {order.paidAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Paid:</span>
                      <span>{formatPeso(order.paidAmount)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Summary */}
              <div className="pt-3 border-t">
                <h4 className="font-medium text-gray-900 mb-2">Order Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal ({order.totalQty} items)</span>
                    <span>{formatPeso(order.totalPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Shipping</span>
                    <span>Free</span>
                  </div>
                  <div className="flex justify-between font-medium pt-2 border-t">
                    <span>Total</span>
                    <span className="text-blue-600">{formatPeso(order.totalPrice)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
              </div>
              <div>
                <p className="font-medium">Order Placed</p>
                <p className="text-sm text-gray-600">We received your order and will process it soon.</p>
                <p className="text-xs text-gray-500 mt-1">{order.createdAt ? new Date(order.createdAt).toLocaleString() : ''}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
              </div>
              <div>
                <p className="font-medium">Current Status: {statusMeta.label}</p>
                <p className="text-sm text-gray-600">Last updated</p>
                <p className="text-xs text-gray-500 mt-1">{order.updatedAt ? new Date(order.updatedAt).toLocaleString() : ''}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <Package className="w-5 h-5 text-gray-400" />
                </div>
              </div>
              <div>
                <p className="font-medium text-gray-700">Next Steps</p>
                <p className="text-sm text-gray-600">
                  {order.status === 'rejected'
                    ? 'This order was rejected. Please contact support if you need help.'
                    : order.status === 'completed'
                    ? 'This order is completed. Thank you for choosing CustoMate!'
                    : 'You can check back here anytime for updates.'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
