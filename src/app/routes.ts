import React, { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { CustomerLayout } from './layouts/CustomerLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';

// ─── Lazy page imports ────────────────────────────────────────────────────
// Each page is loaded as a separate chunk so customers don't ship admin code
// and vice versa. Vite turns each dynamic import() into its own JS chunk.
//
// React.lazy() requires a default export, so named exports are unwrapped via
// .then(m => ({ default: m.Foo })). This trades one line for ~50–60% smaller
// initial bundle on the customer flow.

// Public / customer
const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })));
const ProductCatalog = lazy(() => import('./pages/ProductCatalog').then((m) => ({ default: m.ProductCatalog })));
const ProductDetail = lazy(() => import('./pages/ProductDetail').then((m) => ({ default: m.ProductDetail })));
const CustomizationStudio = lazy(() => import('./pages/CustomizationStudio').then((m) => ({ default: m.CustomizationStudio })));
const Cart = lazy(() => import('./pages/Cart').then((m) => ({ default: m.Cart })));
const OrderTracking = lazy(() => import('./pages/OrderTracking').then((m) => ({ default: m.OrderTracking })));
const Checkout = lazy(() => import('./pages/Checkout').then((m) => ({ default: m.Checkout })));
const ComponentLibrary = lazy(() => import('./pages/ComponentLibrary').then((m) => ({ default: m.ComponentLibrary })));
const CustomerDashboard = lazy(() => import('./pages/CustomerDashboard').then((m) => ({ default: m.CustomerDashboard })));
const Profile = lazy(() => import('./pages/Profile'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess').then((m) => ({ default: m.PaymentSuccess })));
const PaymentCancel = lazy(() => import('./pages/PaymentCancel').then((m) => ({ default: m.PaymentCancel })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })));

// Auth (single file, multiple exports)
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/Auth').then((m) => ({ default: m.ResetPassword })));

