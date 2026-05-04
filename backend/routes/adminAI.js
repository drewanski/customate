import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Inventory from '../models/Inventory.js';
import { authMiddleware } from '../middleware/auth.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize Gemini AI only if API key is available
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Simple in-memory cache for AI responses
const aiCache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes - longer cache to reduce API calls

// Rate limiting for AI requests - track all endpoints together
let lastAIRequest = 0;
const AI_RATE_LIMIT_MS = 3000; // Minimum 3 seconds between ANY AI requests
let quotaExceededUntil = 0; // Timestamp when quota resets

// Helper to check if AI is available
const checkAI = (res) => {
  if (!genAI) {
    res.status(503).json({ message: 'AI service not configured' });
    return false;
  }
  return true;
};

// Helper to get cached response or null
function getCachedResponse(key) {
  const cached = aiCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  aiCache.delete(key);
  return null;
}

// Helper to set cached response
function setCachedResponse(key, data) {
  aiCache.set(key, { data, timestamp: Date.now() });
}

// Helper to check rate limit
function checkRateLimit() {
  const now = Date.now();
  
  // If quota was exceeded recently, wait before trying again
  if (now < quotaExceededUntil) {
    return false;
  }
  
  if (now - lastAIRequest < AI_RATE_LIMIT_MS) {
    return false;
  }
  lastAIRequest = now;
  return true;
}

// Helper to mark quota as exceeded (wait 60 seconds)
function markQuotaExceeded() {
  quotaExceededUntil = Date.now() + 60000; // Wait 60 seconds
}

/**
 * Get system context for AI
 * Fetches real data to provide accurate responses
 */
async function getSystemContext() {
  try {
    // Get order statistics
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const todayOrders = await Order.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    // Get revenue stats
    const orders = await Order.find({ paymentStatus: { $in: ['paid', 'partial'] } });
    const totalRevenue = orders.reduce((sum, o) => sum + (o.paidAmount || 0), 0);
    
    // Get inventory status
    const lowStock = await Inventory.find({ 
      $expr: { $lte: ['$quantity', '$lowStockThreshold'] }
    }).limit(5);
    
    // Get recent users
    const recentUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    return {
      totalOrders,
      pendingOrders,
      todayOrders,
      totalRevenue,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock.map(i => i.sku),
      recentUsers
    };
  } catch (error) {
    console.error('Error fetching system context:', error);
    return null;
  }
}

