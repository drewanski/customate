import React from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  ClipboardList,
  Palette,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

/**
 * Customer-facing dashboard.
 * This fixes the 404 when navigating to /dashboard from the top nav and after login.
 */
export function CustomerDashboard() {
  const quickActions = [
    {
      title: 'Browse Products',
      description: 'Explore available items and start customizing.',
      to: '/products',
      Icon: Package,
    },
    {
      title: 'Track an Order',
      description: 'Check the latest status of your orders.',
      to: '/order-tracking',
      Icon: ClipboardList,
    },
    {
      title: 'Try Customization',
      description: 'Preview designs in the studio (sample product).',
      to: '/product/1/customize',
      Icon: Palette,
    },
  ];

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-600 mt-2">
              Quick access to products, customization, and order tracking.
            </p>
          </div>

          <Link
            to="/products"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Start a New Order <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          {quickActions.map(({ title, description, to, Icon }) => (
            <Link
              key={title}
              to={to}
              className="group bg-white border border-gray-200 rounded-2xl p-6 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                <Icon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="font-semibold text-gray-900 text-lg">{title}</div>
              <div className="text-sm text-gray-600 mt-1">{description}</div>
              <div className="text-blue-600 text-sm font-medium mt-4 inline-flex items-center gap-2">
                Open <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-white p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xl font-semibold">Tip</div>
              <p className="text-white/90 mt-1">
                Use the customization studio to preview your design before checkout.
              </p>
              <div className="mt-4">
                <Link
                  to="/components"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-blue-700 hover:bg-white/90 transition-colors"
                >
                  View UI Components <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
