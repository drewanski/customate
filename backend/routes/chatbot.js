import express from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { authMiddleware } from '../middleware/auth.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Inventory from '../models/Inventory.js';

dotenv.config();

const router = express.Router();

// Initialize Gemini AI only if API key is available
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Helper to check if AI is available
const checkAI = (res) => {
  if (!genAI) {
    res.status(503).json({ message: 'AI service not configured' });
    return false;
  }
  return true;
};

const SYSTEM_PROMPT = `You are CustoMate AI, the official digital assistant for the CustoMate SaaS platform. 
CustoMate is a premium product customization platform in the Philippines specializing in T-shirts, Mugs, Tumblers, and more.

Your goals:
1. Help users navigate the platform.
2. Provide information about products with REAL-TIME data from the database.
3. Explain customization options (Text, Fonts, Images, 2D/3D previews).
4. Inform users about bulk order rules (20+ items require 50% down payment).
5. Assist with order tracking using ACTUAL order data.
6. Check inventory availability in real-time.
7. Be professional, friendly, and helpful.

Available Platform Features:
- Home/Landing Page: Browse featured products and promotions
- Products Catalog: View all customizable products with real-time pricing
- Customization Studio: Design products with text, images, fonts, colors
- Cart: Review and manage items before checkout
- Checkout: Secure payment processing
- Order Tracking: Real-time order status updates
- Dashboard: View order history and account details
- Profile: Manage personal information and settings
- Admin Panel: Manage inventory, orders, users, and production (admin only)

Customization Options:
- Text: Add custom text with various fonts, sizes, colors
- Images: Upload custom images/photos
- 3D Preview: See realistic product previews before ordering
- Templates: Choose from pre-designed templates

Payment & Shipping:
- Payment: COD (small orders), GCash, Maya, Bank Transfer
- Bulk Orders: 20+ items require 50% down payment
- Delivery: Nationwide shipping (3-7 days Metro Manila, 5-10 days provinces)
- Tracking: Track orders via Order Tracking page

Always use the provided REAL-TIME DATA to give accurate, current information about products, inventory, orders, and pricing.`;

// Fallback rule-based responses when AI is unavailable
function getRuleBasedResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    return "Hello! Welcome to CustoMate! How can I help you today?";
  } else if (lowerMessage.includes('product') || lowerMessage.includes('item') || lowerMessage.includes('mug') || lowerMessage.includes('shirt') || lowerMessage.includes('what do you sell') || lowerMessage.includes('what products')) {
    return "We offer a wide range of customizable products including T-shirts, Jerseys, Mugs, Tumblers, Mousepads, Foldable Fans, Tote bags, and Coin Purses. You can customize them with your own text and images!";
  } else if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much')) {
    return "Our prices are competitive with bulk discounts available. For bulk orders of 20+ items, we offer special pricing. Would you like to know about a specific product?";
  } else if (lowerMessage.includes('payment') || lowerMessage.includes('pay')) {
    return "We accept multiple payment methods including COD for small orders, GCash, Maya, and Bank Transfer. For bulk orders (20+ items), a 50% down payment is required.";
  } else if (lowerMessage.includes('delivery') || lowerMessage.includes('shipping') || lowerMessage.includes('ship')) {
    return "We offer nationwide shipping across the Philippines. Delivery times vary by location, typically 3-7 business days for Metro Manila and 5-10 business days for provinces.";
  } else if (lowerMessage.includes('custom') || lowerMessage.includes('design') || lowerMessage.includes('personalize')) {
    return "You can customize products with custom text, fonts, colors, and images! Our studio provides real-time 2D and 3D previews so you can see exactly how your design will look.";
  } else if (lowerMessage.includes('order') || lowerMessage.includes('track')) {
    return "To track your order, please log in to your account and visit the Orders section. If you need help with a specific order, please contact our support team.";
  } else if (lowerMessage.includes('help') || lowerMessage.includes('support')) {
    return "I'm here to help! You can ask me about our products, pricing, customization options, payment methods, delivery, or order tracking. For more complex issues, please contact our human support team.";
  } else if (lowerMessage.includes('bulk') || lowerMessage.includes('wholesale')) {
    return "For bulk orders of 20+ items, we offer special pricing. A 50% down payment is required for bulk orders. Please contact us directly for a custom quote.";
  } else if (lowerMessage.includes('thank')) {
    return "You're welcome! If you need anything else, just ask. Happy customizing!";
  } else if (lowerMessage.includes('bye') || lowerMessage.includes('goodbye')) {
    return "Goodbye! Thank you for choosing CustoMate. Have a great day!";
  } else {
    return "I'd be happy to help you with that! You can ask me about our products, pricing, customization options, payment methods, delivery, or order tracking. For more specific inquiries, please contact our support team.";
  }
}

