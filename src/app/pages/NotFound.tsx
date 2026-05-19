import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Compass, Home, ArrowLeft, ShoppingBag } from 'lucide-react';

/**
 * 404 page — shown for unknown URLs OR for missing products/orders
 * (used both as a route fallback and as an inline component).
 */
export function NotFound({
  title = 'Page not found',
  message = "We couldn't find what you were looking for. The page may have moved or no longer exists.",
  showBack = true,
}: {
  title?: string;
  message?: string;
  showBack?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-12 bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-md text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-200">
          <Compass className="w-10 h-10 text-white" />
        </div>

        <div className="text-6xl font-black text-slate-900 mb-2 tracking-tight">404</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">{title}</h1>
        <p className="text-slate-600 mb-2">{message}</p>
        {location.pathname && (
          <p className="text-xs text-slate-400 font-mono mb-8 break-all">
            {location.pathname}
          </p>
        )}

        <div className="flex items-center justify-center gap-2 flex-wrap">
          {showBack && (
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-full border border-slate-200 shadow-sm transition-all hover:scale-105"
            >
              <ArrowLeft className="w-4 h-4" />
              Go back
            </button>
          )}
          <Link
            to="/"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-full shadow-lg shadow-blue-200 transition-all hover:scale-105"
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
          <Link
            to="/products"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-full border border-slate-200 shadow-sm transition-all hover:scale-105"
          >
            <ShoppingBag className="w-4 h-4" />
            Browse products
          </Link>
        </div>
      </div>
    </div>
  );
}
