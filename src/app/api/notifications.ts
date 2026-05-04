import { apiRequest } from '../api';

export interface Notification {
  _id: string;
  type: 'order_confirmation' | 'order_status_update' | 'new_order_alert' | 'low_stock' | 'payment_received' | 'general';
  title: string;
  message: string;
  relatedData?: {
    orderId?: string;
    orderNumber?: string;
    productId?: string;
    status?: string;
    amount?: number;
  };
  target: 'customer' | 'admin' | 'all';
  read: boolean;
  readAt?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt: string;
}

export async function getNotifications(limit = 20, unreadOnly = false): Promise<{
  notifications: Notification[];
  unreadCount: number;
  total: number;
}> {
  return apiRequest(`/notifications?limit=${limit}&unreadOnly=${unreadOnly}`);
}

export async function getUnreadCount(): Promise<{ unreadCount: number }> {
  return apiRequest('/notifications/unread-count');
}

export async function markAsRead(notificationId: string): Promise<{ success: boolean; notification: Notification }> {
  return apiRequest(`/notifications/${notificationId}/read`, {
    method: 'PUT'
  });
}

export async function markAllAsRead(): Promise<{ success: boolean; message: string }> {
  return apiRequest('/notifications/read-all', {
    method: 'PUT'
  });
}

export async function deleteNotification(notificationId: string): Promise<{ success: boolean; message: string }> {
  return apiRequest(`/notifications/${notificationId}`, {
    method: 'DELETE'
  });
}
