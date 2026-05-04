import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { XCircle, ArrowLeft, RefreshCw } from 'lucide-react';

export function PaymentCancel() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const orderId = searchParams.get('orderId');

  const handleTryAgain = () => {
    if (orderId) {
      // Navigate back to order tracking to retry payment
      navigate(`/order-tracking/${orderId}`);
    } else {
      navigate('/checkout');
    }
  };

  const handleContactSupport = () => {
    // Could open a chat or navigate to contact page
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="py-12 text-center">
          <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-12 h-12 text-amber-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Payment Cancelled
          </h1>
          
          <p className="text-gray-600 mb-6">
            Your payment was not completed. Don't worry - no money has been charged.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-amber-800">
              <strong>Why did this happen?</strong>
            </p>
            <ul className="text-sm text-amber-700 mt-2 space-y-1 list-disc list-inside">
              <li>You closed the payment window</li>
              <li>The payment session expired</li>
              <li>There was an issue with your e-wallet or bank</li>
              <li>You clicked cancel in the payment app</li>
            </ul>
          </div>

          <div className="space-y-3">
            <Button onClick={handleTryAgain} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
            <Button variant="outline" onClick={() => navigate('/checkout')} className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Checkout
            </Button>
            <Button variant="ghost" onClick={handleContactSupport} className="w-full">
              Contact Support
            </Button>
          </div>

          {orderId && (
            <p className="text-xs text-gray-400 mt-6">
              Your order #{orderId.slice(-6)} is still pending. 
              You can complete payment from your order tracking page.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
