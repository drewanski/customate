import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Stepper } from '../components/Stepper';
import { Badge } from '../components/Badge';
import {
  Package, CheckCircle, Clock, Truck, CreditCard, User, Printer, Sparkles,
  AlertTriangle, MessageCircle, XCircle, Store, Send,
} from 'lucide-react';
import { apiRequest, customerCancelOrder, fileReturn, getOrderChat, sendOrderChatMessage } from '../api';
import { formatPeso, shortOrderCode } from '../utils/format';
import { useAuth } from '../hooks/useAuth';

// Panel revision #11 — pipeline branches based on delivery method:
//   delivery: Received → Approved → In Production → Ready → Out for delivery → Completed
//   pickup:   Received → Approved → In Production → Ready → For pickup       → Completed
const STEPS_DELIVERY = ['Received', 'Approved', 'In Production', 'Ready', 'Out for delivery', 'Completed'];
const STEPS_PICKUP   = ['Received', 'Approved', 'In Production', 'Ready', 'For pickup',        'Completed'];

// Panel revision #10 — these statuses lock customer-side cancellation.
const CUSTOMER_CANCEL_LOCKED = new Set([
  'in_production', 'ready', 'out_for_delivery', 'for_pickup',
  'completed', 'shipped', 'delivered', 'cancelled', 'rejected', 'refunded',
]);

function statusToStep(status: string, deliveryMethod: 'delivery' | 'pickup') {
  const map: Record<string, number> = {
    pending: 0,
    approved: 1,
    in_production: 2,
    ready: 3,
    out_for_delivery: 4,
    for_pickup: 4,
    shipped: 4,
    delivered: 4,
    completed: 5,
    rejected: 0,
    cancelled: 0,
    refunded: 0,
  };
  return map[status] ?? 0;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  in_production: 'In Production',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  for_pickup: 'Ready for pickup',
  completed: 'Completed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const BADGE: Record<string, any> = {
  pending: 'warning',
  approved: 'success',
  in_production: 'info',
  ready: 'info',
  out_for_delivery: 'info',
  for_pickup: 'info',
  completed: 'success',
  shipped: 'info',
  delivered: 'success',
  rejected: 'danger',
  cancelled: 'danger',
  refunded: 'danger',
};