// Retry function with exponential backoff
async function generateWithRetry(model, prompt, maxRetries = 3) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return await result.response;
    } catch (error) {
      lastError = error;
      const isRetryable = error.status === 503 || error.status === 429 || error.status === 500;
      if (!isRetryable || i === maxRetries - 1) break;
      
      // Exponential backoff: wait 1s, 2s, 4s
      const delay = Math.pow(2, i) * 1000;
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms due to ${error.status}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Fetch real-time data from database
async function fetchRealTimeData(authToken) {
  const data = {
    products: [],
    user: null,
    userOrders: [],
    systemInfo: {
      lastUpdated: new Date().toISOString(),
      platform: 'CustoMate SaaS',
      version: '1.0'
    }
  };

  try {
    // Fetch all products from inventory
    const inventory = await Inventory.find({}).sort({ category: 1, name: 1 });
    data.products = inventory.map(item => ({
      name: item.name,
      category: item.category,
      basePrice: item.basePrice,
      stock: item.stock,
      available: item.stock > 0,
      customizable: item.customizable,
      description: item.description || '',
      variants: item.variants?.length || 0
    }));

    // If auth token provided, fetch user data
    if (authToken) {
      try {
        const jwt = (await import('jsonwebtoken')).default;
        const decoded = jwt.verify(authToken, process.env.JWT_SECRET);
        
        const user = await User.findById(decoded.id);
        if (user) {
          data.user = {
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone || 'Not provided'
          };

          // Fetch user's recent orders
          const orders = await Order.find({ user: user._id })
            .sort({ createdAt: -1 })
            .limit(5);
          
          data.userOrders = orders.map(order => ({
            orderNumber: order.orderNumber,
            status: order.status,
            total: order.total,
            items: order.items.length,
            createdAt: order.createdAt,
            estimatedDelivery: order.estimatedDelivery || 'Calculating...'
          }));
        }
      } catch (authError) {
        console.log('Auth token invalid or expired');
      }
    }

    console.log('Real-time data fetched:', {
      products: data.products.length,
      user: data.user?.name || 'Not authenticated',
      orders: data.userOrders.length
    });
  } catch (error) {
    console.error('Error fetching real-time data:', error);
  }

  return data;
}

// Format real-time data for AI context
function formatRealTimeContext(data) {
  let context = '\n=== REAL-TIME SYSTEM DATA ===\n';
  context += `Last Updated: ${data.systemInfo.lastUpdated}\n\n`;

  // Products section
  if (data.products.length > 0) {
    context += 'CURRENT INVENTORY:\n';
    const categories = [...new Set(data.products.map(p => p.category))];
    categories.forEach(cat => {
      context += `\n${cat}:\n`;
      const catProducts = data.products.filter(p => p.category === cat);
      catProducts.forEach(p => {
        const stockStatus = p.available ? `✓ In Stock (${p.stock})` : '✗ Out of Stock';
        context += `  - ${p.name}: ₱${p.basePrice} - ${stockStatus}\n`;
      });
    });
    context += '\n';
  }

  // User section
  if (data.user) {
    context += `CURRENT USER:\n`;
    context += `  Name: ${data.user.name}\n`;
    context += `  Email: ${data.user.email}\n`;
    context += `  Role: ${data.user.role}\n\n`;

    if (data.userOrders.length > 0) {
      context += `USER'S RECENT ORDERS:\n`;
      data.userOrders.forEach(order => {
        context += `  Order #${order.orderNumber}: ${order.status} - ₱${order.total} (${order.items} items)\n`;
      });
      context += '\n';
    }
  }

  context += '=== END REAL-TIME DATA ===\n';
  return context;
}

router.post('/chat', async (req, res) => {
  try {
    if (!checkAI(res)) return;
    const { message, history } = req.body;
    console.log('Chatbot request received:', { message, historyLength: history?.length });
    
    if (!process.env.GEMINI_API_KEY) {
      console.error('Chatbot Error: GEMINI_API_KEY is missing in .env');
      return res.status(500).json({ 
        message: "Chatbot is temporarily unavailable. Please set up GEMINI_API_KEY." 
      });
    }

    // Get auth token from header if provided
    const authHeader = req.headers.authorization;
    const authToken = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    // Fetch real-time data from database
    const realTimeData = await fetchRealTimeData(authToken);
    const realTimeContext = formatRealTimeContext(realTimeData);

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Build conversation context from history
    let conversationContext = '';
    if (history && history.length > 0) {
      conversationContext = history.map(msg => 
        `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
      ).join('\n\n') + '\n\n';
    }

    // Construct the full prompt with real-time data, system instructions and conversation history
    const fullPrompt = `${SYSTEM_PROMPT}${realTimeContext}\n\n${conversationContext}User: ${message}\n\nAssistant:`;

    console.log('Sending message to Gemini AI with real-time data...');
    let text;
    
    try {
      const response = await generateWithRetry(model, fullPrompt);
      text = response.text();
      console.log('Gemini AI response received successfully');
    } catch (error) {
      console.log('AI unavailable, using rule-based fallback. Error:', error.status || error.message);
      text = getRuleBasedResponse(message);
    }

    res.json({ content: text });
  } catch (error) {
    console.error('Chatbot unexpected error:', error);
    res.status(500).json({ 
      message: "Something went wrong with the AI assistant.",
      error: error.message 
    });
  }
});

// Context-aware help (Requires Auth)
router.post('/assist', authMiddleware, async (req, res) => {
  try {
    if (!checkAI(res)) return;
    const { message } = req.body;
    const user = await User.findById(req.user.id);
    const orders = await Order.find({ user: req.user.id }).limit(3).sort({ createdAt: -1 });
    
    const context = `
      User Name: ${user.name}
      Recent Orders: ${orders.map(o => `Order #${o.orderNumber} (Status: ${o.status})`).join(', ')}
    `;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `${SYSTEM_PROMPT}\n\nUser Context:\n${context}\n\nUser Question: ${message}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({ content: text });
  } catch (error) {
    console.error('AI Assist Error:', error);
    res.status(500).json({ message: "Failed to get personalized assistance." });
  }
});

export default router;
