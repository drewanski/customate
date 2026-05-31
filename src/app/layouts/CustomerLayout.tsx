import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ShoppingCart, User, Search } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import { Chatbot } from '../components/Chatbot';
import { NotificationBell } from '../components/NotificationBell';
import { useChatNotifications } from '../hooks/useChatNotifications';
import { ChatToast } from '../components/chat/ChatToast';

export function CustomerLayout() {
  const location = useLocation();
  const { totalItems } = useCart();
  const { user, loading } = useAuth();
  // Real-time chat-arrival toast for customers — slides in whenever the
  // store messages them or an automatic status update lands.
  const { toast: chatToast, dismissToast } = useChatNotifications();
  const isAuthenticated = Boolean(user) && localStorage.getItem('isAuthenticated') === 'true';
  
  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/products', label: 'Products' },
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
              <button className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors">
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
                  <NotificationBell />
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
      <Chatbot />
      <ChatToast toast={chatToast} onDismiss={dismissToast} viewerRole="customer" />
    </div>
  );
}