/**
 * Admin AI Chat Endpoint
 * POST /api/admin-ai/chat
 */
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    // Verify admin access
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    if (!checkAI(res)) return;

    const { message, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Get real-time system data
    const context = await getSystemContext();
    
    // Build system prompt with admin capabilities
    const systemPrompt = `You are CustoMate Admin AI, an intelligent assistant for the CustoMate print-on-demand platform admin panel.

CURRENT SYSTEM STATUS (as of ${new Date().toLocaleString()}):
${context ? `
- Total Orders: ${context.totalOrders}
- Pending Orders: ${context.pendingOrders} (need approval)
- Orders Today: ${context.todayOrders}
- Total Revenue: ₱${context.totalRevenue.toLocaleString()}
- Low Stock Items: ${context.lowStockCount} ${context.lowStockItems.length > 0 ? '(' + context.lowStockItems.join(', ') + ')' : ''}
- New Users (7 days): ${context.recentUsers}
` : '- System data temporarily unavailable'}

YOUR CAPABILITIES:
1. Order Management: Help review orders, suggest prioritization, explain order statuses
2. Sales Analytics: Interpret revenue data, identify trends, suggest promotions
3. Inventory: Alert about low stock, suggest reordering, track material usage
4. Customer Support: Draft professional responses, handle complaints, suggest solutions
5. Production Planning: Optimize print queue, batch similar orders, schedule deadlines
6. Financial Insights: Calculate profit margins, track payment statuses, reconcile payments

TONE: Professional, helpful, concise. Use bullet points for lists. Be data-driven when possible.

IMPORTANT: You have access to the real system data shown above. Reference it when answering questions.`;

    // Initialize model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Start chat with history
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'I understand. I am CustoMate Admin AI ready to assist with order management, analytics, and system operations.' }] },
        ...history.map((h) => ({
          role: h.role,
          parts: [{ text: h.content }]
        }))
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000
      }
    });

    // Get AI response
    const result = await chat.sendMessage(message);
    const response = result.response.text();

    res.json({
      response,
      context: context ? {
        ordersPending: context.pendingOrders,
        lowStock: context.lowStockCount,
        todayOrders: context.todayOrders
      } : null
    });

  } catch (error) {
    console.error('Admin AI Error:', error);
    // Check if quota/rate limit error
    if (error.message?.includes('quota') || error.message?.includes('429') || error.status === 429) {
      markQuotaExceeded(); // Mark quota as exceeded for 60 seconds
      // Return helpful fallback response
      return res.json({
        response: `I'm currently experiencing high demand. Here's what I can help you with:\n\n📊 **Quick Actions:**\n• Check Orders page for pending approvals\n• Review Inventory for low stock items\n• View Reports for sales analytics\n\n💡 **Common Tasks:**\n• Approve pending orders from the Orders tab\n• Update inventory stock levels\n• Track order fulfillment status\n\nTry again in a moment for AI-powered insights!`,
        fallback: true,
        message: 'AI quota exceeded. Showing system suggestions.'
      });
    }
    res.status(500).json({ 
      message: 'AI assistant temporarily unavailable',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Quick Insights Endpoint
 * GET /api/admin-ai/insights
 * Returns AI-generated insights based on current data
 */
router.get('/insights', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!checkAI(res)) return;

    const context = await getSystemContext();
    
    if (!context) {
      return res.status(500).json({ message: 'Unable to fetch system data' });
    }

    // Generate cache key based on data
    const cacheKey = `insights_${context.pendingOrders}_${context.todayOrders}_${context.lowStockCount}`;
    
    // Check cache first
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }

    // Check rate limit
    if (!checkRateLimit()) {
      // Return rule-based insights if rate limited
      const fallbackInsights = generateRuleBasedInsights(context);
      return res.json({
        ...fallbackInsights,
        fallback: true,
        message: 'Rate limited. Showing rule-based insights.'
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `As CustoMate Admin AI, analyze this business data and provide 3 actionable insights:

DATA:
- ${context.pendingOrders} orders pending approval
- ${context.todayOrders} orders today
- ₱${context.totalRevenue.toLocaleString()} total revenue
- ${context.lowStockCount} items low on stock
- ${context.recentUsers} new users this week

Provide:
1. URGENT: What needs immediate attention
2. TREND: What the data suggests about business health
3. ACTION: One specific recommendation

Keep each insight to 1-2 sentences. Be direct and actionable.`;

    const result = await model.generateContent(prompt);
    const insightsText = result.response.text();
    
    // Parse insights (simple parsing)
    const insights = insightsText.split('\n').filter(line => 
      line.trim().startsWith('1.') || 
      line.trim().startsWith('2.') || 
      line.trim().startsWith('3.')
    ).map(line => line.replace(/^\d+\.\s*/, '').trim());

    const response = {
      insights: insights.length >= 3 ? insights : generateRuleBasedInsights(context).insights,
      rawResponse: insightsText,
      context
    };
    
    // Cache the response
    setCachedResponse(cacheKey, response);

    res.json(response);

  } catch (error) {
    console.error('Insights Error:', error);
    // Check if it's a quota/rate limit error
    if (error.message?.includes('quota') || error.message?.includes('429') || error.status === 429) {
      markQuotaExceeded(); // Mark quota as exceeded for 60 seconds
      // Return fallback insights based on actual data
      const context = await getSystemContext();
      if (context) {
        const fallbackInsights = generateRuleBasedInsights(context);
        return res.json({
          ...fallbackInsights,
          fallback: true,
          message: 'AI quota exceeded. Showing system-generated insights.',
          context
        });
      }
    }
    res.status(500).json({ message: 'Unable to generate insights', error: error.message });
  }
});

// Helper function to generate rule-based insights
function generateRuleBasedInsights(context) {
  const insights = [];
  
  // Urgent insight
  if (context.pendingOrders > 5) {
    insights.push(`🚨 ${context.pendingOrders} orders pending approval - prioritize order queue to reduce customer wait time`);
  } else if (context.pendingOrders > 0) {
    insights.push(`⏳ ${context.pendingOrders} orders pending approval - review and approve when ready`);
  } else {
    insights.push(`✅ No pending orders - great job keeping up with demand!`);
  }
  
  // Trend insight
  if (context.todayOrders > 5) {
    insights.push(`📈 High activity today with ${context.todayOrders} orders - consider preparing extra inventory`);
  } else if (context.todayOrders > 0) {
    insights.push(`📊 ${context.todayOrders} orders today - steady business flow`);
  } else {
    insights.push(`📉 No orders today - consider running promotions to boost sales`);
  }
  
  // Action insight
  if (context.lowStockCount > 5) {
    insights.push(`⚠️ ${context.lowStockCount} items low on stock - urgent restock needed to avoid order delays`);
  } else if (context.lowStockCount > 0) {
    insights.push(`📦 ${context.lowStockCount} items running low - plan restock soon`);
  } else {
    insights.push(`💰 Revenue at ₱${context.totalRevenue.toLocaleString()} - monitor profit margins on new orders`);
  }
  
  return { insights };
}

/**
 * Suggest Response for Customer
 * POST /api/admin-ai/suggest-response
 * Helps admins draft professional customer responses
 */
router.post('/suggest-response', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!checkAI(res)) return;

    const { customerMessage, orderDetails, tone = 'professional' } = req.body;
    
    if (!customerMessage) {
      return res.status(400).json({ message: 'Customer message is required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `You are a customer service expert for CustoMate, a print-on-demand business.

CUSTOMER MESSAGE:
"${customerMessage}"

${orderDetails ? `ORDER CONTEXT: ${JSON.stringify(orderDetails)}` : ''}

TONE: ${tone} (options: professional, friendly, empathetic, apologetic)

Draft a helpful response that:
1. Addresses their concern directly
2. Provides clear next steps or information
3. Maintains the requested tone
4. Includes appropriate Filipino business courtesy

Keep it concise (2-4 sentences for simple issues, longer for complex).`;

    const result = await model.generateContent(prompt);
    const suggestedResponse = result.response.text();

    res.json({
      suggestedResponse,
      alternatives: [
        // Could generate multiple options in future
        suggestedResponse
      ]
    });

  } catch (error) {
    console.error('Suggest Response Error:', error);
    res.status(500).json({ message: 'Unable to generate response' });
  }
});

/**
 * Production Optimization
 * POST /api/admin-ai/optimize-production
 * Analyzes orders and suggests optimal print queue
 */
router.post('/optimize-production', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!checkAI(res)) return;

    // Get approved orders waiting for production
    const approvedOrders = await Order.find({ 
      status: 'approved',
      paymentStatus: { $in: ['paid', 'partial', 'pending'] }
    }).populate('items.product');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const orderSummary = approvedOrders.map(o => ({
      id: o._id.toString().slice(-6),
      items: o.items.length,
      productTypes: [...new Set(o.items.map(i => i.sku?.split('-')[0] || 'unknown'))],
      customization: o.items.some(i => i.customization?.text || i.customization?.image) ? 'yes' : 'no',
      isBulk: o.isBulk,
      deadline: o.createdAt
    }));

    const prompt = `Optimize this print production queue for efficiency:

ORDERS (${orderSummary.length} total):
${JSON.stringify(orderSummary, null, 2)}

OPTIMIZATION GOALS:
1. Batch similar products together (reduce material switching)
2. Prioritize bulk orders (economies of scale)
3. Consider customization complexity
4. First-in-first-out for non-bulk

Provide:
- Suggested print order (list order IDs)
- Batching recommendations
- Estimated time savings`;

    const result = await model.generateContent(prompt);
    const optimization = result.response.text();

    res.json({
      optimization,
      orderCount: approvedOrders.length,
      orders: orderSummary
    });

  } catch (error) {
    console.error('Production Optimization Error:', error);
    res.status(500).json({ message: 'Unable to optimize production queue' });
  }
});

/**
 * PREDICTIVE INVENTORY ALERTS
 * POST /api/admin-ai/predict-inventory
 * Analyzes order trends and predicts inventory needs
 */
router.post('/predict-inventory', authMiddleware, async (req, res) => {
  let inventoryAnalysis = [];
  
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!checkAI(res)) return;

    // Get inventory data with order history
    const inventory = await Inventory.find();
    
    // Get last 30 days of orders to analyze trends
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentOrders = await Order.find({
      createdAt: { $gte: thirtyDaysAgo },
      status: { $nin: ['rejected', 'cancelled'] }
    });

    // Calculate usage rates per SKU
    const skuUsage = {};
    recentOrders.forEach(order => {
      order.items.forEach(item => {
        const sku = item.sku || 'unknown';
        skuUsage[sku] = (skuUsage[sku] || 0) + (item.quantity || 1);
      });
    });

    // Prepare inventory analysis
    inventoryAnalysis = inventory.map(item => {
      const sku = item.sku;
      const monthlyUsage = skuUsage[sku] || 0;
      const currentStock = item.stock;
      const daysOfSupply = monthlyUsage > 0 ? (currentStock / monthlyUsage) * 30 : 999;
      
      return {
        sku,
        name: item.name || sku,
        currentStock,
        monthlyUsage,
        daysOfSupply: Math.round(daysOfSupply),
        lowStockThreshold: item.lowStockThreshold || 10,
        isLow: currentStock <= (item.lowStockThreshold || 10),
        status: daysOfSupply < 7 ? 'critical' : daysOfSupply < 14 ? 'warning' : 'healthy'
      };
    });
    
    // Check cache
    const cacheKey = `inventory_${inventory.length}_${Object.keys(skuUsage).length}`;
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true });
    }
    
    // Check rate limit
    if (!checkRateLimit()) {
      // Return rule-based predictions
      const ruleBasedPredictions = generateRuleBasedInventoryPredictions(inventoryAnalysis, skuUsage);
      return res.json({
        ...ruleBasedPredictions,
        fallback: true,
        message: 'Rate limited. Showing rule-based predictions.'
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `As an inventory management AI, analyze this data and provide predictive insights:

CURRENT INVENTORY STATUS:
${JSON.stringify(inventoryAnalysis.filter(i => i.status !== 'healthy'), null, 2)}

USAGE TRENDS (Last 30 Days):
${JSON.stringify(skuUsage, null, 2)}

Provide:
1. CRITICAL ALERTS: Items needing immediate reorder (less than 7 days supply)
2. PREDICTION: Which items will run out in the next 2 weeks based on usage trends
3. REORDER RECOMMENDATIONS: Suggested quantities for each at-risk item
4. SEASONAL INSIGHTS: Any patterns that suggest upcoming demand spikes

Format as actionable bullet points. Be specific with numbers.`;

    const result = await model.generateContent(prompt);
    const predictions = result.response.text();

    const response = {
      predictions,
      inventoryAnalysis,
      atRiskItems: inventoryAnalysis.filter(i => i.status !== 'healthy'),
      summary: {
        critical: inventoryAnalysis.filter(i => i.status === 'critical').length,
        warning: inventoryAnalysis.filter(i => i.status === 'warning').length,
        healthy: inventoryAnalysis.filter(i => i.status === 'healthy').length
      }
    };
    
    // Cache the response (reuse the existing cacheKey)
    setCachedResponse(cacheKey, response);

    res.json(response);

  } catch (error) {
    console.error('Predict Inventory Error:', error);
    // Check if quota/rate limit error - return data without AI predictions
    if (error.message?.includes('quota') || error.message?.includes('429') || error.status === 429) {
      markQuotaExceeded(); // Mark quota as exceeded for 60 seconds
      const ruleBasedPredictions = generateRuleBasedInventoryPredictions(inventoryAnalysis, skuUsage);
      return res.json({
        ...ruleBasedPredictions,
        fallback: true,
        message: 'AI quota exceeded. Showing rule-based predictions.'
      });
    }
    res.status(500).json({ message: 'Unable to generate inventory predictions' });
  }
});

// Helper function to generate rule-based inventory predictions
function generateRuleBasedInventoryPredictions(inventoryAnalysis, skuUsage) {
  const atRiskItems = inventoryAnalysis.filter(i => i.status !== 'healthy');
  const criticalItems = atRiskItems.filter(i => i.status === 'critical');
  const warningItems = atRiskItems.filter(i => i.status === 'warning');
  
  let predictionsText = '📊 **INVENTORY PREDICTION REPORT**\n\n';
  
  // Critical alerts
  if (criticalItems.length > 0) {
    predictionsText += '🚨 **CRITICAL ALERTS - IMMEDIATE ACTION REQUIRED**\n';
    criticalItems.forEach(item => {
      const recommendedQty = Math.max(item.monthlyUsage * 2, 20);
      predictionsText += `• ${item.name}: Only ${item.currentStock} units left (${item.daysOfSupply} days supply). Reorder ${recommendedQty} units ASAP.\n`;
    });
    predictionsText += '\n';
  }
  
  // Warning items
  if (warningItems.length > 0) {
    predictionsText += '⚠️ **WARNING - REORDER SOON**\n';
    warningItems.forEach(item => {
      const recommendedQty = Math.max(item.monthlyUsage, 15);
      predictionsText += `• ${item.name}: ${item.currentStock} units (${item.daysOfSupply} days supply). Reorder ${recommendedQty} units within a week.\n`;
    });
    predictionsText += '\n';
  }
  
  // Usage trends
  const topUsed = Object.entries(skuUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  if (topUsed.length > 0) {
    predictionsText += '📈 **TOP MOVING ITEMS (Last 30 Days)**\n';
    topUsed.forEach(([sku, qty]) => {
      const item = inventoryAnalysis.find(i => i.sku === sku);
      predictionsText += `• ${item ? item.name : sku}: ${qty} units sold\n`;
    });
    predictionsText += '\n';
  }
  
  if (atRiskItems.length === 0) {
    predictionsText += '✅ **All inventory items are at healthy levels!**\nNo immediate reordering needed.';
  }
  
  return {
    predictions: predictionsText,
    inventoryAnalysis,
    atRiskItems,
    summary: {
      critical: criticalItems.length,
      warning: warningItems.length,
      healthy: inventoryAnalysis.filter(i => i.status === 'healthy').length
    }
  };
}

/**
 * CUSTOMER SENTIMENT ANALYSIS
 * POST /api/admin-ai/sentiment-analysis
 * Analyzes customer messages/feedback for sentiment and intent
 */
router.post('/sentiment-analysis', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!checkAI(res)) return;

    const { text, orderHistory, context = 'general' } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Text to analyze is required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `Analyze this customer communication for sentiment, intent, and urgency:

CUSTOMER MESSAGE:
"${text}"

${orderHistory ? `CUSTOMER ORDER HISTORY: ${JSON.stringify(orderHistory)}` : ''}

CONTEXT: ${context} (general, complaint, inquiry, review, etc.)

Provide analysis in this JSON format:
{
  "sentiment": "positive|neutral|negative|very_negative",
  "sentimentScore": 0-100,
  "urgency": "low|medium|high|critical",
  "intent": "complaint|inquiry|compliment|complaint_escalation|general",
  "keyTopics": ["topic1", "topic2"],
  "emotionalTriggers": ["frustration", "confusion", etc.],
  "recommendedAction": "specific action to take",
  "responsePriority": "immediate|same_day|24h|routine",
  "estimatedCustomerValue": "high|medium|low based on order history"
}

Be objective and thorough. Consider Filipino customer communication patterns.`;

    const result = await model.generateContent(prompt);
    const analysisText = result.response.text();
    
    // Extract JSON from response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      sentiment: 'neutral',
      sentimentScore: 50,
      urgency: 'medium',
      intent: 'general',
      keyTopics: [],
      recommendedAction: 'Review manually',
      responsePriority: '24h'
    };

    // Add color coding for UI
    const sentimentColor = {
      'positive': 'green',
      'neutral': 'gray',
      'negative': 'orange',
      'very_negative': 'red'
    }[analysis.sentiment] || 'gray';

    res.json({
      analysis: {
        ...analysis,
        sentimentColor,
        originalText: text.substring(0, 200) + (text.length > 200 ? '...' : '')
      },
      rawAnalysis: analysisText
    });

  } catch (error) {
    console.error('Sentiment Analysis Error:', error);
    res.status(500).json({ message: 'Unable to analyze sentiment' });
  }
});

/**
 * AUTOMATED PRICING SUGGESTIONS
 * POST /api/admin-ai/pricing-suggestions
 * Analyzes sales data and suggests optimal pricing
 */
router.post('/pricing-suggestions', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!checkAI(res)) return;

    // Get product sales data
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const orders = await Order.find({
      createdAt: { $gte: sixtyDaysAgo },
      paymentStatus: { $in: ['paid', 'partial'] }
    }).populate('items.product');

    // Aggregate sales by product
    const productStats = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        const productId = item.product?._id?.toString() || item.productId;
        if (!productStats[productId]) {
          productStats[productId] = {
            name: item.product?.name || 'Unknown',
            sku: item.sku,
            currentPrice: item.unitPrice,
            totalSold: 0,
            revenue: 0,
            orderCount: 0
          };
        }
        productStats[productId].totalSold += item.quantity;
        productStats[productId].revenue += (item.unitPrice * item.quantity);
        productStats[productId].orderCount += 1;
      });
    });

    // Calculate metrics
    const productsArray = Object.values(productStats).map(p => ({
      ...p,
      avgOrderValue: p.revenue / p.orderCount,
      revenuePerUnit: p.revenue / p.totalSold
    }));

    // Identify underperformers and stars
    const sortedByRevenue = [...productsArray].sort((a, b) => b.revenue - a.revenue);
    const topProducts = sortedByRevenue.slice(0, 3);
    const bottomProducts = sortedByRevenue.slice(-3).filter(p => p.totalSold > 0);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `As a pricing strategy AI, analyze this sales data and suggest pricing optimizations:

TOP PERFORMERS (Last 60 Days):
${JSON.stringify(topProducts, null, 2)}

UNDERPERFORMERS:
${JSON.stringify(bottomProducts, null, 2)}

ALL PRODUCTS:
${JSON.stringify(productsArray.slice(0, 10), null, 2)}

Provide pricing strategy recommendations:
1. PREMIUM PRICING: Products that could support higher prices (high demand, low price sensitivity)
2. PROMOTIONAL PRICING: Products that need price cuts to boost volume
3. BUNDLE SUGGESTIONS: Products that sell well together
4. DYNAMIC PRICING: Seasonal or demand-based recommendations
5. PSYCHOLOGICAL PRICING: Suggest .99 endings, round numbers, etc.

For each recommendation, include:
- Specific product
- Current price
- Suggested price
- Expected impact (volume/revenue)
- Confidence level (high/medium/low)`;

    const result = await model.generateContent(prompt);
    const pricingStrategy = result.response.text();

    res.json({
      pricingStrategy,
      data: {
        topProducts,
        bottomProducts,
        allProducts: productsArray
      },
      summary: {
        totalProducts: productsArray.length,
        totalRevenue: productsArray.reduce((sum, p) => sum + p.revenue, 0),
        averageOrderValue: productsArray.reduce((sum, p) => sum + p.avgOrderValue, 0) / productsArray.length || 0
      }
    });

  } catch (error) {
    console.error('Pricing Suggestions Error:', error);
    res.status(500).json({ message: 'Unable to generate pricing suggestions' });
  }
});

/**
 * MARKETING CAMPAIGN IDEAS
 * POST /api/admin-ai/marketing-ideas
 * Generates marketing campaign ideas based on data
 */
router.post('/marketing-ideas', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!checkAI(res)) return;

    const { campaignType = 'all', budget = 'medium', targetAudience = 'general' } = req.body;

    // Gather business data for context
    const context = await getSystemContext();
    
    // Get customer demographics (simplified)
    const recentOrders = await Order.find({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).populate('customer');

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `Generate marketing campaign ideas for a Philippine print-on-demand business:

BUSINESS CONTEXT:
- Total Orders: ${context?.totalOrders || 'N/A'}
- Recent Orders (30 days): ${recentOrders.length}
- Target Audience: ${targetAudience}
- Budget Level: ${budget}

CAMPAIGN TYPE REQUESTED: ${campaignType}
(all, social_media, email, promotions, loyalty, referral, seasonal, product_launch)

Generate 5-7 campaign ideas with:

For each campaign provide:
1. CAMPAIGN NAME (catchy, memorable)
2. OBJECTIVE (awareness, conversions, retention, etc.)
3. TARGET AUDIENCE (specific segment)
4. CHANNELS (Facebook, Instagram, TikTok, Email, SMS, etc.)
5. CREATIVE CONCEPT (visual/verbal idea)
6. OFFER/CTA (specific deal or call-to-action)
7. TIMELINE (duration)
8. BUDGET ALLOCATION (% or ₱)
9. SUCCESS METRICS (KPIs)
10. FILIPINO CULTURAL HOOK (local relevance)

Make ideas practical, executable, and culturally relevant to Filipino consumers.

Include at least:
- 1 seasonal/holiday campaign
- 1 social media viral idea
- 1 customer retention/loyalty idea
- 1 new customer acquisition idea`;

    const result = await model.generateContent(prompt);
    const campaigns = result.response.text();

    // Also generate a campaign calendar
    const calendarPrompt = `Based on the campaigns above, create a simple 30-day marketing calendar showing:
- Week 1-4 breakdown
- Daily posting schedule (what to post where)
- Key dates to hit

Format as a simple table or list.`;

    const calendarResult = await model.generateContent(calendarPrompt);
    const calendar = calendarResult.response.text();

    res.json({
      campaigns,
      calendar,
      strategy: {
        targetAudience,
        budget,
        recommendedChannels: ['Facebook', 'Instagram', 'TikTok', 'Email'],
        seasonalOpportunities: ['Undas', 'Christmas', 'Valentine\'s', 'Graduation', 'Summer']
      }
    });

  } catch (error) {
    console.error('Marketing Ideas Error:', error);
    res.status(500).json({ message: 'Unable to generate marketing ideas' });
  }
});

/**
 * BATCH ANALYSIS - Analyze multiple customer messages
 * POST /api/admin-ai/batch-sentiment
 */
router.post('/batch-sentiment', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    if (!checkAI(res)) return;

    const { messages } = req.body; // Array of {id, text, source} objects
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: 'Messages array required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `Analyze sentiment for these ${messages.length} customer communications:

${messages.map((m, i) => `${i + 1}. [${m.id}] ${m.text.substring(0, 200)}`).join('\n\n')}

Provide summary:
- Overall sentiment distribution (% positive, neutral, negative)
- Top 3 concerns/issues mentioned
- Urgent items needing immediate response
- Suggested response priorities

Then list each item with: ID | Sentiment | Urgency | Recommended Action`;

    const result = await model.generateContent(prompt);
    const analysis = result.response.text();

    res.json({
      analysis,
      count: messages.length,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Batch Sentiment Error:', error);
    res.status(500).json({ message: 'Unable to process batch analysis' });
  }
});

export default router;
