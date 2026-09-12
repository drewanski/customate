import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, Search, X, Clock3, ArrowUpRight, Trash2, Sparkles } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { apiRequest } from '../api';
import { formatPeso } from '../utils/format';
import { Chatbot } from '../components/Chatbot';
import { NotificationBell } from '../components/NotificationBell';
import { useChatNotifications } from '../hooks/useChatNotifications';
import { ChatToast } from '../components/chat/ChatToast';

export function CustomerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const { user, loading } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('customate_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [products, setProducts] = useState<any[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popularSearches = ['T-shirts', 'Jerseys', 'Mugs', 'Tote bags', 'Tumblers', 'Mousepads'];

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    apiRequest('/inventory/public')
      .then((data) => {
        if (!cancelled) setProducts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSearch = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) return;
    setRecentSearches((previous) => {
      const next = [normalized, ...previous.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 6);
      localStorage.setItem('customate_recent_searches', JSON.stringify(next));
      return next;
    });
  };

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
  };

  const submitSearch = (value: string) => {
    const normalized = value.trim();
    if (normalized) {
      saveSearch(normalized);
      navigate(`/products?search=${encodeURIComponent(normalized)}`);
    } else {
      navigate('/products');
    }
    closeSearch();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitSearch(searchQuery);
  };

  useEffect(() => {
    if (!searchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  const matchingSuggestions = popularSearches.filter((item) =>
    !searchQuery.trim() || item.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );
  const productSuggestions = products
    .filter((product) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return `${product.name || ''} ${product.category || ''} ${product.description || ''}`.toLowerCase().includes(query);
    })
    .slice(0, 6);

  const openProduct = (product: any) => {
    const productId = product._id || product.id || product.sku;
    if (!productId) return;
    saveSearch(product.name || product.sku || 'Product');
    navigate(`/product/${productId}`);
    closeSearch();
  };
  // Real-time chat-arrival toast for customers — slides in whenever the
  // store messages them or an automatic status update lands.
  const { toast: chatToast, dismissToast } = useChatNotifications();
  const isAuthenticated = Boolean(user) && localStorage.getItem('isAuthenticated') === 'true';
  
  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/products', label: 'Products' },
    { to: '/orders', label: 'My Orders' },
    { to: '/dashboard', label: 'Dashboard' },
  ];
  
  return (
    <div className="min-h-screen flex flex-col bg-[#f1f1f1]">
      {/* Header */}
      <header className="bg-[#f1f1f1] border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="CustoMate"
                className="w-10 h-10 object-contain"
              />
              <span className="font-bold text-xl text-gray-900">CustoMate</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`font-medium transition-colors ${
                    location.pathname === link.to
                      ? 'text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            
            <div className="flex items-center gap-4">
              {/* Search first */}
              <button
                onClick={openSearch}
                className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors"
                aria-label="Search products"
              >
                <Search className="w-5 h-5" />
                <span className="text-sm font-medium">Search</span>
              </button>

              {/* Cart second */}
              <Link to="/cart" className="text-gray-600 hover:text-gray-900 transition-colors relative">
                <ShoppingCart className="w-5 h-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </Link>

              {/* Account last */}
              {!loading && isAuthenticated ? (
                <>
                  <NotificationBell userRole="customer" />
                  <Link to="/profile" className="text-gray-600 hover:text-gray-900 transition-colors" aria-label="Profile">
                    <User className="w-5 h-5" />
                  </Link>
                </>
              ) : !loading ? (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  Sign In
                </Link>
              ) : (
                <div className="h-9 w-20 rounded-lg bg-gray-200 animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </header>
      
      {/* Main */}
      <main className="flex-1 bg-[#f1f1f1]">
        <Outlet />
      </main>
      
      {/* Footer */}
      <footer className="bg-[#f1f1f1] border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">About</h3>
              <p className="text-sm text-gray-600">Custom printing services for all your needs.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Support</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li><a href="#" className="hover:text-blue-600">Contact Us</a></li>
                <li><a href="#" className="hover:text-blue-600">FAQ</a></li>
                <li><a href="#" className="hover:text-blue-600">Shipping</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Legal</h3>
              <ul className="text-sm text-gray-600 space-y-2">
                <li><Link to="/privacy" className="hover:text-blue-600">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-blue-600">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Follow Us</h3>
              <p className="text-sm text-gray-600">Stay connected on social media</p>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-600">
            © 2026 CustoMate - Bryle Closet Printing Services. All rights reserved.
          </div>
        </div>
      </footer>
      {/* Search overlay */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-md flex items-start justify-center pt-20 sm:pt-28 px-4"
          onClick={closeSearch}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl shadow-slate-950/20 w-full max-w-xl overflow-hidden border border-white/70"
            onClick={(e) => e.stopPropagation()}
          >
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 p-4 border-b border-slate-100">
              <Search className="w-5 h-5 text-blue-600 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products, categories, or materials"
                className="flex-1 min-w-0 text-base text-gray-900 placeholder:text-slate-400 outline-none bg-transparent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
              >
                Search
              </button>
            </form>
            <div className="p-4 sm:p-5 space-y-5">
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                    <Search className="w-3.5 h-3.5 text-blue-600" /> {searchQuery.trim() ? 'Products' : 'Featured products'}
                  </div>
                  {products.length > 6 && (
                    <button
                      type="button"
                      onClick={() => submitSearch(searchQuery)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700"
                    >
                      View all
                    </button>
                  )}
                </div>
                {productsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[1, 2, 3].map((item) => <div key={item} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}
                  </div>
                ) : productSuggestions.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {productSuggestions.map((product) => (
                      <button
                        key={product._id || product.id || product.sku}
                        type="button"
                        onClick={() => openProduct(product)}
                        className="flex items-center gap-3 rounded-xl border border-slate-200 p-2 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        <img
                          src={product.image || '/logo.png'}
                          alt=""
                          className="w-14 h-14 rounded-lg object-cover bg-slate-100 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-800">{product.name}</span>
                          <span className="block truncate text-xs text-slate-500">{product.category || 'Product'}</span>
                          <span className="block mt-0.5 text-xs font-black text-blue-600">{formatPeso(product.price || 0)}</span>
                        </span>
                        <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No products match that search.</p>
                )}
              </section>

              {recentSearches.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
                      <Clock3 className="w-3.5 h-3.5" /> Recent searches
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRecentSearches([]);
                        localStorage.removeItem('customate_recent_searches');
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => submitSearch(item)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {item}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="flex items-center gap-2 mb-2 text-xs font-black uppercase tracking-wider text-slate-500">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" /> {searchQuery.trim() ? 'Matching suggestions' : 'Popular searches'}
                </div>
                {matchingSuggestions.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {matchingSuggestions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => submitSearch(item)}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <span className="truncate">{item}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">No category suggestions yet. Press Search to see matching products.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
      <Chatbot />
      <ChatToast toast={chatToast} onDismiss={dismissToast} viewerRole="customer" />
    </div>
  );
}
