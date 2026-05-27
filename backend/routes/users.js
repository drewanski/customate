import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import UserAuditLog from '../models/UserAuditLog.js';
import Order from '../models/Order.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

/** Snapshot the admin for audit rows. */
async function actorSnapshot(req) {
  let name = '';
  try {
    const u = await User.findById(req.user.userId).select('name');
    if (u) name = u.name;
  } catch { /* non-fatal */ }
  return {
    performedBy: req.user.userId,
    performedByName: name,
    performedByRole: req.user.role || '',
  };
}

// Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new saved address
router.post('/me/addresses', authMiddleware, async (req, res) => {
  try {
    const { label, fullName, contactNumber, addressLine1, addressLine2, city, province, postalCode, isDefault } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (isDefault) {
      user.savedAddresses.forEach(addr => addr.isDefault = false);
    }

    user.savedAddresses.push({
      label,
      fullName,
      contactNumber,
      addressLine1,
      addressLine2,
      city,
      province,
      postalCode,
      isDefault: isDefault || user.savedAddresses.length === 0
    });

    await user.save();
    res.json(user.savedAddresses);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a saved address
router.put('/me/addresses/:addressId', authMiddleware, async (req, res) => {
  try {
    const { label, fullName, contactNumber, addressLine1, addressLine2, city, province, postalCode, isDefault } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const address = user.savedAddresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ message: 'Address not found' });

    if (isDefault) {
      user.savedAddresses.forEach(addr => addr.isDefault = false);
    }

    Object.assign(address, {
      label,
      fullName,
      contactNumber,
      addressLine1,
      addressLine2,
      city,
      province,
      postalCode,
      isDefault
    });

    await user.save();
    res.json(user.savedAddresses);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a saved address
router.delete('/me/addresses/:addressId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.savedAddresses.pull(req.params.addressId);
    
    // If we deleted the default, set the first one as default
    if (user.savedAddresses.length > 0 && !user.savedAddresses.some(a => a.isDefault)) {
      user.savedAddresses[0].isDefault = true;
    }

    await user.save();
    res.json(user.savedAddresses);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Save Expo push token — called from mobile after notification permission is granted.
// Idempotent: safe to call on every login (skips DB write if token unchanged).
router.put('/me/push-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken } = req.body;
    // Accept null/empty to clear the token (e.g. user disabled notifications)
    if (pushToken !== null && (typeof pushToken !== 'string' || !pushToken.trim())) {
      return res.status(400).json({ message: 'pushToken must be a non-empty string or null' });
    }
    await User.findByIdAndUpdate(req.user.userId, {
      expoPushToken: pushToken ? pushToken.trim() : null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users (admin only)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update current user profile
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { name, avatar, contactNumber } = req.body;
    const update = {};

    if (typeof name === 'string' && name.trim()) {
      update.name = name.trim();
    }

    if (typeof contactNumber !== 'undefined') {
      if (typeof contactNumber !== 'string' || !contactNumber.trim()) {
        return res.status(400).json({ message: 'Contact number is required' });
      }
      if (!/^(\+639|09)\d{9}$/.test(contactNumber.trim())) {
        return res.status(400).json({ message: 'Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)' });
      }
      update.contactNumber = contactNumber.trim();
    }

    if (typeof avatar !== 'undefined') {
      if (typeof avatar !== 'string') {
        return res.status(400).json({ message: 'Invalid avatar' });
      }
      if (avatar && !avatar.startsWith('data:image/')) {
        return res.status(400).json({ message: 'Invalid avatar' });
      }
      if (avatar && avatar.length > 2_000_000) {
        return res.status(400).json({ message: 'Avatar is too large' });
      }
      update.avatar = avatar;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'No changes provided' });
    }
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      update,
      { new: true, runValidators: true }
    ).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: update user (role/name/status)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role, name, status, contactNumber, reason } = req.body;
    const update = {};

    if (typeof role !== 'undefined') {
      if (!['customer', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role' });
      }
      update.role = role;
    }
    if (typeof name !== 'undefined') {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Invalid name' });
      }
      update.name = name.trim();
    }
    if (typeof contactNumber !== 'undefined') {
      if (typeof contactNumber !== 'string' || !contactNumber.trim()) {
        return res.status(400).json({ message: 'Contact number is required' });
      }
      if (!/^(\+639|09)\d{9}$/.test(contactNumber.trim())) {
        return res.status(400).json({ message: 'Please enter a valid Philippine phone number (e.g., +639XXXXXXXXX or 09XXXXXXXXX)' });
      }
      update.contactNumber = contactNumber.trim();
    }
    if (typeof status !== 'undefined') {
      if (!['active', 'inactive', 'suspended'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      update.status = status;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'No changes provided' });
    }

    // Snapshot the BEFORE state so the audit log can record from/to.
    const before = await User.findById(req.params.id).select('-password');
    if (!before) return res.status(404).json({ message: 'User not found' });

    const user = await User.findByIdAndUpdate(req.params.id, update, {
      new: true, runValidators: true,
    }).select('-password');

    // Audit log entries — one per changed field. Best-effort; failures
    // are non-fatal so the request still succeeds.
    const actor = await actorSnapshot(req);
    const writes = [];
    if (update.role && before.role !== update.role) {
      writes.push(UserAuditLog.create({
        user: user._id, userRef: user.name,
        type: 'role_changed', from: before.role, to: update.role,
        reason: reason || '', ...actor,
      }));
    }
    if (update.status && before.status !== update.status) {
      const type = update.status === 'suspended' ? 'suspended'
                 : update.status === 'active' && before.status === 'suspended' ? 'reactivated'
                 : 'status_changed';
      writes.push(UserAuditLog.create({
        user: user._id, userRef: user.name,
        type, from: before.status, to: update.status,
        reason: reason || '', ...actor,
      }));
    }
    if (update.name && before.name !== update.name) {
      writes.push(UserAuditLog.create({
        user: user._id, userRef: user.name,
        type: 'status_changed', from: before.name, to: update.name,
        note: 'Display name changed', ...actor,
      }));
    }
    await Promise.allSettled(writes);

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: delete user
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: bulk update users
router.put('/bulk/update', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userIds, updates } = req.body;
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'Invalid user IDs' });
    }
    
    const validUpdates = {};
    if (updates.role && ['customer', 'admin'].includes(updates.role)) {
      validUpdates.role = updates.role;
    }
    if (updates.status && ['active', 'inactive', 'suspended'].includes(updates.status)) {
      validUpdates.status = updates.status;
    }
    
    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({ message: 'No valid updates provided' });
    }
    
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      validUpdates
    );
    
    res.json({ 
      message: `Updated ${result.modifiedCount} users successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: get user statistics
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          customers: {
            $sum: { $cond: [{ $eq: ['$role', 'customer'] }, 1, 0] }
          },
          admins: {
            $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] }
          },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          inactive: {
            $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
          },
          suspended: {
            $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] }
          },
          recentLogins: {
            $sum: { $cond: [{ $gte: ['$lastLogin', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] }, 1, 0] }
          }
        }
      }
    ]);
    
    res.json(stats[0] || {
      total: 0,
      customers: 0,
      admins: 0,
      active: 0,
      inactive: 0,
      suspended: 0,
      recentLogins: 0
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/users/stats/summary  (admin)
 *
 * Comprehensive KPI tiles for the AdminUsers dashboard.
 */
router.get('/stats/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [total, customers, admins, active, suspended, newWeek, newMonth, withOrders] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'suspended' }),
      User.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Order.distinct('customer').then((ids) => ids.length).catch(() => 0),
    ]);

    res.json({
      total, customers, admins, active, suspended,
      newThisWeek: newWeek, newThisMonth: newMonth,
      activeCustomers: withOrders,
      conversionRate: customers > 0 ? Math.round((withOrders / customers) * 100) : 0,
    });
  } catch (err) {
    console.error('User stats error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/users/:id/activity  (admin)
 *
 * Aggregated activity for one customer — recent orders + audit timeline +
 * computed totals. Used to power the user-detail drawer.
 */
router.get('/:id/activity', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    const [user, orders, auditLogs, totalsAgg] = await Promise.all([
      User.findById(req.params.id).select('-password'),
      Order.find({ customer: req.params.id }).sort({ createdAt: -1 }).limit(20)
        .select('totalPrice totalQty status paymentStatus createdAt isBulk refundedAmount'),
      UserAuditLog.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(50),
      Order.aggregate([
        { $match: { customer: new mongoose.Types.ObjectId(req.params.id) } },
        {
          $group: {
            _id: null,
            orderCount: { $sum: 1 },
            totalSpent: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, '$totalPrice', 0] } },
            totalRefunded: { $sum: '$refundedAmount' },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ]),
    ]);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const totals = totalsAgg[0] || { orderCount: 0, totalSpent: 0, totalRefunded: 0, lastOrderAt: null };
    res.json({ user, recentOrders: orders, history: auditLogs, ...totals });
  } catch (err) {
    console.error('User activity error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/users/:id/note  (admin)
 */
router.post('/:id/note', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ message: 'note is required' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const actor = await actorSnapshot(req);
    const log = await UserAuditLog.create({
      user: user._id, userRef: user.name,
      type: 'note', note: String(note).trim(),
      ...actor,
    });
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/users/:id/history  (admin)
 */
router.get('/:id/history', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const logs = await UserAuditLog.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/users/export/csv  (admin)
 * Filters: role, status
 */
router.get('/export/csv', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role, status } = req.query;
    const filter = {};
    if (role && role !== 'all') filter.role = role;
    if (status && status !== 'all') filter.status = status;

    const users = await User.find(filter).select('-password').sort({ createdAt: -1 }).limit(5000);

    const escape = (v) => {
      if (v === undefined || v === null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const header = [
      'ID', 'Name', 'Email', 'Contact', 'Role', 'Status',
      'Email Verified', 'Created', 'Last Login',
    ].join(',');
    const rows = users.map((u) => [
      String(u._id).slice(-8),
      u.name,
      u.email,
      u.contactNumber || '',
      u.role,
      u.status,
      u.isEmailVerified ? 'yes' : 'no',
      u.createdAt ? new Date(u.createdAt).toISOString() : '',
      u.lastLogin ? new Date(u.lastLogin).toISOString() : '',
    ].map(escape).join(','));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
