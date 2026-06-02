import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Textarea } from '../components/Textarea';
import { AddressMapPicker } from '../components/AddressMapPicker';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { apiRequest, getProfile, validateCouponCode, quoteDelivery as quoteDeliveryApi } from '../api';
import { formatPeso } from '../utils/format';
import { estimateOrderTotal } from '../utils/pricing';
import { MapPin, Phone, User as UserIcon, ChevronDown, Check, Wallet, Smartphone, Landmark, Loader2, ShoppingCart, Truck, CreditCard, Package, ShieldCheck, Lock, Clock, Tag, ChevronLeft, BadgeCheck } from 'lucide-react';

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
  // Panel revision #11 — delivery vs in-store pickup. Drives the post-Ready
  // pipeline on the backend (out_for_delivery vs for_pickup → completed).
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
  // Panel revision #7 — explicit Rush toggle. When on, we snap the delivery
  // date to the earliest rush window and surface the rush fee preview.
  const [rushOrder, setRushOrder] = useState(false);

  const handleRushToggle = (next: boolean) => {
    setRushOrder(next);
    if (next) {
      // Snap to today + 2 business days (rush threshold), skip Sundays.
      const d = new Date();
      let added = 0;
      while (added < 2) {
        d.setDate(d.getDate() + 1);
        if (d.getDay() !== 0) added++;
      }
      setDeliveryDate(d.toISOString().slice(0, 10));
    } else {
      setDeliveryDate(defaultDeliveryDate);
    }
  };

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

  // ── Single source of truth: same estimate engine the Cart uses ──
  // Rush flag is persisted in sessionStorage by the Cart so the customer
  // sees IDENTICAL numbers on both pages. Estimate is what the customer
  // pays for production; shipping is set later by admin in the courier
  // handoff (not part of the customer-facing estimate for quotation orders).
  const rush = React.useMemo(() => {
    try { return sessionStorage.getItem('cm_rush') === '1'; } catch { return false; }
  }, []);
  const estimate = React.useMemo(
    () => estimateOrderTotal(items.map((it) => ({
      sku: it.product?.sku,
      name: it.product?.name,
      quantity: it.quantity,
      customization: it.customization,
    })) as any, { rush }),
    [items, rush],
  );
  const rushFee = estimate.rushFee;
  // Shipping kept here only for the in-store-pickup vs delivery toggle UI
  // — it is NOT added to the customer-facing total since quotation orders
  // bake shipping into the admin's final quote later.
  const shippingFee = 0;
  const finalTotal = Math.max(0, estimate.total - discountAmount);

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
          // Forward the 3D snapshot + full design config so the production
          // team (admin) and the customer (order tracking) both have the
          // exact preview the customer signed off on when ordering.
          previewImage: (item.customization as any).previewImage || '',
          designConfig: (item.customization as any).designConfig || null,
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
          deliveryMethod,
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
        requestedDeliveryDate: deliveryDate || undefined,
        deliveryMethod,
      };
      const order = await apiRequest('/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      clearCart();
      // Land the customer in the Messages tab of their new order — that's
      // where the admin's quote will arrive. Avoids the "where do I go now?"
      // beat right after submit.
      navigate(`/order-tracking/${order.id}?tab=messages`);
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10">

      {/* Back link */}
      <button
        onClick={() => navigate('/cart')}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 mb-5 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to cart
      </button>

      {/* Header + Stepper */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Checkout</h1>
            <p className="text-slate-500 mt-1 text-sm">
              {totalQty} {totalQty === 1 ? 'item' : 'items'} · Almost there!
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <Lock className="w-3 h-3" />
              SSL Secured
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              <ShieldCheck className="w-3 h-3" />
              Buyer Protection
            </span>
          </div>
        </div>

        {/* Step indicator: Cart → Checkout → Confirmation */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between gap-1 sm:gap-3">
            {[
              { n: 1, label: 'Cart', icon: ShoppingCart, done: true },
              { n: 2, label: 'Checkout', icon: CreditCard, active: true },
              { n: 3, label: 'Confirmation', icon: BadgeCheck },
            ].map((s, i, arr) => (
              <React.Fragment key={s.n}>
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-black text-xs border-2 transition-all ${
                      s.done
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : s.active
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 scale-110'
                        : 'bg-white border-slate-200 text-slate-400'
                    }`}
                  >
                    {s.done ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                  </div>
                  <span
                    className={`text-xs sm:text-sm font-bold truncate ${
                      s.active ? 'text-blue-600' : s.done ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 rounded-full ${
                      s.done ? 'bg-emerald-400' : 'bg-slate-200'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-5">
          {/* Section 1: Shipping */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  <span className="inline-flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-md shadow-blue-200">1</span>
                    <span className="inline-flex items-center gap-1.5"><Truck className="w-4 h-4 text-blue-600" /> Shipping Details</span>
                  </span>
                </CardTitle>
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
              {/* Address picker with map. Customer can type freely OR
                  click "Pin on map" to drop a pin on a Leaflet+OSM map;
                  the address auto-fills from Nominatim reverse-geocoding. */}
              <AddressMapPicker
                value={shippingAddress}
                onChange={setShippingAddress}
                disabled={loading}
                label="Shipping Address"
              />
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

          {/* PAYMENT METHOD CARD HIDDEN — quotation workflow defers payment
              to AFTER the admin sends a quote. The customer pays the 50%
              downpayment from the order chat, not here. */}
          {false && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-md shadow-blue-200">2</span>
                  <span className="inline-flex items-center gap-1.5"><CreditCard className="w-4 h-4 text-blue-600" /> Payment Method</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* COD */}
                <button
                  type="button"
                  disabled={isBulk}
                  onClick={() => setPaymentMethod('cod')}
                  className={`relative p-4 border-2 rounded-2xl text-left transition-all group ${
                    paymentMethod === 'cod'
                      ? 'border-emerald-500 bg-emerald-50/60 shadow-md shadow-emerald-100 scale-[1.01]'
                      : isBulk
                      ? 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                      : 'border-slate-200 hover:border-emerald-400 hover:shadow-md bg-white'
                  }`}
                >
                  {paymentMethod === 'cod' && (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-emerald-200">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        Cash on Delivery
                        <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">POPULAR</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Pay in cash when you receive</div>
                    </div>
                  </div>
                  {isBulk && <div className="text-[10px] text-rose-500 mt-2 font-semibold">Not available for bulk orders (20+)</div>}
                </button>

                {/* GCash */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('gcash')}
                  className={`relative p-4 border-2 rounded-2xl text-left transition-all ${
                    paymentMethod === 'gcash'
                      ? 'border-blue-500 bg-blue-50/60 shadow-md shadow-blue-100 scale-[1.01]'
                      : 'border-slate-200 hover:border-blue-400 hover:shadow-md bg-white'
                  }`}
                >
                  {paymentMethod === 'gcash' && (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-sky-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-md shadow-blue-200">
                      GC
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        GCash
                        <span className="text-[9px] font-black text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">INSTANT</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Pay via GCash e-Wallet</div>
                    </div>
                  </div>
                </button>

                {/* Maya */}
                <button
                  type="button"
                  disabled
                  className="relative p-4 border-2 rounded-2xl text-left border-slate-200 opacity-60 cursor-not-allowed bg-white"
                >
                  <span className="absolute top-2.5 right-2.5 text-[9px] font-black bg-gradient-to-r from-orange-500 to-amber-500 text-white px-2 py-0.5 rounded-full">SOON</span>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-purple-500 to-fuchsia-600 rounded-xl flex items-center justify-center text-white shadow-md">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm">Maya</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Digital Wallet</div>
                    </div>
                  </div>
                </button>

                {/* Bank Transfer */}
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`relative p-4 border-2 rounded-2xl text-left transition-all ${
                    paymentMethod === 'bank'
                      ? 'border-orange-500 bg-orange-50/60 shadow-md shadow-orange-100 scale-[1.01]'
                      : 'border-slate-200 hover:border-orange-400 hover:shadow-md bg-white'
                  }`}
                >
                  {paymentMethod === 'bank' && (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-orange-200">
                      <Landmark className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-sm">Bank Transfer</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">BDO · BPI · Metrobank · UnionBank</div>
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
          )}

          {/* Replacement card explaining the new quotation flow — sits in
              the same slot where Payment Method used to be. */}
          <Card>
            <CardContent className="pt-5">
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white text-xl flex-shrink-0">💬</div>
                  <div className="min-w-0">
                    <p className="font-bold text-amber-900">No payment required yet</p>
                    <p className="text-sm text-amber-800 mt-1 leading-snug">
                      Your custom order needs to be reviewed first. After you submit, the store will send a final quote in the order chat. <strong>Once you accept the quote, you'll pay a 50% downpayment to start production. The remaining 50% balance is due before release.</strong>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-md shadow-blue-200">3</span>
                  <span className="inline-flex items-center gap-1.5"><Package className="w-4 h-4 text-blue-600" /> Review Items ({totalQty})</span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3 p-3 rounded-xl bg-slate-50/60 border border-slate-100 hover:border-slate-200 transition-colors">
                  <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-white border border-slate-100">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-sm leading-tight truncate">{item.product.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                            ×{item.quantity}
                          </span>
                          {item.customization.size && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                              {item.customization.size}
                            </span>
                          )}
                          {item.customization.placement && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                              {item.customization.placement}
                            </span>
                          )}
                          {item.customization.text && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[10px] font-bold text-blue-700 max-w-[14ch] truncate">
                              "{item.customization.text}"
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="font-black text-slate-900 text-sm whitespace-nowrap">{formatPeso(item.totalPrice)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Trust badges row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { icon: ShieldCheck, label: 'Buyer Protection', sub: '100% safe', color: 'emerald' },
              { icon: Truck, label: 'Fast Shipping', sub: 'Nationwide', color: 'blue' },
              { icon: BadgeCheck, label: 'Quality Promise', sub: 'Hand-checked', color: 'violet' },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-2 p-2.5 sm:p-3 rounded-xl bg-white border border-slate-100 shadow-sm">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  b.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
                  b.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                  'bg-violet-100 text-violet-600'
                }`}>
                  <b.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-900 leading-tight truncate">{b.label}</p>
                  <p className="text-[10px] text-slate-500 truncate">{b.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Card className="sticky top-24 overflow-hidden shadow-lg border-slate-100">
            <CardHeader className="bg-gradient-to-br from-slate-50 to-blue-50/40 border-b border-slate-100">
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600" />
                  Order Summary
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {/* Order Summary — driven by the SAME estimate engine the Cart
                  uses, so the numbers here match Cart and the eventual
                  quotation pre-fill exactly. Shipping is intentionally NOT
                  in this total — courier fees are set later by admin in
                  the quotation. */}
              {estimate.lines.map((l, i) => (
                <div key={i} className="text-sm">
                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-slate-900 truncate pr-2">{l.name}</span>
                    <span className="font-bold text-slate-900 whitespace-nowrap">{formatPeso(l.net)}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 leading-tight">
                    {l.unit.baseLabel} · {l.unit.printSizeLabel} print · {l.unit.printingMethodLabel} · ×{l.quantity}
                    {l.bulkDiscount > 0 && (
                      <span className="block text-emerald-700 font-semibold">−{formatPeso(l.bulkDiscount)} bulk discount</span>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-sm pt-2 border-t border-slate-100">
                <span className="text-slate-600">Items ({estimate.totalItems} {estimate.totalItems === 1 ? 'pc' : 'pcs'})</span>
                <span className="font-bold text-slate-900">{formatPeso(estimate.itemsGross)}</span>
              </div>
              {estimate.bulkDiscountTotal > 0 && (
                <div className="flex justify-between text-sm text-emerald-700">
                  <span>Bulk discount</span>
                  <span className="font-semibold">−{formatPeso(estimate.bulkDiscountTotal)}</span>
                </div>
              )}

              {/* ─── Delivery method (panel revision #11) ───────────────── */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Delivery method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('delivery')}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      deliveryMethod === 'delivery'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold">Delivery</div>
                    <div className="text-xs text-slate-500 mt-0.5">Ship to my address</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('pickup')}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      deliveryMethod === 'pickup'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="text-sm font-bold">In-store pickup</div>
                    <div className="text-xs text-slate-500 mt-0.5">Pick up at shop</div>
                  </button>
                </div>
              </div>

              {/* ─── Rush order toggle (panel revision #7) ──────────────── */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span aria-hidden>⚡</span> Rush order
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Bumps your delivery to the earliest rush window. An additional fee applies.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rushOrder}
                    onClick={() => handleRushToggle(!rushOrder)}
                    className={`shrink-0 inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                      rushOrder ? 'bg-amber-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 bg-white rounded-full shadow transform transition-transform ${
                        rushOrder ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>

              {/* ─── Delivery date / urgency picker ─────────────────────── */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-sm font-bold text-slate-700 uppercase tracking-wider mb-1.5">
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

              <div className="border-t border-dashed border-slate-200 pt-3.5 mt-1">
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-slate-900">Total</span>
                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-900">{formatPeso(finalTotal)}</p>
                    <p className="text-[10px] text-slate-500 font-semibold">VAT included</p>
                  </div>
                </div>
              </div>
              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200">
                  <p className="text-xs text-rose-700 font-semibold">{error}</p>
                </div>
              )}
              <Button
                className="w-full !py-3.5 !rounded-xl !text-sm !font-black tracking-wide shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 hover:-translate-y-0.5 transition-all"
                onClick={() => {
                  // Quotation workflow: always submit without payment. The
                  // PayMongo / payment-modal paths are unreachable now —
                  // payment happens in the order chat AFTER the admin sends
                  // a final quote and the customer accepts it.
                  handlePlaceOrder();
                }}
                disabled={loading || !!deliveryError || deliveryQuote?.capacity?.available === false}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting order request…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Lock className="w-3.5 h-3.5" />
                    Submit Order Request
                  </span>
                )}
              </Button>

              <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                By submitting, you agree to our <span className="font-bold text-slate-700">Terms</span>. <strong>No payment yet</strong> — the store will send a final quote in the chat.
              </p>

              <div className="flex items-center justify-center gap-3 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  <Lock className="w-3 h-3 text-emerald-600" /> SSL
                </div>
                <span className="text-slate-300">·</span>
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  <ShieldCheck className="w-3 h-3 text-blue-600" /> PayMongo
                </div>
                <span className="text-slate-300">·</span>
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                  <Clock className="w-3 h-3 text-violet-600" /> 24/7 Support
                </div>
              </div>
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