export function OrderTracking() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const isAdminView = user?.role === 'admin' && location.pathname.startsWith('/admin');

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  // Return modal
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('damaged');
  const [returnDescription, setReturnDescription] = useState('');
  const [returnPhotos, setReturnPhotos] = useState<string[]>([]);
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnMessage, setReturnMessage] = useState('');

  // Chat widget
  const [chatOpen, setChatOpen] = useState(false);
  const [chat, setChat] = useState<any[]>([]);
  const [chatBody, setChatBody] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

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

  // Poll chat thread when open. Simple 4-sec poll keeps it light.
  useEffect(() => {
    if (!chatOpen || !order?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const msgs = await getOrderChat(order.id);
        if (!cancelled) setChat(msgs || []);
      } catch { /* non-fatal */ }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [chatOpen, order?.id]);

  const deliveryMethod: 'delivery' | 'pickup' = order?.deliveryMethod === 'pickup' ? 'pickup' : 'delivery';
  const steps = useMemo(
    () => (deliveryMethod === 'pickup' ? STEPS_PICKUP : STEPS_DELIVERY).map((label, i) => ({
      id: String(i + 1),
      label,
      description: i === 0 && order?.createdAt ? new Date(order.createdAt).toLocaleString() : '',
    })),
    [deliveryMethod, order?.createdAt]
  );
  const currentStep = useMemo(() => statusToStep(order?.status || 'pending', deliveryMethod), [order?.status, deliveryMethod]);

  const cancelLocked = order && CUSTOMER_CANCEL_LOCKED.has(order.status);
  const canFileReturn = order && ['completed', 'delivered', 'shipped'].includes(order.status);

  const onConfirmCancel = async () => {
    if (!cancelReason.trim()) return;
    setCancelBusy(true);
    try {
      const updated = await customerCancelOrder(order.id, cancelReason.trim());
      setOrder(updated);
      setCancelOpen(false);
      setCancelReason('');
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel');
    } finally {
      setCancelBusy(false);
    }
  };

  const onSubmitReturn = async () => {
    if (!returnDescription.trim()) return;
    setReturnBusy(true);
    setReturnMessage('');
    try {
      await fileReturn({
        orderId: order.id,
        reason: returnReason,
        description: returnDescription.trim(),
        photos: returnPhotos,
      });
      setReturnMessage('Return request submitted — we\'ll review it shortly.');
      setReturnDescription('');
      setReturnPhotos([]);
    } catch (err: any) {
      setReturnMessage(err?.message || 'Failed to submit return');
    } finally {
      setReturnBusy(false);
    }
  };

  const onChatSend = async () => {
    if (!chatBody.trim() || !order?.id) return;
    setChatBusy(true);
    try {
      const m = await sendOrderChatMessage(order.id, chatBody.trim());
      setChat((prev) => [...prev, m]);
      setChatBody('');
    } catch (err: any) {
      alert(err?.message || 'Failed to send');
    } finally {
      setChatBusy(false);
    }
  };

  const onPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4);
    Promise.all(
      files.map((f) => new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(f);
      })),
    ).then((urls) => setReturnPhotos((prev) => [...prev, ...urls].slice(0, 6)));
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p>Loading...</p></div>;
  }
  if (error) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-red-600">{error}</p></div>;
  }
  if (!order) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><p className="text-gray-600">No orders found.</p></div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Order Tracking</h1>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Order #{shortOrderCode(order.id)}</CardTitle>
            <Badge variant={BADGE[order.status] || 'info'}>{STATUS_LABEL[order.status] || order.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Stepper steps={steps} currentStep={currentStep} />

          {/* Rejection / cancellation banner (panel revision #12) */}
          {(order.status === 'rejected' || order.status === 'cancelled') && (order.rejectionReason || order.cancellationReason) && (
            <div className="mt-5 p-4 rounded-xl border border-rose-200 bg-rose-50 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-rose-900 text-sm">
                  {order.status === 'rejected' ? 'Order rejected by the store' : 'Order cancelled'}
                </p>
                <p className="text-rose-800 text-sm mt-1">
                  {order.rejectionReason || order.cancellationReason}
                </p>
              </div>
            </div>
          )}

          {/* Cancel CTA + lock messaging (panel revision #10) */}
          {!isAdminView && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {!cancelLocked ? (
                <button
                  onClick={() => setCancelOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-bold text-sm"
                >
                  <XCircle className="w-4 h-4" /> Cancel order
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  This order is now {STATUS_LABEL[order.status]} — cancellation isn't possible at this stage.
                </div>
              )}
              <button
                onClick={() => setChatOpen((v) => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold text-sm"
              >
                <MessageCircle className="w-4 h-4" /> {chatOpen ? 'Hide chat' : 'Message the store'}
              </button>
              {canFileReturn && (
                <button
                  onClick={() => setReturnOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 font-bold text-sm"
                >
                  <Package className="w-4 h-4" /> File a return / damage report
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Items</h4>
                {isAdminView &&
                  (order.items || []).some(
                    (it: any) => it.isCustomized || it.customization?.previewImage,
                  ) && (
                    <Link
                      to={`/admin/orders/${orderId}/design`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800"
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
                      <div className="w-16 h-16 bg-blue-100 rounded flex items-center justify-center overflow-hidden flex-shrink-0 relative group">
                        {hasPreview ? (
                          <a href={c.previewImage} target="_blank" rel="noopener noreferrer" className="block w-full h-full" title="Open design at full size">
                            <img src={c.previewImage} alt="Design" className="w-full h-full object-cover" />
                          </a>
                        ) : (
                          <Package className="w-8 h-8 text-blue-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium">{it.name}</p>
                          {isCustom && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-black uppercase tracking-wider">
                              <Sparkles className="w-2.5 h-2.5" />
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">Qty: {it.quantity} × {formatPeso(it.unitPrice)}</p>
                        {c && (
                          <div className="text-xs text-gray-500 mt-1">
                            {c.shirtType && <span>Type: {c.shirtType} | </span>}
                            {c.size && <span>Size: {c.size} | </span>}
                            {c.color && <span>Color: {c.color} | </span>}
                            {c.placement && <span>Placement: {c.placement}</span>}
                            {c.text && <p>Text: "{c.text}"</p>}
                          </div>
                        )}
                        {hasPreview && (
                          <a
                            href={c.previewImage}
                            download={`design-${order.id?.slice(-6)}-${idx + 1}.png`}
                            className="inline-flex items-center gap-1 mt-1.5 px-2 py-1 rounded-md text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition"
                          >
                            <Printer className="w-3 h-3" /> Download design
                          </a>
                        )}
                      </div>
                      <div className="font-medium">{formatPeso(it.quantity * it.unitPrice)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" /> Recipient
                </h4>
                <p className="text-gray-600 text-sm">{order.recipientName || order.customerName}</p>
                {order.contactPhone && <p className="text-gray-600 text-sm">{order.contactPhone}</p>}
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  {deliveryMethod === 'pickup' ? <Store className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                  {deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping Address'}
                </h4>
                <p className="text-gray-600 text-sm whitespace-pre-line">
                  {deliveryMethod === 'pickup' ? 'In-store pickup at Bryle Closet Printing Services' : order.shippingAddress}
                </p>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Payment
                </h4>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Method:</span>
                    <span className="capitalize">{order.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Status:</span>
                    <span className={`capitalize ${order.paymentStatus === 'paid' ? 'text-green-600' : 'text-yellow-600'}`}>{order.paymentStatus}</span>
                  </div>
                  {order.paidAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Paid:</span>
                      <span>{formatPeso(order.paidAmount)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t">
                <h4 className="font-medium text-gray-900 mb-2">Order Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal ({order.totalQty} items)</span>
                    <span>{formatPeso((order.subtotalBeforeDiscount || order.totalPrice) - (order.rushFeeAmount || 0))}</span>
                  </div>
                  {order.rushFeeAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Rush fee</span>
                      <span>+{formatPeso(order.rushFeeAmount)}</span>
                    </div>
                  )}
                  {order.discountAmount > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Discount {order.couponCode ? `(${order.couponCode})` : ''}</span>
                      <span>-{formatPeso(order.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">{deliveryMethod === 'pickup' ? 'Pickup' : 'Shipping'}</span>
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

      {/* Order chat (panel revision #14) */}
      {chatOpen && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Conversation with the store</CardTitle></CardHeader>
          <CardContent>
            <div className="h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              {chat.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-8">No messages yet. Say hi 👋</p>
              )}
              {chat.map((m) => (
                <div key={m._id} className={`flex ${m.fromRole === 'customer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.fromRole === 'customer' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                    <div className="text-xs opacity-80 mb-0.5">{m.fromName || m.fromRole}</div>
                    {m.body}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={chatBody}
                onChange={(e) => setChatBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onChatSend(); } }}
                placeholder="Write a message…"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={onChatSend}
                disabled={chatBusy || !chatBody.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Send
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Activity Timeline</CardTitle></CardHeader>
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
                <p className="font-medium">Current Status: {STATUS_LABEL[order.status] || order.status}</p>
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
                    ? (order.rejectionReason || 'This order was rejected. Please contact support if you need help.')
                    : order.status === 'cancelled'
                    ? (order.cancellationReason || 'This order was cancelled.')
                    : order.status === 'completed'
                    ? 'This order is completed. Thank you for choosing CustoMate!'
                    : order.status === 'out_for_delivery'
                    ? 'Your order is on its way!'
                    : order.status === 'for_pickup'
                    ? 'Your order is ready for pickup at the store.'
                    : order.status === 'ready'
                    ? deliveryMethod === 'pickup'
                      ? 'Production finished — we\'ll mark it ready for pickup shortly.'
                      : 'Production finished — your order is being prepared for delivery.'
                    : 'You can check back here anytime for updates.'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cancel-with-reason modal (panel revision #10/#12) */}
      {cancelOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setCancelOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Cancel this order?</h3>
              <p className="text-sm text-slate-500 mt-1">Tell us why so we can improve and our team understands what happened.</p>
            </div>
            <div className="p-5 space-y-3">
              <label className="text-sm font-bold text-slate-700">Reason</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="E.g., I changed my mind, found a similar product, etc."
                rows={4}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 pt-2">
                <button onClick={() => setCancelOpen(false)} className="flex-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Keep order</button>
                <button
                  onClick={onConfirmCancel}
                  disabled={cancelBusy || !cancelReason.trim()}
                  className="flex-1 px-4 py-2 rounded-xl bg-rose-600 text-white font-bold disabled:opacity-50"
                >
                  {cancelBusy ? 'Cancelling…' : 'Cancel order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return modal (panel revision #9) */}
      {returnOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setReturnOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">File a return / damage report</h3>
              <p className="text-sm text-slate-500 mt-1">We'll review it and respond within 1–2 business days.</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Reason</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="damaged">Damaged item</option>
                  <option value="wrong_print">Wrong print / design</option>
                  <option value="wrong_size">Wrong size</option>
                  <option value="wrong_item">Wrong item shipped</option>
                  <option value="quality_issue">Quality issue</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Describe what happened</label>
                <textarea
                  value={returnDescription}
                  onChange={(e) => setReturnDescription(e.target.value)}
                  rows={4}
                  placeholder="Please include any details that will help us decide."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1">Photos (optional)</label>
                <input type="file" accept="image/*" multiple onChange={onPhotoSelect} className="text-sm" />
                {returnPhotos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {returnPhotos.map((src, i) => (
                      <img key={i} src={src} className="w-16 h-16 rounded-lg object-cover border border-slate-200" alt="" />
                    ))}
                  </div>
                )}
              </div>
              {returnMessage && (
                <p className={`text-sm font-semibold ${returnMessage.startsWith('Return request submitted') ? 'text-emerald-700' : 'text-rose-700'}`}>{returnMessage}</p>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setReturnOpen(false)} className="flex-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold">Close</button>
                <button
                  onClick={onSubmitReturn}
                  disabled={returnBusy || !returnDescription.trim()}
                  className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50"
                >
                  {returnBusy ? 'Submitting…' : 'Submit return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
