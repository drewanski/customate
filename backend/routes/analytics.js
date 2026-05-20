import express from 'express';
import Order from '../models/Order.js';
import Inventory from '../models/Inventory.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get order analytics
router.get('/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period = 'daily', startDate, endDate } = req.query;
    
    const now = new Date();
    let start = startDate ? new Date(startDate) : new Date(now.setDate(now.getDate() - 30));
    let end = endDate ? new Date(endDate) : new Date();

    // Adjust start date based on period if no custom range
    if (!startDate) {
      switch (period) {
        case 'daily':
          start = new Date(now.setDate(now.getDate() - 1));
          break;
        case 'weekly':
          start = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'monthly':
          start = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          start = new Date(now.setDate(now.getDate() - 30));
      }
    }

    // Get orders in date range
    const orders = await Order.find({
      createdAt: { $gte: start, $lte: end }
    }).sort({ createdAt: 1 });

    // Calculate statistics. The Order schema field is `totalPrice` (not
    // `total`) — see models/Order.js. The previous code summed `o.total`
    // which is undefined for every order, so totalRevenue was always 0.
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce(
      (sum, o) => sum + (Number(o.totalPrice) || 0),
      0,
    );
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Status breakdown
    const statusCounts = {};
    orders.forEach((o) => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });

    // Daily breakdown for charts
    const dailyData = {};
    orders.forEach((o) => {
      const date = o.createdAt.toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { orders: 0, revenue: 0 };
      }
      dailyData[date].orders++;
      dailyData[date].revenue += Number(o.totalPrice) || 0;
    });

    // Top products
    const productCounts = {};
    orders.forEach(o => {
      o.items?.forEach(item => {
        const key = item.name || item.productName || 'Unknown';
        productCounts[key] = (productCounts[key] || 0) + (item.quantity || 1);
      });
    });

    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    res.json({
      period,
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      summary: {
        totalOrders,
        totalRevenue,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100
      },
      statusBreakdown: statusCounts,
      dailyData: Object.entries(dailyData).map(([date, data]) => ({
        date,
        ...data
      })),
      topProducts
    });
  } catch (error) {
    console.error('Order analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch order analytics' });
  }
});

// Get inventory analytics
router.get('/inventory', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const inventory = await Inventory.find({}).sort({ category: 1, name: 1 });

    // Category breakdown
    const categories = {};
    let totalStock = 0;
    let totalValue = 0;

    inventory.forEach(item => {
      const cat = item.category || 'Uncategorized';
      if (!categories[cat]) {
        categories[cat] = { count: 0, stock: 0, value: 0 };
      }
      categories[cat].count++;
      categories[cat].stock += item.stock || 0;
      categories[cat].value += (item.stock || 0) * (item.basePrice || 0);
      totalStock += item.stock || 0;
      totalValue += (item.stock || 0) * (item.basePrice || 0);
    });

    // Low stock items
    const lowStock = inventory
      .filter(item => item.stock <= 10)
      .map(item => ({
        id: item._id,
        name: item.name,
        category: item.category,
        stock: item.stock,
        minStock: item.minStock || 10
      }));

    // Out of stock items
    const outOfStock = inventory
      .filter(item => item.stock === 0)
      .map(item => ({
        id: item._id,
        name: item.name,
        category: item.category
      }));

    res.json({
      summary: {
        totalProducts: inventory.length,
        totalStock,
        totalValue: Math.round(totalValue * 100) / 100,
        lowStockCount: lowStock.length,
        outOfStockCount: outOfStock.length
      },
      categories: Object.entries(categories).map(([name, data]) => ({
        name,
        ...data
      })),
      lowStock,
      outOfStock
    });
  } catch (error) {
    console.error('Inventory analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch inventory analytics' });
  }
});

