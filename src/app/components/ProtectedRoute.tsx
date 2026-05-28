import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export type Role =
  | 'admin'
  | 'customer'
  | 'guest'
  | 'production_staff'
  | 'production_manager';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Single role or an array of allowed roles. Admin is implicitly allowed
   * everywhere so callers don't have to remember to add it to every list.
   * Pass `undefined` to require login only (no role check).
   */
  requiredRole?: Role | Role[];
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    // Admin is the super-user — never gets bounced from a role-protected route.
    const allowedWithAdmin = allowed.includes('admin') ? allowed : [...allowed, 'admin'];
    if (!allowedWithAdmin.includes(user.role as Role)) {
      // Send each role to its natural landing page when they hit a forbidden
      // route, so a production_staff user that accidentally clicks an admin
      // link lands on their own dashboard instead of the customer homepage.
      const fallback =
        user.role === 'production_staff' || user.role === 'production_manager'
          ? '/admin/production'
          : user.role === 'customer'
          ? '/dashboard'
          : '/';
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
}
