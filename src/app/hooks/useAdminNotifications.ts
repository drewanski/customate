import { useState, useEffect, useCallback } from 'react';

// Define Notification interface locally to avoid import issues
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

// API base — same env var the rest of the app uses, so the bell hits the
// real backend (localhost:4000 in dev, Render in prod) instead of 404-ing
// against the Vite dev server / Hostinger static origin.
const API_BASE: string = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api';

// Simple API functions to avoid import issues
async function fetchNotifications(limit: number = 10, unreadOnly: boolean = false): Promise<{ notifications: Notification[]; unreadCount: number; total: number }> {
  try {
    const response = await fetch(`${API_BASE}/notifications?limit=${limit}&unreadOnly=${unreadOnly}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type');
    if (!response.ok || !contentType?.includes('application/json')) {
      throw new Error('Notifications API not available');
    }

    return response.json();
  } catch (error) {
    console.log('Notifications API not available - continuing without notifications');
    return { notifications: [], unreadCount: 0, total: 0 };
  }
}

async function markAsRead(notificationId: string): Promise<{ success: boolean; notification: Notification }> {
  try {
    const response = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Failed to mark as read');
    return response.json();
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

async function markAllAsRead(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${API_BASE}/notifications/read-all`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Failed to mark all as read');
    return response.json();
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

interface UseAdminNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

export function useAdminNotifications(): UseAdminNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch notifications from API
  const refreshNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchNotifications(50, false);
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for new orders via storage events (cross-tab communication)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'newOrderNotification') {
        const newOrderData = JSON.parse(e.newValue || '{}');
        
        // Create local notification for immediate feedback
        const notification: Notification = {
          _id: `temp_${Date.now()}`,
          type: 'new_order_alert',
          title: '🛒 New Order Received!',
          message: `Order #${newOrderData.orderNumber || newOrderData.id?.slice(-8)} - ₱${newOrderData.totalAmount?.toLocaleString()} - ${newOrderData.items?.length || 0} items`,
          priority: 'urgent',
          read: false,
          createdAt: new Date().toISOString(),
          target: 'admin',
          relatedData: {
            orderId: newOrderData.id,
            orderNumber: newOrderData.orderNumber,
            amount: newOrderData.totalAmount
          }
        };
        
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);
        playNotificationSound();
        showBrowserNotification(notification);
        
        // Refresh after a short delay to get the persistent notification
        setTimeout(refreshNotifications, 1000);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refreshNotifications]);

  // Initial fetch and polling
  useEffect(() => {
    refreshNotifications();
    
    // Poll every 15 seconds for new notifications
    const interval = setInterval(refreshNotifications, 15000);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  // Mark notification as read
  const handleMarkAsRead = useCallback(async (id: string) => {
    try {
      await markAsRead(id);
      setNotifications(prev => 
        prev.map(n => n._id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  // Mark all notifications as read
  const handleMarkAllAsRead = useCallback(async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    refreshNotifications
  };
}

// Play notification sound
function playNotificationSound() {
  try {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.log('Notification sound not available:', error);
  }
}

// Show browser notification
function showBrowserNotification(notification: Notification) {
  if (!('Notification' in window)) return;
  
  if (Notification.permission === 'granted') {
    new Notification(notification.title, {
      body: notification.message,
      icon: '/favicon.ico',
      tag: 'admin-notification',
      requireInteraction: notification.priority === 'urgent'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showBrowserNotification(notification);
      }
    });
  }
}
