import { useState, useEffect, useCallback } from 'react';
import { getMyOrders } from '../api';

interface Order {
  id: string;
  orderNumber: string;
  date: string;
  status: string;
  totalAmount: number;
  items: number;
  totalQty: number;
  estimatedDelivery?: string;
  trackingNumber?: string;
  customerName?: string;
  customerEmail?: string;
  paymentStatus?: string;
  isBulk?: boolean;
  shippingAddress?: string;
  notes?: string;
}

interface UseRealTimeOrdersReturn {
  orders: Order[];
  loading: boolean;
  error: string | null;
  refreshOrders: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useRealTimeOrders(pollingInterval = 30000): UseRealTimeOrdersReturn {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const processOrders = useCallback((ordersData: any[]): Order[] => {
    return ordersData.map((order: any) => ({
      ...order,
      orderNumber: `CM-${order.id.slice(-8)}`,
      date: order.createdAt,
      totalAmount: order.totalPrice || 0,
      items: order.items?.length || 0,
      totalQty: order.totalQty || 0
    }));
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      setError(null);
      const ordersData = await getMyOrders();
      const processedOrders = processOrders(ordersData);
      setOrders(processedOrders);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('Orders refresh error:', err);
      setError(err.message || 'Failed to refresh orders');
    } finally {
      setLoading(false);
    }
  }, [processOrders]);

  useEffect(() => {
    // Initial fetch
    refreshOrders();

    // Set up polling for real-time updates
    const interval = setInterval(() => {
      refreshOrders();
    }, pollingInterval);

    // Set up visibility change listener to pause polling when tab is not visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        // Resume polling when tab becomes visible again
        refreshOrders();
        const newInterval = setInterval(() => {
          refreshOrders();
        }, pollingInterval);
        // Store the new interval ID to clear it later
        (window as any).ordersPollingInterval = newInterval;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if ((window as any).ordersPollingInterval) {
        clearInterval((window as any).ordersPollingInterval);
      }
    };
  }, [refreshOrders, pollingInterval]);

  return {
    orders,
    loading,
    error,
    refreshOrders,
    lastUpdated
  };
}
