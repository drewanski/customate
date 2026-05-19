import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { apiRequest, getProfile, validateCouponCode, quoteDelivery as quoteDeliveryApi } from '../api';
import { formatPeso } from '../utils/format';
import { MapPin, Phone, User as UserIcon, ChevronDown, Check, Wallet, Smartphone, Landmark, Loader2 } from 'lucide-react';

import { PaymentModal } from '../components/PaymentModal';
import { createGCashPayment, createMayaPayment } from '../api/paymongo';

export function Checkout() {
  const navigate = useNavigate();
  const { items, totalAmount, clearCart } = useCart();
  const { user: authUser } = useAuth();

  const [userProfile, setUserProfile] = useState<any>(null);
  const [shippingAddress, setShippingAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'gcash' | 'paymaya' | 'bank'>('cod');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<any>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [showSavedAddresses, setShowSavedAddresses] = useState(false);

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; name?: string; type?: string; discount: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');

  const handleApplyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError('');
    setCouponLoading(true);
    try {
      const res: any = await validateCouponCode(code, itemsPayload);
      if (res?.valid === false) {
        setCouponError(res?.reason || 'Invalid coupon code');
        setAppliedCoupon(null);
      } else {
        const discount = Number(res?.discount ?? res?.discountAmount ?? 0);
        setAppliedCoupon({
          code,
          name: res?.coupon?.name,
          type: res?.coupon?.type,
          discount,
        });
      }
    } catch (err: any) {
      setCouponError(err?.message || 'Failed to validate coupon');
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError('');
  };

  const discountAmount = appliedCoupon?.discount || 0;

  // ─── Delivery date / urgency state ──────────────────────────────────────
  // Default delivery date = today + 10 business days (standard tier sweet
  // spot — no surcharge, no capacity risk). We let the user adjust earlier.
  const defaultDeliveryDate = useMemo(() => {
    const d = new Date();
    let added = 0;
    while (added < 14) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0) added++;
    }
    return d.toISOString().slice(0, 10);
  }, []);
  const [deliveryDate, setDeliveryDate] = useState<string>(defaultDeliveryDate);
  const [deliveryQuote, setDeliveryQuote] = useState<any>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState('');

  // Re-quote whenever the date OR the cart subtotal changes. Pre-coupon
  // subtotal is what the server uses to compute the surcharge.
  useEffect(() => {
    if (!deliveryDate) {
      setDeliveryQuote(null);
      setDeliveryError('');
      return;
    }
    let cancelled = false;
    setDeliveryQuoteLoading(true);
    setDeliveryError('');
    quoteDeliveryApi(deliveryDate, totalAmount)
      .then((q: any) => {
        if (cancelled) return;
        if (q?.ok === false) {
          setDeliveryError(q.reason || 'Unable to quote that date.');
          setDeliveryQuote(null);
        } else {
          setDeliveryQuote(q);
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setDeliveryError(err?.message || 'Failed to quote delivery.');
        setDeliveryQuote(null);
      })
      .finally(() => {
        if (!cancelled) setDeliveryQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deliveryDate, totalAmount]);

  const rushFee = deliveryQuote?.rushFee || 0;
  const finalTotal = Math.max(0, totalAmount + rushFee - discountAmount);

  // Date picker bounds: tomorrow → +90 days, no Sundays
  const minDeliveryDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const maxDeliveryDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!authUser) return;
      try {
        const data = await getProfile();
        setUserProfile(data);
        // Set default address if available
        const defaultAddr = data.savedAddresses?.find((a: any) => a.isDefault) || data.savedAddresses?.[0];
        if (defaultAddr) {
          setShippingAddress(`${defaultAddr.addressLine1}${defaultAddr.addressLine2 ? ', ' + defaultAddr.addressLine2 : ''}, ${defaultAddr.city}, ${defaultAddr.province} ${defaultAddr.postalCode}`);
          setRecipientName(defaultAddr.fullName);
        } else {
          setRecipientName(data.name);
        }
      } catch (err) {
        console.error('Failed to fetch profile', err);
      }
    };
    fetchProfile();
  }, [authUser]);

  const totalQty = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const isBulk = totalQty >= 20;

  // Disable COD for bulk orders
  useEffect(() => {
    if (isBulk && paymentMethod === 'cod') {
      setPaymentMethod('gcash');
    }
  }, [isBulk, paymentMethod]);

  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);

  const addressSuggestions = useMemo(() => {
    const base = [
      'Brgy. ',
      'Barangay ',
      'City of ',
      'Quezon City, Metro Manila',
      'Manila, Metro Manila',
      'Cebu City, Cebu',
      'Davao City, Davao del Sur',
      'Makati City, Metro Manila',
      'Taguig City, Metro Manila',
      'Pasig City, Metro Manila'
    ];
    const q = shippingAddress.trim().toLowerCase();
    if (!q) return base.slice(0, 6);
    return base
      .filter((s) => s.toLowerCase().includes(q) || q.includes(s.toLowerCase().trim()))
      .slice(0, 6);
  }, [shippingAddress]);

  const itemsPayload = useMemo(
    () =>
      items.map((item) => ({
        sku: item.product.sku || generateSkuFromName(item.product.name),
        quantity: item.quantity,
        customization: {
          size: item.customization.size,
          color: item.customization.color,
          placement: item.customization.placement,
          text: item.customization.text,
          font: item.customization.font,
          image: item.customization.image,
        }
      })),
    [items]
  );

  // Helper: generate SKU from product name (simple fallback)
  const generateSkuFromName = (name: string) => {
    const words = name.trim().split(/\s+/).slice(0, 2);
    const prefix = words.map(w => w.substring(0, 2).toUpperCase()).join('');
    const suffix = '001';
    return prefix + suffix;
  };

  const handlePlaceOrder = async (paymentDetails?: any, useRealPaymongo?: boolean) => {
    if (!items.length) return;
    setError('');

    if (!shippingAddress.trim()) {
      setError('Shipping address is required');
      return;
    }

    // For real PayMongo payments (GCash/Maya with automatic checkout):
    // Create order first, then directly redirect to PayMongo checkout
    if (paymentMethod !== 'cod' && !paymentDetails && useRealPaymongo && 
        (paymentMethod === 'gcash' || paymentMethod === 'paymaya')) {
      try {
        setLoading(true);
        // Create order with pending payment status
        const payload = {
          items: itemsPayload,
          shippingAddress: shippingAddress.trim(),
          recipientName: recipientName.trim(),
          notes: notes.trim() || undefined,
          paymentMethod,
          paymentDetails: null, // Will be updated after PayMongo payment
          couponCode: appliedCoupon?.code,
          requestedDeliveryDate: deliveryDate || undefined,
        };
        const order = await apiRequest('/orders', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        
        // Create PayMongo payment and get checkout URL
        let response;
        if (paymentMethod === 'gcash') {
          response = await createGCashPayment(order.id, { name: recipientName.trim() || 'Customer' });
        } else {
          response = await createMayaPayment(order.id, { name: recipientName.trim() || 'Customer' });
        }
        
        if (response?.checkoutUrl) {
          // Redirect to actual GCash/Maya payment page
          window.location.href = response.checkoutUrl;
        } else {
          throw new Error('No checkout URL received from payment provider');
        }
        return;
      } catch (err: any) {
        console.error('Payment error details:', err);
        const errorMessage = err?.message || 'Failed to create payment. Please try again.';
        setError(errorMessage);
        setLoading(false);
        return;
      }
    }

    // If digital payment (Bank Transfer) and no paymentDetails yet, open modal first
    if (paymentMethod !== 'cod' && !paymentDetails && paymentMethod === 'bank') {
      setIsPaymentModalOpen(true);
      return;
    }

    try {
      setLoading(true);
      const payload = {
        items: itemsPayload,
        shippingAddress: shippingAddress.trim(),
        recipientName: recipientName.trim(),
        notes: notes.trim() || undefined,
        paymentMethod,
        paymentDetails, // Include reference number etc.
        couponCode: appliedCoupon?.code,
      };
      const order = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      clearCart();
      navigate(`/order-tracking/${order.id}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (!items.length) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 py-16 text-center">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-12">
            <p className="text-slate-600 mb-6">Your cart is empty. Add a product to continue.</p>
            <button
              onClick={() => navigate('/products')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm text-white bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5"
            >
              Browse products
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-8 md:py-12">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Checkout</h1>
          <p className="text-slate-500 mt-1">
            {totalQty} {totalQty === 1 ? 'item' : 'items'} ready to ship
          </p>
        </div>
        <div className="hidden md:flex items-center gap-1.5 text-xs font-bold text-emerald-600">
          <Check className="w-3.5 h-3.5" />
          Secure checkout
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Shipping Details</CardTitle>
                {userProfile?.savedAddresses?.length > 0 && (
                  <div className="relative">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowSavedAddresses(!showSavedAddresses)}
                      className="text-xs flex items-center gap-1 border-blue-200 text-blue-600 hover:bg-blue-50"
                    >
                      <MapPin className="w-3 h-3" />
                      Use Saved Address
                      <ChevronDown className={`w-3 h-3 transition-transform ${showSavedAddresses ? 'rotate-180' : ''}`} />
                    </Button>
                    
                    {showSavedAddresses && (
                      <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-3 border-b border-gray-50 bg-gray-50/50">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select an address</p>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {userProfile.savedAddresses.map((addr: any) => (
                            <button
                              key={addr._id}
                              onClick={() => {
                                setShippingAddress(`${addr.addressLine1}${addr.addressLine2 ? ', ' + addr.addressLine2 : ''}, ${addr.city}, ${addr.province} ${addr.postalCode}`);
                                setRecipientName(addr.fullName);
                                setShowSavedAddresses(false);
                              }}
                              className="w-full text-left p-4 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 group"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-bold text-gray-900">{addr.label}</span>
                                {addr.isDefault && <span className="text-[10px] font-black text-blue-500 uppercase">Default</span>}
                              </div>
                              <p className="text-xs text-gray-600 font-medium mb-1">{addr.fullName}</p>
                              <p className="text-[10px] text-gray-500 leading-relaxed truncate">
                                {addr.addressLine1}, {addr.city}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Recipient Name"
                placeholder="Full Name"
                value={recipientName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecipientName(e.target.value)}
                disabled={loading}
                required
              />
              <div className="relative">
                <Textarea
                  label="Shipping Address"
                  placeholder="House no., Street, Barangay, City, Province"
                  value={shippingAddress}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                    setShippingAddress(e.target.value);
                    setShowAddressSuggestions(true);
                  }}
                  onFocus={() => setShowAddressSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowAddressSuggestions(false), 120)}
                  rows={4}
                  disabled={loading}
                  required
                />
                {showAddressSuggestions && addressSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
                    {addressSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setShippingAddress((prev) => {
                            const v = prev || '';
                            if (!v.trim()) return s;
                            if (v.trim().toLowerCase() === s.trim().toLowerCase()) return v;
                            return `${v.trimEnd()}\n${s}`;
                          });
                          setShowAddressSuggestions(false);
                        }}
                      >
                        {s}
                      </button>
                    ))}
                    <div className="px-3 py-2 text-xs text-gray-500 border-t border-gray-100">
                      Suggestions are templates. Please complete your full address.
                    </div>
                  </div>
                )}
              </div>
              <Textarea
                label="Order Notes (optional)"
                placeholder="Any additional instructions (e.g., delivery time, color preference, etc.)"
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                rows={3}
                disabled={loading}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  disabled={isBulk}
                  onClick={() => setPaymentMethod('cod')}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    paymentMethod === 'cod'
                      ? 'border-green-600 bg-green-50'
                      : isBulk
                      ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">COD</div>
                    <div>
                      <div className="font-semibold text-gray-900">Cash on Delivery</div>
                      <div className="text-xs text-gray-500">Pay when you receive</div>
                    </div>
                  </div>
                  {isBulk && <div className="text-[10px] text-red-500 mt-2">Not available for bulk orders</div>}
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('gcash')}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    paymentMethod === 'gcash'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">GC</div>
                    <div>
                      <div className="font-semibold text-gray-900">GCash</div>
                      <div className="text-xs text-gray-500">Philippine e-Wallet</div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled
                  className="p-4 border-2 rounded-xl text-left transition-all border-gray-200 opacity-50 cursor-not-allowed relative"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">MY</div>
                    <div>
                      <div className="font-semibold text-gray-900">Maya</div>
                      <div className="text-xs text-gray-500">Digital Wallet</div>
                    </div>
                  </div>
                  <span className="absolute top-2 right-2 text-[8px] bg-orange-500 text-white px-1.5 py-0.5 rounded">SOON</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`p-4 border-2 rounded-xl text-left transition-all ${
                    paymentMethod === 'bank'
                      ? 'border-orange-600 bg-orange-50'
                      : 'border-gray-200 hover:border-orange-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">Bank Transfer</div>
                      <div className="text-xs text-gray-500">BDO, BPI, Metrobank, etc.</div>
                    </div>
                  </div>
                </button>
              </div>

              {isBulk && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 font-medium">Bulk Order Notice</p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Orders with 20+ items require a 50% down payment (₱{(totalAmount * 0.5).toLocaleString()}) 
                    to start production. Cash on Delivery is disabled.
                  </p>
                </div>
              )}

              {paymentMethod !== 'cod' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium flex items-center gap-2">
                    {paymentMethod === 'gcash' && <Wallet className="w-4 h-4" />}
                    {paymentMethod === 'paymaya' && <Smartphone className="w-4 h-4" />}
                    {paymentMethod === 'bank' && <Landmark className="w-4 h-4" />}
                    Payment Instructions
                  </p>
                  <div className="text-xs text-blue-700 mt-2 space-y-1">
                    {paymentMethod === 'gcash' && (
                      <>
                        <p>1. Click "Pay with GCash" to proceed</p>
                        <p>2. You will be redirected to GCash payment page</p>
                        <p>3. Scan QR code or enter your GCash number</p>
                        <p>4. Amount: <strong>{formatPeso(isBulk ? totalAmount * 0.5 : totalAmount)}</strong></p>
                        <p>5. Confirm payment in your GCash app</p>
                      </>
                    )}
                    {paymentMethod === 'paymaya' && (
                      <>
                        <p>1. Click "Pay with Maya" to proceed</p>
                        <p>2. You will be redirected to Maya payment page</p>
                        <p>3. Scan QR code or enter your Maya number</p>
                        <p>4. Amount: <strong>{formatPeso(isBulk ? totalAmount * 0.5 : totalAmount)}</strong></p>
                        <p>5. Confirm payment in your Maya app</p>
                      </>
                    )}
                    {paymentMethod === 'bank' && (
                      <>
                        <p>Transfer to any of these accounts:</p>
                        <p>• <strong>BDO</strong> 0012-3456-7890 | Makati Ave.</p>
                        <p>• <strong>BPI</strong> 1234-5678-9012 | Ortigas Center</p>
                        <p>• <strong>Metrobank</strong> 234-5-678901-2 | BGC Taguig</p>
                        <p>• <strong>UnionBank</strong> 0004-5678-9012 | Cebu</p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex gap-4 border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-20 h-20 object-cover rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{item.product.name}</p>
                        <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                        <p className="text-sm text-gray-600">Size: {item.customization.size}</p>
                        <p className="text-sm text-gray-600">Placement: {item.customization.placement}</p>
                        {item.customization.text && <p className="text-sm text-gray-600">Text: {item.customization.text}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatPeso(item.totalPrice)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span>{formatPeso(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span>Free</span>
              </div>

              {/* ─── Delivery date / urgency picker ─────────────────────── */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Preferred delivery date
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  min={minDeliveryDate}
                  max={maxDeliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {deliveryQuoteLoading && (
                  <p className="mt-1.5 text-[11px] text-slate-500">Checking availability…</p>
                )}
                {deliveryError && (
                  <p className="mt-1.5 text-[11px] text-rose-600 font-semibold">{deliveryError}</p>
                )}
                {deliveryQuote && !deliveryError && (
                  <div
                    className="mt-2 p-2.5 rounded-lg border"
                    style={{
                      backgroundColor: `${deliveryQuote.color}15`,
                      borderColor: `${deliveryQuote.color}55`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p
                          className="text-xs font-black uppercase tracking-wider"
                          style={{ color: deliveryQuote.color }}
                        >
                          {deliveryQuote.label}
                        </p>
                        <p className="text-[10px] text-slate-600 font-semibold mt-0.5">
                          {deliveryQuote.leadTimeDays} business day
                          {deliveryQuote.leadTimeDays === 1 ? '' : 's'} lead time
                        </p>
                      </div>
                      <div className="text-right">
                        {deliveryQuote.rushFee > 0 ? (
                          <p
                            className="text-sm font-black"
                            style={{ color: deliveryQuote.color }}
                          >
                            +{formatPeso(deliveryQuote.rushFee)}
                          </p>
                        ) : (
                          <p className="text-sm font-black text-emerald-600">No surcharge</p>
                        )}
                        <p className="text-[10px] text-slate-500 font-semibold">
                          {Math.round((deliveryQuote.surchargePct || 0) * 100)}% rush fee
                        </p>
                      </div>
                    </div>
                    {deliveryQuote.capacity?.available === false && (
                      <p className="mt-1.5 text-[11px] text-rose-700 font-semibold">
                        ⚠ {deliveryQuote.capacity.reason}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Rush fee line — only show when there's actually a fee */}
              {rushFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Rush fee ({deliveryQuote?.label || ''})
                  </span>
                  <span
                    className="font-bold"
                    style={{ color: deliveryQuote?.color || '#475569' }}
                  >
                    +{formatPeso(rushFee)}
                  </span>
                </div>
              )}

              {/* Coupon input / applied state */}
              {!appliedCoupon ? (
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Promo code
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => {
                        setCouponInput(e.target.value.toUpperCase());
                        if (couponError) setCouponError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyCoupon();
                        }
                      }}
                      placeholder="Enter code"
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={couponLoading}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={couponLoading || !couponInput.trim()}
                      className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {couponLoading ? '…' : 'Apply'}
                    </button>
                  </div>
                  {couponError && (
                    <p className="mt-1.5 text-[11px] text-rose-600 font-semibold">{couponError}</p>
                  )}
                </div>
              ) : (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-emerald-700 truncate">
                        {appliedCoupon.code}
                      </p>
                      {appliedCoupon.name && (
                        <p className="text-[10px] text-emerald-600 truncate">{appliedCoupon.name}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-emerald-700 font-semibold">Discount</span>
                    <span className="text-emerald-700 font-bold">-{formatPeso(discountAmount)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between font-semibold border-t pt-3">
                <span>Total</span>
                <span className="text-blue-600">{formatPeso(finalTotal)}</span>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button 
                className="w-full" 
                onClick={() => {
                  // For GCash/Maya with real PayMongo: create order first, then redirect
                  if (paymentMethod === 'gcash' || paymentMethod === 'paymaya') {
                    handlePlaceOrder(undefined, true);
                  } else {
                    // For COD and Bank Transfer: use original flow
                    handlePlaceOrder();
                  }
                }} 
                disabled={loading || !!deliveryError || deliveryQuote?.capacity?.available === false}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {(paymentMethod === 'gcash' || paymentMethod === 'paymaya') ? 'Redirecting to payment...' : 'Placing order...'}
                  </span>
                ) : (
                  (paymentMethod === 'gcash' || paymentMethod === 'paymaya') ? 'Pay with ' + (paymentMethod === 'gcash' ? 'GCash' : 'Maya') : 'Place Order'
                )}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/cart')} disabled={loading}>
                Back to Cart
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setCreatedOrderId(null);
        }}
        onSuccess={(details) => {
          setPendingPaymentData(details);
          handlePlaceOrder(details, false);
        }}
        amount={finalTotal}
        method={paymentMethod}
        isBulk={isBulk}
        orderId={createdOrderId || undefined}
        userEmail={userProfile?.email}
        userName={userProfile?.name || recipientName}
      />
      </div>
    </div>
  );
}
