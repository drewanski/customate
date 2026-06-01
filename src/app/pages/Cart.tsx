import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { formatPeso } from '../utils/format';
import { ShoppingBag, Minus, Plus, Trash2, ArrowRight, Tag, Truck, ShieldCheck, ChevronLeft } from 'lucide-react';

export function Cart() {
  const { items, updateQuantity, removeItem, totalAmount } = useCart();
  const navigate = useNavigate();

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  // Default to delivery shipping; pickup waives the fee but the customer
  // picks the delivery method on Checkout, so the cart shows the
  // delivery-case estimate.
  const shipping = totalAmount >= 500 ? 0 : 100;
  const total = totalAmount + shipping;

  const handlePlaceOrder = () => {
    if (!items.length) return;
    navigate('/checkout');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-8 md:py-12">
        {/* Back link */}
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Continue shopping
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">Your cart</h1>
            <p className="text-slate-500 mt-1">
              {items.length === 0
                ? 'Your cart is currently empty'
                : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} ready for checkout`}
            </p>
          </div>
        </div>

        {/* Empty state */}
        {items.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-12 text-center">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-5">
              <ShoppingBag className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Your cart is empty</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              Once you add a product, it'll show up here. Start with our most popular items.
            </p>
            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm text-white bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5"
            >
              Browse products
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Items list */}
            <div className="lg:col-span-2 space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow p-4 md:p-5"
                >
                  <div className="flex gap-4">
                    {/* Image — prefer the captured 3D design snapshot so the
                        customer sees exactly what they designed; fall back
                        to the base product photo only when no snapshot exists. */}
                    <div className="relative shrink-0 w-20 h-20 md:w-28 md:h-28 rounded-xl overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/50 border border-slate-100">
                      <img
                        src={(item.customization as any).previewImage || item.product.image}
                        alt={item.product.name}
                        className="w-full h-full object-contain"
                      />
                      {(item.customization as any).previewImage && (
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm">
                          Custom
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-slate-900 text-sm md:text-base leading-tight">{item.product.name}</h3>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="shrink-0 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          aria-label="Remove item"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Customization details — pills */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {item.customization.size && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
                            Size: {item.customization.size}
                          </span>
                        )}
                        {item.customization.placement && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
                            {item.customization.placement}
                          </span>
                        )}
                        {item.customization.text && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-[10px] font-bold text-blue-700 max-w-[14ch] truncate">
                            "{item.customization.text}"
                          </span>
                        )}
                      </div>

                      {/* Bottom row: quantity + price */}
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-full p-1">
                          <button
                            onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                            disabled={item.quantity <= 1}
                            className="w-7 h-7 rounded-full bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-colors disabled:opacity-40"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-9 text-center font-bold text-sm text-slate-900">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-7 h-7 rounded-full bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-base md:text-lg font-black text-slate-900">
                            {formatPeso(item.product.price * item.quantity)}
                          </p>
                          {item.quantity > 1 && (
                            <p className="text-[10px] text-slate-400 font-semibold">
                              {formatPeso(item.product.price)} each
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Order summary */}
            <div>
              <div className="sticky top-24 bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <div className="p-5 md:p-6 border-b border-slate-100">
                  <h2 className="font-black text-slate-900 text-lg tracking-tight">Order summary</h2>
                </div>

                <div className="p-5 md:p-6 space-y-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
                    <span className="font-semibold text-slate-900">{formatPeso(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5" />
                      Shipping
                    </span>
                    {shipping === 0 ? (
                      <span className="font-bold text-emerald-600">FREE</span>
                    ) : (
                      <span className="font-semibold text-slate-900">{formatPeso(shipping)}</span>
                    )}
                  </div>
                  {shipping > 0 && (
                    <div className="text-[11px] text-blue-600 bg-blue-50 rounded-lg px-3 py-2 leading-snug">
                      Add <strong>{formatPeso(500 - totalAmount)}</strong> more for free shipping.
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 flex items-baseline justify-between">
                    <span className="font-bold text-slate-900">Total</span>
                    <span className="text-2xl font-black text-slate-900">{formatPeso(total)}</span>
                  </div>
                </div>

                <div className="p-5 md:p-6 bg-slate-50 border-t border-slate-100 space-y-3">
                  <button
                    onClick={handlePlaceOrder}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 transition-all hover:-translate-y-0.5"
                  >
                    Proceed to checkout
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {/* Trust indicators */}
                  <div className="flex items-center gap-3 pt-2 text-[10px] text-slate-500">
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="font-semibold">Secure checkout</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-semibold">Discounts apply</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
