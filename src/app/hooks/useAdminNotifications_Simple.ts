import { useState, useEffect, useCallback } from 'react';
import { getNotifications, markAsRead, markAllAsRead, Notification } from '../api/notifications';

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
      const data = await getNotifications(50, false);
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
