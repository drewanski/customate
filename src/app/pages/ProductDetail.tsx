import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../api';
import {
  Palette, Sparkles, Box, Zap, ShieldCheck, ChevronLeft,
  ShoppingCart, Minus, Plus, Package, ArrowRight, Star,
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { ToastContainer, ToastType } from '../components/Toast';
import { formatPeso } from '../utils/format';
import { NotFound } from './NotFound';
import { ProductReviews } from '../components/reviews/ProductReviews';

export function ProductDetail() {
  const { productId } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState<any>(null);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [justAdded, setJustAdded] = useState(false);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);

  const addToast = (message: string, type: ToastType) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    apiRequest(`/inventory/${productId}`)
      .then(setProduct)
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId]);

  const cartCustomization = useMemo(
    () => ({
      text: '',
      font: 'Arial',
      color: selectedColor || '#000000',
      size: selectedSize,
      placement: 'Center Front',
    }),
    [selectedColor, selectedSize],
  );

  const handleAddToCart = () => {
    addItem(product, cartCustomization, quantity);
    addToast('Added to cart', 'success');
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        <div className="h-4 w-48 bg-slate-100 rounded animate-pulse mb-6" />
        <div className="grid lg:grid-cols-2 gap-12">
          <div className="space-y-3">
            <div className="aspect-square rounded-2xl bg-slate-100 animate-pulse" />
            <div className="grid grid-cols-4 gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-8 w-3/4 bg-slate-100 rounded animate-pulse" />
            <div className="h-5 w-1/3 bg-slate-100 rounded animate-pulse" />
            <div className="h-20 bg-slate-100 rounded animate-pulse" />
            <div className="h-12 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <NotFound
        title="Product not found"
        message="We couldn't find this product. It may have been removed."
      />
    );
  }

  const available = (product.stock || 0) - (product.reservedStock || 0);
  const inStock = available > 0;
  const lowStock = inStock && available <= 5;
  // Build a small thumbnail list — for now just repeats the same image; if your
  // product schema adds an `images` array later, swap to that.
  const thumbnails = [product.image, product.image, product.image, product.image];

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white min-h-screen">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 md:py-10">
        {/* Breadcrumb */}
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to products
        </Link>

        <div className="grid lg:grid-cols-5 gap-10 lg:gap-14">
          {/* Image gallery */}
          <div className="lg:col-span-3">
            <div className="relative aspect-square rounded-3xl overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/50 shadow-sm border border-slate-100">
              <img
                src={thumbnails[activeImageIdx]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              {/* Category tag */}
              <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[10px] font-bold text-slate-700 uppercase tracking-wider shadow-sm">
                {product.category}
              </div>
              {lowStock && (
                <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                  Only {available} left
                </div>
              )}
            </div>
            {/* Thumbnails */}
            <div className="grid grid-cols-4 gap-2.5 mt-3">
              {thumbnails.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImageIdx(i)}
                  className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                    activeImageIdx === i
                      ? 'border-blue-600 shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <img src={src} alt={`${product.name} view ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Product info */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider">
                  {product.category}
                </span>
                <div className="flex items-center gap-0.5 text-amber-400">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                  ))}
                  <span className="ml-1 text-xs font-bold text-slate-700">4.9</span>
                  <span className="text-xs text-slate-400">(124)</span>
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-slate-900 leading-tight mb-3 tracking-tight">
                {product.name}
              </h1>
              <p className="text-slate-600 leading-relaxed">{product.description}</p>
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-3 pb-6 border-b border-slate-100">
              <span className="text-4xl font-black text-slate-900">{formatPeso(product.price)}</span>
              <span className="text-sm text-slate-500">starting price</span>
            </div>

            {/* SKU & stock */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">SKU</p>
                <p className="text-sm font-mono text-slate-700">{product.sku}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Availability</p>
                <p className={`text-sm font-bold ${inStock ? (lowStock ? 'text-amber-700' : 'text-emerald-600') : 'text-rose-600'}`}>
                  {inStock ? `${available} in stock` : 'Out of stock'}
                </p>
              </div>
            </div>

            {/* Customization callout */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 text-white p-5">
              <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
              <div className="relative flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">3D customization</p>
                  </div>
                  <h4 className="font-bold text-base leading-snug mb-1">Make it 100% yours</h4>
                  <p className="text-sm text-white/85 leading-relaxed">
                    Add text, upload images, change colors and materials — preview in 3D before you buy.
                  </p>
                </div>
              </div>
            </div>

            {/* Quantity & actions */}
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Quantity</p>
                <div className="inline-flex items-center bg-slate-50 border border-slate-200 rounded-full p-1">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-full bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-colors disabled:opacity-50"
                    disabled={quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value || 1)))}
                    className="w-12 h-9 text-center bg-transparent font-bold text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-9 h-9 rounded-full bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  to={`/product/${productId}/customize`}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-br from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-200 hover:shadow-xl hover:shadow-blue-300 transition-all hover:-translate-y-0.5"
                >
                  Start customizing
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button
                  onClick={handleAddToCart}
                  disabled={!inStock || justAdded}
                  className={`flex-1 sm:flex-none sm:px-6 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-sm transition-all ${
                    justAdded
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200'
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  {justAdded ? 'Added!' : 'Add to cart'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Trust signals */}
        <div className="mt-16 md:mt-20 pt-12 border-t border-slate-100">
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-0.5">Quality guaranteed</h3>
                <p className="text-xs text-slate-600 leading-relaxed">Premium materials for long-lasting prints.</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-0.5">Fast production</h3>
                <p className="text-xs text-slate-600 leading-relaxed">Most orders ready in 3–5 business days.</p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-0.5">Free shipping</h3>
                <p className="text-xs text-slate-600 leading-relaxed">On orders over ₱500 nationwide.</p>
              </div>
            </div>
          </div>

          {/* Customer reviews */}
          <div className="mt-8">
            <ProductReviews sku={product.sku} />
          </div>
        </div>
      </div>
    </div>
  );
}
