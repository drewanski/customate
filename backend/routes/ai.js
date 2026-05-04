import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import Order from '../models/Order.js';
import Inventory from '../models/Inventory.js';
import User from '../models/User.js';
import aiService from '../services/localAI.js';

const router = express.Router();

// Fallback responses when AI quota exceeded
function getFallbackResponse(message, context) {
  const msg = message.toLowerCase();
  
  if (msg.includes('sales') || msg.includes('revenue') || msg.includes('order')) {
    return `📊 **Sales Summary** (AI quota exceeded - showing cached data)

• Check the Orders tab for current sales data
• Revenue reports available in Reports section
• Pending orders shown in dashboard

AI features will resume in approximately 1 hour.`;
  }
  
  if (msg.includes('inventory') || msg.includes('stock')) {
    return `📦 **Inventory Status** (AI quota exceeded - showing system data)

• Low stock items highlighted in red on Inventory page
• Current stock levels shown in real-time
• Reorder alerts available in notifications

AI insights temporarily unavailable.`;
  }
  
  if (msg.includes('help') || msg.includes('what can you do')) {
    return `🤖 **Admin Assistant Help** (Quota Exceeded)

Normally I can help with:
• Sales analysis and trends
• Inventory management insights
• Customer behavior patterns
• Automated reporting

**Current Status:** AI quota exceeded. Please try again after 1 hour, or use the dashboard directly for real-time data.`;
  }
  
  return `🤖 **AI Assistant** (Quota Exceeded)

I'm currently unavailable due to API quota limits. 

**What you can do:**
• Use the dashboard for real-time metrics
• Check the Orders/Inventory tabs directly
• Try again in approximately 1 hour

**Error:** Gemini API quota exceeded (429)`;
}

/**
 * AI Chat Endpoint - Admin Assistant
 * POST /api/ai/chat
 * No rate limits with local AI
 */
router.post('/chat', adminMiddleware, async (req, res) => {
  try {
    const { message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Gather relevant data based on context
    let systemData = '';
    
    if (context?.includes('sales') || context?.includes('orders')) {
      const orders = await Order.find().sort({ createdAt: -1 }).limit(50);
      const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
      const pendingOrders = orders.filter(o => o.status === 'pending').length;
      systemData += `\nRecent Orders: ${orders.length}, Total Revenue: ₱${totalRevenue}, Pending: ${pendingOrders}`;
    }
    
    if (context?.includes('inventory') || context?.includes('stock')) {
      const inventory = await Inventory.find();
      const lowStock = inventory.filter(i => i.stock <= i.minStock);
      systemData += `\nInventory: ${inventory.length} items, Low Stock: ${lowStock.length} items`;
    }

    const systemPrompt = `You are CustoMate Admin AI Assistant. You have access to real-time business data.
${systemData}

Provide concise, actionable insights. Be professional and helpful.`;

    // Use optimized Gemini with caching
    const result = await aiService.generateResponse(message, context || 'default');
    
    res.json({
      response: result.content,
      source: result.source || 'gemini',
      cached: result.cached || false,
      quotaStatus: aiService.quotaExceeded ? 'exceeded' : 'ok'
    });
  } catch (error) {
    console.error('AI Chat Error:', error);
    
    // Provide helpful fallback response
    const fallbackResponse = getFallbackResponse(message, context);
    
    res.json({
      response: fallbackResponse,
      source: 'fallback',
      error: error.message,
      quotaExceeded: aiService.quotaExceeded || error.message?.includes('quota')
    });
  }
});

/**
 * Admin Automation Tasks
 * POST /api/ai/automate/:task
 */
router.post('/automate/:task', adminMiddleware, async (req, res) => {
  try {
    const { task } = req.params;
    const data = req.body;
    
    // Gather real data for automation
    let enrichedData = { ...data };
    
    switch (task) {
      case 'sales-analysis':
        const orders = await Order.find({ 
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });
        enrichedData = {
          totalOrders: orders.length,
          revenue: orders.reduce((sum, o) => sum + o.totalPrice, 0),
          avgOrderValue: orders.length > 0 ? orders.reduce((sum, o) => sum + o.totalPrice, 0) / orders.length : 0,
          topProducts: getTopProducts(orders),
          recentTrend: getSalesTrend(orders)
        };
        break;
        
      case 'inventory-alert':
        const inventory = await Inventory.find();
        enrichedData = {
          totalItems: inventory.length,
          lowStock: inventory.filter(i => i.stock <= i.minStock).map(i => ({
            name: i.name,
            stock: i.stock,
            minStock: i.minStock,
            sku: i.sku
          })),
          outOfStock: inventory.filter(i => i.stock === 0).length
        };
        break;
        
      case 'customer-insights':
        const users = await User.find();
        enrichedData = {
          totalCustomers: users.filter(u => u.role === 'customer').length,
          newThisMonth: users.filter(u => 
            u.createdAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          ).length
        };
        break;
    }
    
    // Use optimized Gemini with caching
    const result = await aiService.adminAutomation(task, enrichedData);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json({
      result: result.content,
      task,
      dataUsed: enrichedData,
      source: result.source || 'gemini',
      cached: result.cached || false
    });
  } catch (error) {
    console.error('AI Automation Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stream AI Response - Disabled due to quota limits
 * Returns non-streaming response with fallback
 * POST /api/ai/stream
 */
router.post('/stream', adminMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    
    // Use regular response instead of streaming (quota protection)
    const result = await aiService.generateResponse(message, 'default');
    
    res.json({
      response: result.content,
      source: result.source || 'gemini',
      cached: result.cached || false
    });
  } catch (error) {
    console.error('AI Stream Error:', error);
    const fallbackResponse = getFallbackResponse(message);
    res.json({
      response: fallbackResponse,
      source: 'fallback',
      error: error.message,
      quotaExceeded: true
    });
  }
});

/**
 * AI Status Check
 * GET /api/ai/status
 */
router.get('/status', adminMiddleware, async (req, res) => {
  try {
    const geminiStatus = aiService.getStatus ? aiService.getStatus() : { provider: 'gemini' };
    res.json({
      provider: 'gemini',
      geminiStatus,
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      quotaStatus: aiService.quotaExceeded ? 'exceeded' : 'ok',
      quotaResetTime: aiService.quotaResetTime,
      optimizations: {
        caching: true,
        rateLimiting: true,
        queueing: true,
        retryLogic: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

// Helper functions
function getTopProducts(orders) {
  const productCounts = {};
  orders.forEach(order => {
    order.items.forEach(item => {
      productCounts[item.name] = (productCounts[item.name] || 0) + item.quantity;
    });
  });
  return Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
}

function getSalesTrend(orders) {
  const last7Days = orders.filter(o => 
    o.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  const previous7Days = orders.filter(o => 
    o.createdAt > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) &&
    o.createdAt <= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  
  const current = last7Days.reduce((sum, o) => sum + o.totalPrice, 0);
  const previous = previous7Days.reduce((sum, o) => sum + o.totalPrice, 0);
  
  return {
    last7Days: current,
    previous7Days: previous,
    change: previous > 0 ? ((current - previous) / previous * 100).toFixed(1) : 0
  };
}
