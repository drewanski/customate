import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  // Who receives this notification
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // null = admin broadcast
  },
  
  // Notification type
  type: {
    type: String,
    enum: ['order_confirmation', 'order_status_update', 'new_order_alert', 'low_stock', 'payment_received', 'general'],
    required: true
  },
  
  // Title and message
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  
  // Related data (order, product, etc.)
  relatedData: {
    orderId: { type: String },
    orderNumber: { type: String },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    status: { type: String },
    amount: { type: Number }
  },
  
  // Target audience
  target: {
    type: String,
    enum: ['customer', 'admin', 'all'],
    default: 'customer'
  },
  
  // Read status
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Delivery channels
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  }
});

// Indexes for faster queries
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ target: 1, read: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
