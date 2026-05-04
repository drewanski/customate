import express from 'express';
import User from '../models/User.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

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
    const { role, name, status, contactNumber } = req.body;
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

    const user = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
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

export default router;
