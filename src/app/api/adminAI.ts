import { apiRequest } from '../api';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface AIResponse {
  response: string;
  fallback?: boolean;
  message?: string;
  context?: {
    ordersPending: number;
    lowStock: number;
    todayOrders: number;
  };
}

/**
 * Send message to Admin AI Assistant
 */
export async function chatWithAdminAI(message: string, history: ChatMessage[] = []): Promise<AIResponse> {
  return apiRequest('/admin-ai/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history })
  });
}

/**
 * Get AI-generated business insights
 */
export async function getAIInsights(): Promise<{
  insights: string[];
  rawResponse?: string;
  context: {
    totalOrders: number;
    pendingOrders: number;
    todayOrders: number;
    totalRevenue: number;
    lowStockCount: number;
    recentUsers: number;
  };
  fallback?: boolean;
  message?: string;
}> {
  return apiRequest('/admin-ai/insights', {
    method: 'GET'
  });
}

/**
 * Get suggested customer response
 */
export async function suggestCustomerResponse(
  customerMessage: string, 
  orderDetails?: any, 
  tone: 'professional' | 'friendly' | 'empathetic' | 'apologetic' = 'professional'
): Promise<{
  suggestedResponse: string;
  alternatives: string[];
}> {
  return apiRequest('/admin-ai/suggest-response', {
    method: 'POST',
    body: JSON.stringify({ customerMessage, orderDetails, tone })
  });
}

/**
 * Get production optimization suggestions
 */
export async function optimizeProduction(): Promise<{
  optimization: string;
  orderCount: number;
  orders: Array<{
    id: string;
    items: number;
    productTypes: string[];
    customization: string;
    isBulk: boolean;
    deadline: string;
  }>;
}> {
  return apiRequest('/admin-ai/optimize-production', {
    method: 'POST'
  });
}

/**
 * Quick admin commands - predefined queries
 */
/**
 * Predictive Inventory Analysis
 */
export async function predictInventory(): Promise<{
  predictions: string;
  inventoryAnalysis: Array<{
    sku: string;
    name: string;
    currentStock: number;
    monthlyUsage: number;
    daysOfSupply: number;
    status: 'critical' | 'warning' | 'healthy';
  }>;
  atRiskItems: any[];
  summary: {
    critical: number;
    warning: number;
    healthy: number;
  };
  fallback?: boolean;
  message?: string;
}> {
  return apiRequest('/admin-ai/predict-inventory', {
    method: 'POST'
  });
}

/**
 * Analyze customer sentiment
 */
export async function analyzeSentiment(
  text: string, 
  orderHistory?: any, 
  context: string = 'general'
): Promise<{
  analysis: {
    sentiment: string;
    sentimentScore: number;
    urgency: string;
    intent: string;
    keyTopics: string[];
    emotionalTriggers: string[];
    recommendedAction: string;
    responsePriority: string;
    sentimentColor: string;
    originalText: string;
  };
  rawAnalysis: string;
}> {
  return apiRequest('/admin-ai/sentiment-analysis', {
    method: 'POST',
    body: JSON.stringify({ text, orderHistory, context })
  });
}

/**
 * Get pricing suggestions
 */
export async function getPricingSuggestions(): Promise<{
  pricingStrategy: string;
  data: {
    topProducts: any[];
    bottomProducts: any[];
    allProducts: any[];
  };
  summary: {
    totalProducts: number;
    totalRevenue: number;
    averageOrderValue: number;
  };
  fallback?: boolean;
  message?: string;
}> {
  return apiRequest('/admin-ai/pricing-suggestions', {
    method: 'POST'
  });
}

/**
 * Generate marketing campaign ideas
 */
export async function generateMarketingIdeas(
  campaignType: string = 'all',
  budget: string = 'medium',
  targetAudience: string = 'general'
): Promise<{
  campaigns: string;
  calendar: string;
  strategy: {
    targetAudience: string;
    budget: string;
    recommendedChannels: string[];
    seasonalOpportunities: string[];
  };
  fallback?: boolean;
  message?: string;
}> {
  return apiRequest('/admin-ai/marketing-ideas', {
    method: 'POST',
    body: JSON.stringify({ campaignType, budget, targetAudience })
  });
}

/**
 * Batch sentiment analysis
 */
export async function batchSentimentAnalysis(messages: Array<{id: string; text: string; source?: string}>): Promise<{
  analysis: string;
  count: number;
  processedAt: string;
}> {
  return apiRequest('/admin-ai/batch-sentiment', {
    method: 'POST',
    body: JSON.stringify({ messages })
  });
}

export const quickCommands = [
  {
    id: 'pending-orders',
    label: 'Review Pending Orders',
    icon: 'ClipboardList',
    query: 'Show me the pending orders and suggest which ones to prioritize'
  },
  {
    id: 'predict-inventory',
    label: 'Predict Inventory',
    icon: 'Package',
    query: 'Predict my inventory needs based on order trends'
  },
  {
    id: 'pricing-suggestions',
    label: 'Pricing Strategy',
    icon: 'TrendingUp',
    query: 'Analyze my pricing and suggest optimizations'
  },
  {
    id: 'marketing-ideas',
    label: 'Marketing Ideas',
    icon: 'Megaphone',
    query: 'Generate marketing campaign ideas for my business'
  },
  {
    id: 'sentiment-analysis',
    label: 'Analyze Feedback',
    icon: 'Heart',
    query: 'Help me analyze customer sentiment'
  },
  {
    id: 'production-queue',
    label: 'Optimize Production',
    icon: 'Printer',
    query: 'Optimize the production queue for efficiency'
  }
];

// Feature modes for advanced AI tools
export const aiFeatureModes = [
  {
    id: 'chat',
    label: 'Chat',
    icon: 'MessageSquare',
    description: 'General AI assistant'
  },
  {
    id: 'inventory',
    label: 'Inventory Predictor',
    icon: 'Package',
    description: 'AI-powered stock predictions'
  },
  {
    id: 'sentiment',
    label: 'Sentiment Analysis',
    icon: 'Heart',
    description: 'Analyze customer feedback'
  },
  {
    id: 'pricing',
    label: 'Pricing AI',
    icon: 'TrendingUp',
    description: 'Smart pricing suggestions'
  },
  {
    id: 'marketing',
    label: 'Marketing Ideas',
    icon: 'Megaphone',
    description: 'Campaign generator'
  }
];
