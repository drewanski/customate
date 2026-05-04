import React from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { CustomerLayout } from './layouts/CustomerLayout';
import { AdminLayout } from './layouts/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Landing } from './pages/Landing';
import { Login, Register, ForgotPassword, ResetPassword } from './pages/Auth';
import { ProductCatalog } from './pages/ProductCatalog';
import { ProductDetail } from './pages/ProductDetail';
import { CustomizationStudio } from './pages/CustomizationStudio';
import { Cart } from './pages/Cart';
import { OrderTracking } from './pages/OrderTracking';
import { Checkout } from './pages/Checkout';
import { ComponentLibrary } from './pages/ComponentLibrary';
import { CustomerDashboard } from './pages/CustomerDashboard';
import AdminDashboard from './pages/AdminDashboard';
import { AdminOrders } from './pages/AdminOrders';
import { AdminInventory } from './pages/AdminInventory';
import { AdminProduction } from './pages/AdminProduction';
import { AdminUsers } from './pages/AdminUsers';
import { AdminReports } from './pages/AdminReports';
import Profile from './pages/Profile';
import { PaymentSuccess } from './pages/PaymentSuccess';
import { PaymentCancel } from './pages/PaymentCancel';

const CustomerDashboardProtected = () =>
  React.createElement(
    ProtectedRoute,
    { requiredRole: 'customer', children: React.createElement(CustomerDashboard) }
  );

const CustomizationStudioProtected = () =>
  React.createElement(
    ProtectedRoute,
    { requiredRole: 'customer', children: React.createElement(CustomizationStudio) }
  );

const CartProtected = () =>
  React.createElement(
    ProtectedRoute,
    { requiredRole: 'customer', children: React.createElement(Cart) }
  );

const OrderTrackingProtected = () =>
  React.createElement(
    ProtectedRoute,
    { requiredRole: 'customer', children: React.createElement(OrderTracking) }
  );

const CheckoutProtected = () =>
  React.createElement(
    ProtectedRoute,
    { requiredRole: 'customer', children: React.createElement(Checkout) }
  );

const ProfileProtected = () =>
  React.createElement(
    ProtectedRoute,
    { requiredRole: 'customer', children: React.createElement(Profile) }
  );

const AdminLayoutProtected = () =>
  React.createElement(
    ProtectedRoute,
    { requiredRole: 'admin', children: React.createElement(AdminLayout) }
  );

export const router = createBrowserRouter([
  {
    path: '/',
    Component: CustomerLayout,
    children: [
      { index: true, Component: Landing },
      { path: 'products', Component: ProductCatalog },
      { path: 'dashboard', Component: CustomerDashboardProtected },
      { path: 'product/:productId', Component: ProductDetail },
      { path: 'product/:productId/customize', Component: CustomizationStudio },
      { path: 'cart', Component: CartProtected },
      { path: 'checkout', Component: CheckoutProtected },
      { path: 'order-tracking', Component: OrderTrackingProtected },
      { path: 'order-tracking/:orderId', Component: OrderTrackingProtected },
      { path: 'profile', Component: ProfileProtected },
      { path: 'components', Component: ComponentLibrary },
      { path: 'payment/success', Component: PaymentSuccess },
      { path: 'payment/cancel', Component: PaymentCancel },
    ],
  },
  {
    path: '/login',
    Component: Login,
  },
  {
    path: '/register',
    Component: Register,
  },
  {
    path: '/forgot-password',
    Component: ForgotPassword,
  },
  {
    path: '/reset-password',
    Component: ResetPassword,
  },
  {
    path: '/admin',
    Component: AdminLayoutProtected,
    children: [
      { index: true, Component: AdminDashboard },
      { path: 'orders', Component: AdminOrders },
      { path: 'orders/:orderId', Component: OrderTracking },
      { path: 'users', Component: AdminUsers },
      { path: 'inventory', Component: AdminInventory },
      { path: 'production', Component: AdminProduction },
      { path: 'reports', Component: AdminReports },
    ],
  },
]);