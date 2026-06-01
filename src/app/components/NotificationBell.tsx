import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Trash2, ShoppingBag, Package, AlertTriangle, CheckCircle, Wifi, WifiOff } from 'lucide-react';
import { useAdminNotifications, Notification } from '../hooks/useAdminNotifications';
import { ToastType } from './Toast';

/**
 * Where should a notification take you when you click it? Routes by
 * type + related data so the admin (or customer) lands directly on
 * the action surface instead of having to search for the order.
 */
function notificationHref(n: Notification, role: string | undefined): string | null {
  const orderId = n.relatedData?.orderId;
  if (!orderId) return null;
  const isStaff = role === 'admin' || role === 'production_staff';
  if (n.type === 'chat_message') {
    return isStaff ? `/admin/messages?orderId=${orderId}` : `/order-tracking/${orderId}`;
  }
  // Order-related notifications (status updates, courier assigned, new orders, etc.)
  return isStaff ? `/admin/orders?id=${orderId}` : `/order-tracking/${orderId}`;
}

// API base — relative paths (/api/...) get sent to whatever origin is
// serving the SPA, which is *not* the backend in prod (Hostinger vs Render)
// nor in dev (Vite on 5173 vs Express on 4000). Hit the env-configured
// backend directly so the bell actually populates.
const API_BASE: string = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api';

// Simple API functions to avoid import issues
async function deleteNotification(notificationId: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE}/notifications/${notificationId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Failed to delete notification');
    return response.json();
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
}

interface NotificationBellProps {
  userRole?: string;
}

// Local toast helper
const addToast = (message: string, type: ToastType) => {
  const event = new CustomEvent('show-toast', { 
    detail: { message, type, id: Date.now().toString() } 
  });
  window.dispatchEvent(event);
};

export function NotificationBell({ userRole }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  // Use admin notifications hook for admin users
  const adminNotifications = useAdminNotifications();
  
  // For regular customers, use the basic notification system
  const [customerNotifications, setCustomerNotifications] = useState<Notification[]>([]);
  const [customerUnreadCount, setCustomerUnreadCount] = useState(0);
  const [customerLoading, setCustomerLoading] = useState(false);
  
  const isAdmin = userRole === 'admin';
  const notifications = isAdmin ? adminNotifications.notifications : customerNotifications;
  const unreadCount = isAdmin ? adminNotifications.unreadCount : customerUnreadCount;
  const loading = isAdmin ? adminNotifications.loading : customerLoading;
  
  // Customer notification fetching (for non-admins)
  const fetchCustomerNotifications = useCallback(async () => {
    try {
      setCustomerLoading(true);
      const response = await fetch(`${API_BASE}/notifications?limit=20&unreadOnly=false`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const data = await response.json();
      setCustomerNotifications(data.notifications);
      setCustomerUnreadCount(data.unreadCount);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  // Customer notifications effect
  useEffect(() => {
    if (!isAdmin) {
      fetchCustomerNotifications();
      const interval = setInterval(fetchCustomerNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, fetchCustomerNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Refresh when dropdown opens
  useEffect(() => {
    if (isOpen) {
      if (isAdmin) {
        adminNotifications.refreshNotifications();
      } else {
        fetchCustomerNotifications();
      }
    }
  }, [isOpen, isAdmin, adminNotifications, fetchCustomerNotifications]);

  const handleMarkAsRead = isAdmin ? adminNotifications.markAsRead : async (id: string) => {
    try {
      const response = await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to mark as read');
      
      setCustomerNotifications(prev => 
        prev.map(n => n._id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)
      );
      setCustomerUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      addToast('Failed to mark notification as read', 'error');
    }
  };

  const handleMarkAllAsRead = isAdmin ? adminNotifications.markAllAsRead : async () => {
    try {
      setCustomerLoading(true);
      const response = await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to mark all as read');
      
      setCustomerNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setCustomerUnreadCount(0);
      addToast('All notifications marked as read', 'success');
    } catch (err) {
      addToast('Failed to mark all as read', 'error');
    } finally {
      setCustomerLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      if (isAdmin) {
        // Admin notifications are managed by the hook
        adminNotifications.refreshNotifications();
      } else {
        setCustomerNotifications(prev => prev.filter(n => n._id !== id));
        const deletedNotification = customerNotifications.find(n => n._id === id);
        if (deletedNotification && !deletedNotification.read) {
          setCustomerUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch (err) {
      addToast('Failed to delete notification', 'error');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order_confirmation':
      case 'new_order_alert':
        return <ShoppingBag className="w-5 h-5 text-blue-500" />;
      case 'order_status_update':
        return <Package className="w-5 h-5 text-green-500" />;
      case 'low_stock':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'payment_received':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Bell className="w-5 h-5 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'border-l-red-500';
      case 'high':
        return 'border-l-orange-500';
      case 'normal':
        return 'border-l-blue-500';
      default:
        return 'border-l-gray-300';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-50 max-h-[500px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={loading}
                className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                <Check className="w-4 h-4" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const href = notificationHref(notification, userRole);
                const onCardClick = () => {
                  if (!href) return;
                  // Mark as read in the background — don't await so the
                  // navigation feels instant.
                  if (!notification.read) handleMarkAsRead(notification._id).catch(() => {});
                  setIsOpen(false);
                  navigate(href);
                };
                return (
                <div
                  key={notification._id}
                  onClick={href ? onCardClick : undefined}
                  className={`flex gap-3 p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors border-l-4 ${getPriorityColor(notification.priority)} ${
                    !notification.read ? 'bg-blue-50/50' : ''
                  } ${href ? 'cursor-pointer' : ''}`}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`font-medium text-sm ${!notification.read ? 'text-gray-900' : 'text-gray-600'}`}>
                        {notification.title}
                      </h4>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {notification.message}
                    </p>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-2">
                      {!notification.read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notification._id); }}
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          Mark read
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(notification._id); }}
                        className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Unread indicator */}
                  {!notification.read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-100 text-center">
              <button
                onClick={() => setIsOpen(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
