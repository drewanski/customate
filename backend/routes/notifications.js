import express from 'express';
import Notification from '../models/Notification.js';
import { authMiddleware } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = express.Router();

/**
 * Get notifications for current user
 * GET /api/notifications
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { limit = 20, unreadOnly = false } = req.query;
    
    console.log('=== FETCHING NOTIFICATIONS ===');
    console.log('Request user ID:', req.user.userId);
    
    // Convert user ID to ObjectId for proper matching
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    console.log('Converted userId:', userId);
    
    // Build query - get notifications for this user OR admin notifications
    const query = {
      $or: [
        { user: userId },
        { target: 'admin', user: null } // Admin broadcast notifications
      ]
    };
    
    console.log('Query:', JSON.stringify(query, null, 2));
    
    if (unreadOnly === 'true') {
      query.read = false;
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('relatedData.productId', 'name image');
    
    console.log('Found notifications:', notifications.length);
    
    // Get unread count - use the same userId (ObjectId)
    const unreadQuery = {
      $or: [
        { user: userId },
        { target: 'admin', user: null }
      ],
      read: false
    };
    const unreadCount = await Notification.countDocuments(unreadQuery);
    
    console.log('Unread count:', unreadCount);
    
    res.json({
      notifications,
      unreadCount,
      total: notifications.length
    });
  } catch (error) {
    console.error('Get Notifications Error:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

/**
 * Mark notification as read
 * PUT /api/notifications/:id/read
 */
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.id,
        $or: [
          { user: userId },
          { target: 'admin', user: null }
        ]
      },
      { read: true, readAt: new Date() },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json({ success: true, notification });
  } catch (error) {
    console.error('Mark Read Error:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    await Notification.updateMany(
      {
        $or: [
          { user: userId },
          { target: 'admin', user: null }
        ],
        read: false
      },
      { read: true, readAt: new Date() }
    );
    
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark All Read Error:', error);
    res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      $or: [
        { user: userId },
        { target: 'admin', user: null }
      ]
    });
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete Notification Error:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

/**
 * Get unread count only (for badge)
 * GET /api/notifications/unread-count
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const unreadCount = await Notification.countDocuments({
      $or: [
        { user: userId },
        { target: 'admin', user: null }
      ],
      read: false
    });
    
    res.json({ unreadCount });
  } catch (error) {
    console.error('Unread Count Error:', error);
    res.status(500).json({ message: 'Failed to get unread count' });
  }
});

/**
 * Debug: Get all notifications (admin only)
 * GET /api/notifications/debug
 */
router.get('/debug', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      count: notifications.length,
      notifications: notifications.map(n => ({
        _id: n._id,
        user: n.user,
        type: n.type,
        title: n.title,
        target: n.target,
        read: n.read,
        createdAt: n.createdAt
      }))
    });
  } catch (error) {
    console.error('Debug Error:', error);
    res.status(500).json({ message: 'Failed to fetch debug data' });
  }
});

/**
 * Test: Create a test notification for current user
 * POST /api/notifications/test
 */
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);
    
    // Create a test notification
    const notification = new Notification({
      user: userId,
      type: 'general',
      title: 'Test Notification',
      message: `This is a test notification for user ${req.user.userId}`,
      target: 'customer',
      priority: 'normal',
      read: false
    });
    
    await notification.save();
    console.log('Test notification created:', notification._id);
    
    // Immediately query for it
    const found = await Notification.find({ user: userId });
    console.log('Found notifications after creation:', found.length);
    
    res.json({
      success: true,
      created: notification,
      queryResult: {
        count: found.length,
        notifications: found.map(n => ({
          _id: n._id,
          user: n.user?.toString(),
          title: n.title,
          createdAt: n.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Test Error:', error);
    res.status(500).json({ message: 'Failed to create test notification', error: error.message });
  }
});

/**
 * Create notification (admin only - for testing/manual creation)
 * POST /api/notifications
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const notification = new Notification(req.body);
    await notification.save();
    
    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      if (req.body.target === 'admin' || req.body.target === 'all') {
        io.emit('notification:new', notification);
      }
      if (req.body.user) {
        io.to(`user_${req.body.user}`).emit('notification:new', notification);
      }
    }
    
    res.status(201).json({ success: true, notification });
  } catch (error) {
    console.error('Create Notification Error:', error);
    res.status(500).json({ message: 'Failed to create notification' });
  }
});

export default router;
