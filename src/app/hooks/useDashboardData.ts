import { useState, useEffect, useCallback } from 'react';
import { getProfile, getMyOrders, getCustomerStats, getCustomerActivity } from '../api';

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

interface CustomerStats {
  totalOrders: number;
  totalSpent: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  averageOrderValue: number;
  lastOrderDate: Date | null;
  recentOrders: Order[];
  bulkOrders: number;
}

interface CustomerActivity {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  date: string;
  orderId: string;
  amount: number;
}

interface DashboardData {
  user: any;
  orders: Order[];
  stats: CustomerStats | null;
  activities: CustomerActivity[];
}

interface UseDashboardDataReturn {
  data: DashboardData;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refreshData: () => Promise<void>;
  refetchOrders: () => Promise<void>;
}

export function useDashboardData(): UseDashboardDataReturn {
  const [data, setData] = useState<DashboardData>({
    user: null,
    orders: [],
    stats: null,
    activities: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const [profileData, ordersData, statsData, activityData] = await Promise.all([
        getProfile(),
        getMyOrders(),
        getCustomerStats(),
        getCustomerActivity()
      ]);

      const processedOrders = ordersData.map((order: any) => ({
        ...order,
        orderNumber: `CM-${order.id.slice(-8)}`,
        date: order.createdAt,
        totalAmount: order.totalPrice || 0,
        items: order.items?.length || 0,
        totalQty: order.totalQty || 0
      }));

      setData({
        user: profileData,
        orders: processedOrders,
        stats: statsData,
        activities: activityData
      });
    } catch (err: any) {
      console.error('Dashboard fetch error:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refreshData = useCallback(async () => {
    await fetchDashboardData(true);
  }, [fetchDashboardData]);

  const refetchOrders = useCallback(async () => {
    try {
      const ordersData = await getMyOrders();
      const processedOrders = ordersData.map((order: any) => ({
        ...order,
        orderNumber: `CM-${order.id.slice(-8)}`,
        date: order.createdAt,
        totalAmount: order.totalPrice || 0,
        items: order.items?.length || 0,
        totalQty: order.totalQty || 0
      }));
      
      setData(prev => ({ ...prev, orders: processedOrders }));
    } catch (err: any) {
      console.error('Orders refetch error:', err);
      setError(err.message || 'Failed to refresh orders');
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return {
    data,
    loading,
    error,
    refreshing,
    refreshData,
    refetchOrders
  };
}