// Admin (separate chunks — never shipped to customers)
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminOrders = lazy(() => import('./pages/AdminOrders').then((m) => ({ default: m.AdminOrders })));
const AdminInventory = lazy(() => import('./pages/AdminInventory').then((m) => ({ default: m.AdminInventory })));
const AdminProduction = lazy(() => import('./pages/AdminProduction').then((m) => ({ default: m.AdminProduction })));
const AdminUsers = lazy(() => import('./pages/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminReports = lazy(() => import('./pages/AdminReports').then((m) => ({ default: m.AdminReports })));
const AdminCoupons = lazy(() => import('./pages/AdminCoupons').then((m) => ({ default: m.AdminCoupons })));
const AdminCalendar = lazy(() => import('./pages/AdminCalendar').then((m) => ({ default: m.AdminCalendar })));
const AdminDesignPrint = lazy(() => import('./pages/AdminDesignPrint').then((m) => ({ default: m.AdminDesignPrint })));
const AdminReviewsPage = lazy(() => import('./pages/AdminReviews').then((m) => ({ default: m.AdminReviews })));
const StaffTaskBoard = lazy(() => import('./pages/StaffTaskBoard').then((m) => ({ default: m.StaffTaskBoard })));

// ─── Suspense fallback ────────────────────────────────────────────────────
const PageLoader = () =>
  React.createElement(
    'div',
    { className: 'min-h-screen flex items-center justify-center bg-slate-50' },
    React.createElement(
      'div',
      { className: 'flex flex-col items-center gap-3' },
      React.createElement('div', {
        className: 'w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin',
      }),
      React.createElement('p', { className: 'text-xs text-slate-500' }, 'Loading…')
    )
  );

// Wrap a lazy component in Suspense + ErrorBoundary so a single chunk failure
// (e.g. flaky network) shows a graceful fallback instead of a blank page.
const withSuspense = (Component: React.ComponentType): React.ComponentType => () =>
  React.createElement(
    ErrorBoundary,
    null,
    React.createElement(
      Suspense,
      { fallback: React.createElement(PageLoader) },
      React.createElement(Component)
    )
  );

// Protected wrappers (auth gate → suspense → page)
const CustomerDashboardProtected = () =>
  React.createElement(
    ProtectedRoute,
    {
      requiredRole: 'customer',
      children: React.createElement(withSuspense(CustomerDashboard)),
    }
  );

// CustomizationStudio is intentionally PUBLIC — anyone can try the studio
// (3D preview, text/image upload, AI assistant) before signing up. The page
// itself gates the add-to-cart action behind a login prompt.

const CartProtected = () =>
  React.createElement(
    ProtectedRoute,
    {
      requiredRole: 'customer',
      children: React.createElement(withSuspense(Cart)),
    }
  );

const OrderTrackingProtected = () =>
  React.createElement(
    ProtectedRoute,
    {
      requiredRole: 'customer',
      children: React.createElement(withSuspense(OrderTracking)),
    }
  );

const CheckoutProtected = () =>
  React.createElement(
    ProtectedRoute,
    {
      requiredRole: 'customer',
      children: React.createElement(withSuspense(Checkout)),
    }
  );

const ProfileProtected = () =>
  React.createElement(
    ProtectedRoute,
    {
      requiredRole: 'customer',
      children: React.createElement(withSuspense(Profile)),
    }
  );

// Any staff-level role can reach the admin layout itself — the AdminLayout
// hides nav items the current role can't use, and each inner page enforces
// its own role gate. This keeps the shell consistent across all 3 internal
// roles instead of building three separate layouts.
const AdminLayoutProtected = () =>
  React.createElement(
    ProtectedRoute,
    {
      requiredRole: ['admin', 'production_staff'],
      children: React.createElement(AdminLayout),
    }
  );

export const router = createBrowserRouter([
  {
    path: '/',
    Component: CustomerLayout,
    children: [
      { index: true, Component: withSuspense(Landing) },
      { path: 'products', Component: withSuspense(ProductCatalog) },
      { path: 'dashboard', Component: CustomerDashboardProtected },
      { path: 'product/:productId', Component: withSuspense(ProductDetail) },
      { path: 'product/:productId/customize', Component: withSuspense(CustomizationStudio) },
      { path: 'cart', Component: CartProtected },
      { path: 'checkout', Component: CheckoutProtected },
      { path: 'order-tracking', Component: OrderTrackingProtected },
      { path: 'order-tracking/:orderId', Component: OrderTrackingProtected },
      { path: 'profile', Component: ProfileProtected },
      { path: 'components', Component: withSuspense(ComponentLibrary) },
      { path: 'payment/success', Component: withSuspense(PaymentSuccess) },
      { path: 'payment/cancel', Component: withSuspense(PaymentCancel) },
      { path: 'privacy', Component: withSuspense(Privacy) },
      { path: 'terms', Component: withSuspense(Terms) },
      // 404 catch-all for unknown URLs within the customer layout
      { path: '*', Component: withSuspense(NotFound) },
    ],
  },
  { path: '/login', Component: withSuspense(Login) },
  { path: '/register', Component: withSuspense(Register) },
  { path: '/forgot-password', Component: withSuspense(ForgotPassword) },
  { path: '/reset-password', Component: withSuspense(ResetPassword) },
  {
    path: '/admin',
    Component: AdminLayoutProtected,
    children: [
      // Default landing: admin sees the KPI dashboard. Staff would never
      // reach this URL because their ProtectedRoute fallback redirects to
      // /admin/my-tasks; if they somehow navigate manually, the index
      // component is still wrapped in an admin-only gate below.
      {
        index: true,
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: 'admin',
          children: React.createElement(withSuspense(AdminDashboard)),
        }),
      },

      // Staff-only task board — exact opposite of the admin dashboard.
      // Staff sees ONLY this; admin can visit too if they want to test it.
      {
        path: 'my-tasks',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: ['admin', 'production_staff'],
          children: React.createElement(withSuspense(StaffTaskBoard)),
        }),
      },

      // Operations pages — admin only. Staff use /my-tasks instead.
      {
        path: 'production',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: 'admin',
          children: React.createElement(withSuspense(AdminProduction)),
        }),
      },
      {
        path: 'calendar',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: 'admin',
          children: React.createElement(withSuspense(AdminCalendar)),
        }),
      },
      {
        path: 'inventory',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: 'admin',
          children: React.createElement(withSuspense(AdminInventory)),
        }),
      },

      // Orders — manager + admin can manage; staff redirected to production
      // because they don't see financial data.
      {
        path: 'orders',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: ['admin'],
          children: React.createElement(withSuspense(AdminOrders)),
        }),
      },
      {
        path: 'orders/:orderId',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: ['admin'],
          children: React.createElement(withSuspense(OrderTracking)),
        }),
      },
      {
        path: 'orders/:orderId/design',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: ['admin', 'production_staff'],
          children: React.createElement(withSuspense(AdminDesignPrint)),
        }),
      },

      // Admin-only finance + account configuration.
      {
        path: 'users',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: 'admin',
          children: React.createElement(withSuspense(AdminUsers)),
        }),
      },
      {
        path: 'reports',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: 'admin',
          children: React.createElement(withSuspense(AdminReports)),
        }),
      },
      {
        path: 'coupons',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: 'admin',
          children: React.createElement(withSuspense(AdminCoupons)),
        }),
      },
      {
        path: 'reviews',
        Component: () => React.createElement(ProtectedRoute, {
          requiredRole: ['admin'],
          children: React.createElement(withSuspense(AdminReviewsPage)),
        }),
      },
    ],
  },
]);
