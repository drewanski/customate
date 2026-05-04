import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { QrCode, Smartphone, Landmark, CheckCircle2, AlertCircle, Copy, Check, Wallet, Building2, ExternalLink } from 'lucide-react';
import { formatPeso } from '../utils/format';
import { createGCashPayment, createMayaPayment } from '../api/paymongo';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (paymentDetails: any) => void;
  amount: number;
  method: 'gcash' | 'paymaya' | 'bank' | 'cod';
  isBulk?: boolean;
  orderId?: string;
  userEmail?: string;
  userName?: string;
}

const PH_BANKS = [
  { name: 'BDO', account: '0012-3456-7890', accountName: 'CustoMate Digital Solutions', branch: 'Makati Ave.' },
  { name: 'BPI', account: '1234-5678-9012', accountName: 'CustoMate Digital Solutions', branch: 'Ortigas Center' },
  { name: 'Metrobank', account: '234-5-678901-2', accountName: 'CustoMate Digital Solutions', branch: 'BGC Taguig' },
  { name: 'UnionBank', account: '0004-5678-9012', accountName: 'CustoMate Digital Solutions', branch: 'Cebu Business Park' },
];

const GCASH_DETAILS = {
  number: '0917-XXX-XXXX',
  name: 'JUAN DELA CRUZ',
  qrUrl: 'https://via.placeholder.com/200x200/0077B6/FFFFFF?text=GCash+QR'
};

const MAYA_DETAILS = {
  number: '0917-XXX-XXXX',
  name: 'JUAN DELA CRUZ',
  qrUrl: 'https://via.placeholder.com/200x200/8E24AA/FFFFFF?text=Maya+QR'
};