// Get operational analytics
router.get('/operational', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    // Get orders with status changes
    const orders = await Order.find({
      status: { $in: ['completed', 'delivered', 'shipped'] }
    }).sort({ createdAt: -1 }).limit(100);

    // Calculate turnaround times
    let totalTurnaroundHours = 0;
    let completedOrders = 0;

    orders.forEach(order => {
      if (order.createdAt && (order.completedAt || order.updatedAt)) {
        const end = order.completedAt || order.updatedAt;
        const hours = (new Date(end) - new Date(order.createdAt)) / (1000 * 60 * 60);
        if (hours > 0 && hours < 720) { // Exclude outliers over 30 days
          totalTurnaroundHours += hours;
          completedOrders++;
        }
      }
    });

    const averageTurnaround = completedOrders > 0 
      ? Math.round((totalTurnaroundHours / completedOrders) * 10) / 10 
      : 0;

    // Production status breakdown — counts orders by their current status.
    // Keys must match the actual Order.status enum (see models/Order.js):
    // pending, approved, in_production, ready, completed, shipped, delivered,
    // cancelled, rejected, refunded. We initialize each to 0 so the pie
    // chart on the frontend has stable keys to render.
    const allOrders = await Order.find({}).sort({ createdAt: -1 }).limit(500);
    const productionStatus = {
      pending: 0,
      approved: 0,
      in_production: 0,
      ready: 0,
      completed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
      rejected: 0,
      refunded: 0,
    };

    allOrders.forEach((o) => {
      if (productionStatus[o.status] !== undefined) {
        productionStatus[o.status]++;
      }
    });

    // Weekly comparison
    const now = new Date();
    const thisWeek = new Date(now.setDate(now.getDate() - 7));
    const lastWeek = new Date(now.setDate(now.getDate() - 7));

    const thisWeekOrders = await Order.countDocuments({
      createdAt: { $gte: thisWeek }
    });

    const lastWeekOrders = await Order.countDocuments({
      createdAt: { $gte: lastWeek, $lt: thisWeek }
    });

    const weekOverWeekChange = lastWeekOrders > 0 
      ? Math.round(((thisWeekOrders - lastWeekOrders) / lastWeekOrders) * 1000) / 10 
      : 0;

    res.json({
      turnaroundTime: {
        averageHours: averageTurnaround,
        averageDays: Math.round((averageTurnaround / 24) * 10) / 10,
        sampleSize: completedOrders
      },
      productionPipeline: productionStatus,
      weeklyComparison: {
        thisWeek: thisWeekOrders,
        lastWeek: lastWeekOrders,
        changePercent: weekOverWeekChange
      }
    });
  } catch (error) {
    console.error('Operational analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch operational analytics' });
  }
});

// Get dashboard summary
router.get('/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Today's stats — count + revenue. We exclude cancelled/rejected from
    // revenue because those represent money we'll never see (or refunded).
    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: today },
    });

    // FIX: the Order schema field is `totalPrice`, not `total`. The previous
    // aggregation summed a non-existent field and always returned 0 — which
    // is why the dashboard's "Today's revenue" tile was stuck at ₱0.
    const todayRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          status: { $nin: ['cancelled', 'rejected'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } },
    ]);

    // Pending orders = anything not yet shipped/delivered/done/cancelled.
    // The status enum is pending/approved/in_production/ready/completed/
    // shipped/delivered/cancelled/rejected/refunded — so "active" work is
    // everything before ready. The old code used 'processing'/'production'
    // which aren't valid status values.
    const pendingOrders = await Order.countDocuments({
      status: { $in: ['pending', 'approved', 'in_production'] },
    });

    // Low-stock count is PER-SKU — each inventory item has its own
    // `minStock` threshold. Comparing globally against 10 was wrong: a SKU
    // with minStock=50 sitting at 12 should be flagged, and a SKU with
    // minStock=5 sitting at 8 should NOT be. Use $expr to compare two
    // fields on the same document.
    const lowStockCount = await Inventory.countDocuments({
      isActive: { $ne: false },
      $expr: { $lte: ['$stock', { $ifNull: ['$minStock', 10] }] },
    });

    // Monthly revenue — same totalPrice + cancelled-exclusion fix.
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: thisMonth },
          status: { $nin: ['cancelled', 'rejected'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } },
    ]);

    res.json({
      today: {
        orders: todayOrders,
        revenue: todayRevenue[0]?.total || 0
      },
      pendingOrders,
      lowStockAlert: lowStockCount,
      monthlyRevenue: monthlyRevenue[0]?.total || 0
    });
  } catch (error) {
    console.error('Summary analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch summary' });
  }
});

export default router;
