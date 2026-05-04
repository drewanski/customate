import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { CheckCircle2, Loader2, Package, Truck, CreditCard, Calendar } from 'lucide-react';
import { apiRequest } from '../api';
import { useCart } from '../hooks/useCart';
import { formatPeso } from '../utils/format';

export function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [loading, setLoading] = useState(true);
  const [orderStatus, setOrderStatus] = useState<any>(null);
  const [error, setError] = useState('');
  const [cartCleared, setCartCleared] = useState(false);

  const orderId = searchParams.get('orderId');
  const method = searchParams.get('method');

  useEffect(() => {
    let pollCount = 0;
    const maxPolls = 10; // Poll up to 10 times (20 seconds total)
    let intervalId: NodeJS.Timeout;

    const checkPaymentStatus = async () => {
      if (!orderId) {
        setError('No order ID provided');
        setLoading(false);
        return;
      }

      try {
        // Fetch full order details
        const order = await apiRequest(`/orders/${orderId}`);
        setOrderStatus(order);
        
        // Clear cart if payment is successful and not already cleared
        if ((order.paymentStatus === 'paid' || order.paymentStatus === 'partial') && !cartCleared) {
          clearCart();
          setCartCleared(true);
          console.log('Cart cleared after successful payment');
        }

        // Stop polling if payment confirmed or after max attempts
        pollCount++;
        if (order.paymentStatus === 'paid' || order.paymentStatus === 'partial' || pollCount >= maxPolls) {
          setLoading(false);
          clearInterval(intervalId);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to verify payment');
        setLoading(false);
        clearInterval(intervalId);
      }
    };

    // Initial check after 2 seconds, then poll every 2 seconds
    const initialTimer = setTimeout(() => {
      checkPaymentStatus();
      intervalId = setInterval(checkPaymentStatus, 2000);
    }, 2000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    };
  }, [orderId, clearCart, cartCleared]);

  const handleViewOrder = () => {
    navigate(`/order-tracking/${orderId}`);
  };

  const handleContinueShopping = () => {
    navigate('/products');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="py-12 text-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900">Verifying Payment...</h2>
            <p className="text-gray-500 mt-2">
              Please wait while we confirm your {method === 'gcash' ? 'GCash' : method === 'maya' ? 'Maya' : 'payment'}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-red-600">!</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Payment Verification Failed</h2>
            <p className="text-gray-500 mt-2">{error}</p>
            <p className="text-sm text-gray-400 mt-4">
              Don't worry - if you completed the payment, our team will verify it manually.
            </p>
            <div className="mt-6 space-y-3">
              {orderId && (
                <Button onClick={handleViewOrder} className="w-full">
                  Check Order Status
                </Button>
              )}
              <Button variant="outline" onClick={handleContinueShopping} className="w-full">
                Continue Shopping
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = orderStatus?.paymentStatus === 'paid' || orderStatus?.paymentStatus === 'partial';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="py-12 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Payment {isPaid ? 'Successful!' : 'Processing'}
          </h1>
          
          <p className="text-gray-600 mb-6">
            {isPaid 
              ? `Your ${method === 'gcash' ? 'GCash' : method === 'maya' ? 'Maya' : 'payment'} has been confirmed.`
              : 'Your payment is being processed. You\'ll receive confirmation shortly.'}
          </p>

          {orderStatus && (
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left space-y-4">
              {/* Order Summary */}
              <div className="border-b border-gray-200 pb-3">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Order Summary
                </h3>
                <div className="space-y-2">
                  {orderStatus.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-600">{item.name} x{item.quantity}</span>
                      <span className="font-medium">{formatPeso(item.quantity * item.unitPrice)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-200 mt-2 pt-2 flex justify-between font-semibold">
                  <span className="text-gray-900">Total</span>
                  <span className="text-blue-600">{formatPeso(orderStatus.totalPrice)}</span>
                </div>
              </div>

              {/* Shipping Details */}
              <div className="border-b border-gray-200 pb-3">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Truck className="w-4 h-4" />
                  Shipping Details
                </h3>
                <p className="text-sm text-gray-600 font-medium">{orderStatus.recipientName || orderStatus.customerName}</p>
                <p className="text-sm text-gray-600">{orderStatus.shippingAddress}</p>
                {orderStatus.contactPhone && (
                  <p className="text-sm text-gray-600">{orderStatus.contactPhone}</p>
                )}
              </div>

              {/* Payment Info */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Payment Information
                </h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Order ID</span>
                    <span className="font-medium text-gray-900">#{orderId?.slice(-6).toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Payment Method</span>
                    <span className="font-medium text-gray-900 capitalize">
                      {method === 'gcash' ? 'GCash' : method === 'paymaya' ? 'Maya' : orderStatus.paymentMethod}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Payment Status</span>
                    <span className={`font-medium ${isPaid ? 'text-green-600' : 'text-yellow-600'}`}>
                      {orderStatus.paymentStatus?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Amount Paid</span>
                    <span className="font-medium text-gray-900">
                      {formatPeso(orderStatus.paidAmount || 0)}
                    </span>
                  </div>
                  {(orderStatus.paymongoPaymentId || orderStatus.paymentDetails?.paymongoPaymentId) && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Transaction ID</span>
                      <span className="font-medium text-gray-900 text-xs">
                        {(orderStatus.paymongoPaymentId || orderStatus.paymentDetails?.paymongoPaymentId)?.slice(-12)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Button onClick={handleViewOrder} className="w-full">
              View Order Details
            </Button>
            <Button variant="outline" onClick={handleContinueShopping} className="w-full">
              Continue Shopping
            </Button>
          </div>

          <p className="text-xs text-gray-400 mt-6">
            A confirmation email has been sent to your registered email address.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