export function PaymentModal({ isOpen, onClose, onSuccess, amount, method, isBulk, orderId, userEmail, userName }: PaymentModalProps) {
  const [step, setStep] = useState<'info' | 'processing' | 'success'>('info');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{phone?: string; reference?: string}>({});
  const [useRealPayment, setUseRealPayment] = useState(true); // Toggle between real PayMongo and manual
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const requiredAmount = isBulk ? amount * 0.5 : amount;

  useEffect(() => {
    if (isOpen) {
      setStep('info');
      setReferenceNumber('');
      setPhoneNumber('');
    }
  }, [isOpen]);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  const validatePhone = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    return clean.length === 11 && clean.startsWith('09');
  };

  const validateReference = (ref: string) => {
    return ref.length >= 10;
  };

  const handleRealPayment = async () => {
    if (!orderId) {
      setErrors({ reference: 'Order ID required for payment' });
      return;
    }
    
    setLoading(true);
    setErrors({});
    
    try {
      const billing = {
        name: userName || 'Customer',
        email: userEmail || '',
        phone: phoneNumber
      };
      
      let response;
      if (method === 'gcash') {
        response = await createGCashPayment(orderId, billing);
      } else if (method === 'paymaya') {
        response = await createMayaPayment(orderId, billing);
      } else {
        // Bank transfer doesn't have real-time API, use manual
        handleManualVerification();
        return;
      }
      
      if (response?.checkoutUrl) {
        setCheckoutUrl(response.checkoutUrl);
        // Redirect to PayMongo checkout
        window.location.href = response.checkoutUrl;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Payment creation error:', error);
      setErrors({ reference: error.message || 'Failed to create payment. Please try again.' });
      setLoading(false);
    }
  };

  const handleManualVerification = () => {
    const newErrors: {phone?: string; reference?: string} = {};
    
    if (method !== 'cod') {
      if (!phoneNumber || !validatePhone(phoneNumber)) {
        newErrors.phone = 'Please enter a valid Philippine mobile number (09XXXXXXXXX)';
      }
      if (!referenceNumber || !validateReference(referenceNumber)) {
        newErrors.reference = 'Please enter a valid transaction reference number (min 10 chars)';
      }
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setErrors({});
    setLoading(true);
    setStep('processing');
    
    // Simulate payment verification
    setTimeout(() => {
      setLoading(false);
      setStep('success');
    }, 2500);
  };

  const handlePaymentSubmit = () => {
    if (useRealPayment && (method === 'gcash' || method === 'paymaya') && orderId) {
      handleRealPayment();
    } else {
      handleManualVerification();
    }
  };

  const handleFinish = () => {
    onSuccess({
      method,
      amountPaid: requiredAmount,
      referenceNumber,
      phoneNumber: phoneNumber.replace(/\D/g, ''), // Clean phone number
      timestamp: new Date().toISOString()
    });
    onClose();
  };

  if (method === 'cod') return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 'success' ? 'Payment Successful' : `Pay with ${method.toUpperCase()}`}
    >
      <div className="space-y-6 py-2">
        {step === 'info' && (
          <>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  Amount to Pay: {formatPeso(requiredAmount)}
                </p>
                {isBulk && (
                  <p className="text-xs text-blue-700 mt-1">
                    This is a 50% down payment required for bulk orders.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center space-y-4 py-4">
              {method === 'bank' ? (
                <div className="w-full space-y-3 max-h-64 overflow-y-auto">
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">Select Bank to Transfer</p>
                  {PH_BANKS.map((bank) => (
                    <div key={bank.name} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                      <Building2 className="w-6 h-6 text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{bank.name}</p>
                          <span className="text-[10px] text-gray-400">{bank.branch}</span>
                        </div>
                        <p className="font-mono font-bold text-gray-900 text-sm">{bank.account}</p>
                        <p className="text-xs text-gray-600 truncate">{bank.accountName}</p>
                      </div>
                      <button 
                        onClick={() => handleCopy(bank.account.replace(/-/g, ''), bank.name)} 
                        className="p-2 hover:bg-white rounded-md transition-colors shrink-0"
                        title="Copy account number"
                      >
                        {copied === bank.name ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-6 rounded-2xl text-white w-full max-w-xs">
                    <div className="flex items-center gap-3 mb-4">
                      <Wallet className="w-8 h-8" />
                      <div>
                        <p className="font-bold text-lg">{method === 'gcash' ? 'GCash' : 'Maya'}</p>
                        <p className="text-xs text-blue-200">Send Money</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-200">Number:</span>
                        <span className="font-mono">{method === 'gcash' ? GCASH_DETAILS.number : MAYA_DETAILS.number}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-200">Name:</span>
                        <span>{method === 'gcash' ? GCASH_DETAILS.name : MAYA_DETAILS.name}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-blue-400/30">
                        <span className="text-blue-200">Amount:</span>
                        <span className="font-bold text-lg">{formatPeso(requiredAmount)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative p-4 bg-white border-2 border-dashed border-gray-200 rounded-2xl">
                    <div className="w-40 h-40 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                      <QrCode className="w-28 h-28 text-gray-300" />
                      <div className="absolute inset-0 flex items-center justify-center">
                         <div className={`p-2 rounded-lg shadow-sm border border-gray-100 ${method === 'gcash' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                            <span className="font-bold text-sm">{method === 'gcash' ? 'GCash' : 'Maya'} QR</span>
                         </div>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-500 text-center">
                    Open your {method === 'gcash' ? 'GCash' : 'Maya'} app → Send Money → Enter number above
                  </p>
                </>
              )}
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Smartphone className="absolute left-3 top-[34px] w-5 h-5 text-gray-400" />
                <Input
                  label={`Your ${method === 'gcash' ? 'GCash' : 'Maya'} Registered Number`}
                  placeholder="09XXXXXXXXX (11 digits)"
                  className={`pl-10 ${errors.phone ? 'border-red-500' : ''}`}
                  value={phoneNumber}
                  onChange={(e: any) => {
                    setPhoneNumber(e.target.value);
                    if (errors.phone) setErrors({...errors, phone: undefined});
                  }}
                  maxLength={11}
                />
                {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
              </div>
              <div>
                <Input
                  label="Transaction Reference Number"
                  placeholder="Enter reference from your SMS/app confirmation"
                  value={referenceNumber}
                  onChange={(e: any) => {
                    setReferenceNumber(e.target.value);
                    if (errors.reference) setErrors({...errors, reference: undefined});
                  }}
                  className={errors.reference ? 'border-red-500' : ''}
                  required
                />
                {errors.reference && <p className="text-xs text-red-500 mt-1">{errors.reference}</p>}
                <p className="text-[10px] text-gray-400 mt-1">
                  Found in your SMS confirmation or transaction history
                </p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-xs text-yellow-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Production begins after payment verification (usually within 2-4 hours during business hours)</span>
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {/* Payment Mode Toggle for GCash/Maya */}
              {(method === 'gcash' || method === 'paymaya') && orderId && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    id="realPayment"
                    checked={useRealPayment}
                    onChange={(e) => setUseRealPayment(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="realPayment" className="cursor-pointer">
                    Use automatic PayMongo checkout (recommended)
                  </label>
                </div>
              )}
              
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handlePaymentSubmit} 
                  disabled={loading || (useRealPayment && orderId && (method === 'gcash' || method === 'paymaya') ? false : !referenceNumber)}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : useRealPayment && orderId && (method === 'gcash' || method === 'paymaya') ? (
                    <span className="flex items-center gap-2">
                      <ExternalLink className="w-4 h-4" />
                      Pay Now
                    </span>
                  ) : (
                    'Verify Payment'
                  )}
                </Button>
              </div>
              
              {useRealPayment && orderId && (method === 'gcash' || method === 'paymaya') && (
                <p className="text-[10px] text-gray-400 text-center">
                  You'll be redirected to {method === 'gcash' ? 'GCash' : 'Maya'} to complete payment securely
                </p>
              )}
            </div>
          </>
        )}

        {step === 'processing' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-blue-100 rounded-full" />
              <div className="absolute inset-0 w-20 h-20 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900">Verifying Transaction</h3>
              <p className="text-sm text-gray-600 mt-1">Please don't close this window...</p>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900">Payment Confirmed!</h3>
              <p className="text-sm text-gray-600 mt-2 px-6">
                We've received your {formatPeso(requiredAmount)} payment. 
                Your order is now being processed.
              </p>
            </div>
            <div className="w-full bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Reference No.</span>
                <span className="font-mono font-bold text-gray-900">{referenceNumber}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Method</span>
                <span className="font-bold text-gray-900 uppercase">{method}</span>
              </div>
            </div>
            <Button className="w-full" onClick={handleFinish}>
              Finish Order
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
