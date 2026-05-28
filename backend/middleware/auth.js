import jwt from 'jsonwebtoken';

export function authMiddleware(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
}

/**
 * Legacy strict admin gate. Use for finance / account / system-config routes
 * that production staff and managers must never touch (payments, coupons,
 * user role changes, AI quota configuration).
 */
export function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
}

/**
 * Generic role allow-list middleware factory.
 *
 *   router.get('/foo', authMiddleware, requireRoles('admin', 'production_manager'), handler);
 *
 * Returns 403 with a list of accepted roles in the response body so the
 * frontend can surface a useful error instead of "Forbidden".
 *
 * The convention across the codebase: ALWAYS chain after authMiddleware,
 * never use this alone — req.user must already be populated by the time
 * the role check runs.
 */
export function requireRoles(...roles) {
  const allowList = roles.flat().filter(Boolean);
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!allowList.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Insufficient permissions for this action',
        requiredRoles: allowList,
        yourRole: req.user.role,
      });
    }
    next();
  };
}

// Convenience aliases used by the production routes. Keep these named so
// route files read as English: requireProductionStaff, requireManager, etc.
export const requireManager = requireRoles('admin', 'production_manager');
export const requireProductionStaff = requireRoles(
  'admin',
  'production_manager',
  'production_staff',
);
