import Notification from '../models/Notification.js';
import mongoose from 'mongoose';

/**
 * Notification Service - Helper functions for creating notifications
 */

class NotificationService {
  constructor(io) {
    this.io = io;
  }

  /**
   * Create a new notification
   */
  async create({ user, type, title, message, relatedData = {}, target = 'customer', priority = 'normal' }) {
    try {
      console.log('=== CREATING NOTIFICATION ===');
      console.log('Input user:', user, 'Type:', typeof user);
      
      // Convert user to ObjectId if it's a string
      const userId = user ? (typeof user === 'string' ? new mongoose.Types.ObjectId(user) : user) : null;
      console.log('Converted userId:', userId, 'Type:', typeof userId);
      
      const notification = new Notification({
        user: userId,
        type,
        title,
        message,
        relatedData,
        target,
        priority,
        read: false
      });

      console.log('Notification object before save:', JSON.stringify(notification, null, 2));
      await notification.save();
      console.log('Notification saved successfully! ID:', notification._id);
      
      // Verify it was saved
      const verify = await Notification.findById(notification._id);
      console.log('Verification - found in DB:', !!verify);

      // Emit real-time notification via Socket.io
      if (this.io) {
        if (target === 'admin' || target === 'all') {
          this.io.emit('notification:new', notification);
        }
        if (user) {
          this.io.to(`user_${user}`).emit('notification:new', notification);
        }
      }

      return notification;
    } catch (error) {
      console.error('Create Notification Error:', error);
      return null;
    }
  }

  /**
   * Notify customer of order confirmation
   */
  async notifyOrderConfirmation(order, userId) {
    return this.create({
      user: userId,
      type: 'order_confirmation',
      title: 'Order Confirmed! 🎉',
      message: `Your order #${order.orderNumber} has been received and is being processed.`,
      relatedData: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount
      },
      target: 'customer',
      priority: 'high'
    });
  }

  /**
   * Notify customer of order status update
   */
  async notifyOrderStatusUpdate(order, userId, oldStatus, newStatus) {
    const statusMessages = {
      pending: 'Your order is pending approval.',
      approved: 'Your order has been approved and is in production!',
      in_production: 'Your order is currently being printed.',
      ready: 'Your order is ready for pickup/delivery!',
      completed: 'Your order has been completed. Thank you!',
      cancelled: 'Your order has been cancelled.',
      rejected: 'Your order was not approved.'
    };

    return this.create({
      user: userId,
      type: 'order_status_update',
      title: `Order ${newStatus.replace('_', ' ').toUpperCase()}`,
      message: statusMessages[newStatus] || `Your order status has been updated to ${newStatus}.`,
      relatedData: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: newStatus
      },
      target: 'customer',
      priority: 'high'
    });
  }

  /**
   * Notify admins of new incoming order
   */
  async notifyNewOrder(order) {
    // Create notification for all admins
    const notification = await this.create({
      user: null, // null = broadcast to all admins
      type: 'new_order_alert',
      title: '🛒 New Order Received!',
      message: `Order #${order.orderNumber} - ₱${order.totalAmount.toLocaleString()} - ${order.items.length} items`,
      relatedData: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount
      },
      target: 'admin',
      priority: 'urgent'
    });

    return notification;
  }

  /**
   * Notify admin of low stock
   */
  async notifyLowStock(inventoryItem) {
    return this.create({
      user: null,
      type: 'low_stock',
      title: '⚠️ Low Stock Alert',
      message: `${inventoryItem.name} (${inventoryItem.sku}) is running low. Only ${inventoryItem.stock} units remaining.`,
      relatedData: {
        productId: inventoryItem._id
      },
      target: 'admin',
      priority: 'high'
    });
  }

  /**
   * Notify customer of payment received
   */
  async notifyPaymentReceived(order, userId, paymentAmount) {
    return this.create({
      user: userId,
      type: 'payment_received',
      title: 'Payment Received ✓',
      message: `Payment of ₱${paymentAmount.toLocaleString()} for order #${order.orderNumber} has been confirmed.`,
      relatedData: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount: paymentAmount
      },
      target: 'customer',
      priority: 'normal'
    });
  }

  /**
   * Get notifications for a user
   */
  async getForUser(userId, options = {}) {
    const { limit = 20, unreadOnly = false } = options;
    
    const query = {
      $or: [
        { user: userId },
        { target: 'admin', user: null }
      ]
    };
    
    if (unreadOnly) {
      query.read = false;
    }
    
    return Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId) {
    return Notification.countDocuments({
      $or: [
        { user: userId },
        { target: 'admin', user: null }
      ],
      read: false
    });
  }

  /**
   * Mark as read
   */
  async markAsRead(notificationId, userId) {
    return Notification.findOneAndUpdate(
      {
        _id: notificationId,
        $or: [
          { user: userId },
          { target: 'admin', user: null }
        ]
      },
      { read: true, readAt: new Date() },
      { new: true }
    );
  }

  /**
   * Mark all as read for user
   */
  async markAllAsRead(userId) {
    return Notification.updateMany(
      {
        $or: [
          { user: userId },
          { target: 'admin', user: null }
        ],
        read: false
      },
      { read: true, readAt: new Date() }
    );
  }

  // ─── Staff → Admin event notifications ─────────────────────────────
  // These three methods are called from the production routes whenever a
  // production_staff user takes an action the admin needs to know about.
  // All three create an admin-target notification (user=null) so every
  // admin sees it in the bell.

  /**
   * Staff started physical production on a task. Useful for SLA tracking
   * and "what's actively being worked on right now" dashboards.
   */
  async notifyAdminsOfStaffStart(order, staffUser) {
    return this.create({
      user: null,
      target: 'admin',
      type: 'production_started',
      priority: 'normal',
      title: 'Staff started production',
      message: `${staffUser?.name || 'A staff member'} started Order #${String(order._id).slice(-6)}.`,
      relatedData: { orderId: String(order._id), staffId: String(staffUser?.userId || staffUser?._id || '') },
    });
  }

  /**
   * Staff finished work and submitted a QC photo. Admin must approve
   * before the order moves to ready and the customer is notified.
   */
  async notifyAdminsOfQcRequest(order, staffUser) {
    return this.create({
      user: null,
      target: 'admin',
      type: 'qc_review_requested',
      priority: 'high',
      title: 'QC review needed',
      message: `${staffUser?.name || 'Staff'} finished Order #${String(order._id).slice(-6)} — review the QC photo.`,
      relatedData: { orderId: String(order._id), staffId: String(staffUser?.userId || staffUser?._id || '') },
    });
  }

  /**
   * Staff flagged a blocker. Priority is auto-bumped on the order and we
   * push a high-priority alert so admin can unblock fast.
   */
  async notifyAdminsOfBlocker(order, staffUser) {
    return this.create({
      user: null,
      target: 'admin',
      type: 'blocker_raised',
      priority: 'high',
      title: 'Blocker raised',
      message: `${staffUser?.name || 'Staff'} flagged Order #${String(order._id).slice(-6)}: ${order.blockerReason || 'reason missing'}`,
      relatedData: {
        orderId: String(order._id),
        staffId: String(staffUser?.userId || staffUser?._id || ''),
        reason: order.blockerReason,
        note: order.blockerNote,
      },
    });
  }
}

export default NotificationService;
