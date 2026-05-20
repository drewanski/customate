import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, X, Send, Sparkles, ClipboardList, Package, BarChart3, 
  Printer, MessageSquare, ChevronDown, ChevronUp, Loader2, 
  Lightbulb, TrendingUp, AlertCircle, CheckCircle2, Heart,
  Megaphone, DollarSign, BrainCircuit, Wand2, Tag, ShoppingCart,
  Users, FileText, ThumbsUp, ThumbsDown, Meh, Zap, LayoutDashboard,
  Box, TrendingUpIcon, CreditCard, Settings, RefreshCw, CheckCircle,
  XCircle, Clock, AlertTriangle, Clipboard, Trash2
} from 'lucide-react';
import { Button } from './Button';
import { 
  chatWithAdminAI, getAIInsights, quickCommands, ChatMessage,
  predictInventory, analyzeSentiment, getPricingSuggestions, 
  generateMarketingIdeas, aiFeatureModes 
} from '../api/adminAI';
import { apiRequest } from '../api';
import { ToastType } from './Toast';
import { formatPeso } from '../utils/format';

// Local toast helper
const addToast = (message: string, type: ToastType) => {
  const event = new CustomEvent('show-toast', { 
    detail: { message, type, id: Date.now().toString() } 
  });
  window.dispatchEvent(event);
};

type AIMode = 'chat' | 'inventory' | 'sentiment' | 'pricing' | 'marketing' | 'quickstats';

interface QuickStats {
  totalOrders: number;
  pendingOrders: number;
  inProduction: number;
  completed: number;
  totalRevenue: number;
  lowStockItems: number;
  outOfStock: number;
  todayOrders: number;
  weekRevenue: number;
}

// Local-only metadata we attach to each chat message — timestamp so admins
// know when each turn happened, and a unique key for the copy button.
type ChatMessageWithMeta = ChatMessage & { ts?: number };

// Persist key — bump suffix if we ever break the shape so old history doesn't
// crash the component on load.
const CHAT_STORAGE_KEY = 'customate_admin_ai_chat_v1';

export function AdminAIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeMode, setActiveMode] = useState<AIMode>('quickstats');

  // Chat state — initial value is loaded from localStorage so the
  // conversation survives page refreshes. Admins often bounce between tabs
  // and don't want to lose context.
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<ChatMessageWithMeta[]>(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Cap restored history at 50 messages so the chat doesn't grow forever.
      return parsed.slice(-50);
    } catch {
      return [];
    }
  });
  // Local UX helpers — which message was just copied (for the brief
  // checkmark feedback), and whether the user has chosen to wipe history.
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<string[] | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(true); // true = has API key, false = no API key
  
  // Quick Stats state
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  
  // Feature-specific states
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [sentimentText, setSentimentText] = useState('');
  const [sentimentResult, setSentimentResult] = useState<any>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);
  const [pricingData, setPricingData] = useState<any>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [marketingData, setMarketingData] = useState<any>(null);
  const [marketingLoading, setMarketingLoading] = useState(false);
  const [marketingConfig, setMarketingConfig] = useState({
    campaignType: 'all',
    budget: 'medium',
    targetAudience: 'general'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, activeMode]);

  // Persist chat to localStorage on every change. Cap stored history at 50
  // messages so it doesn't bloat localStorage indefinitely. Wrapped in a
  // try/catch because some browsers (private mode, quota exceeded) throw.
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history.slice(-50)));
    } catch {
      /* non-fatal — chat just won't persist this session */
    }
  }, [history]);

  // Copy a message's text to the clipboard. Shows a brief checkmark on the
  // copied row so the admin gets visual confirmation. We re-clear the
  // checkmark after 1.5 seconds.
  const handleCopyMessage = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((current) => (current === idx ? null : current)), 1500);
    } catch (err) {
      console.warn('Clipboard copy failed', err);
    }
  };

  // Clear the entire conversation. The admin must confirm — chat history
  // is often a useful record of decisions made during the day.
  const handleClearChat = () => {
    if (history.length === 0) return;
    if (!confirm('Clear the entire chat history? This cannot be undone.')) return;
    setHistory([]);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      /* non-fatal */
    }
  };

  // Load insights only when explicitly requested (not on auto-open)
  useEffect(() => {
    // Don't auto-load AI insights to save quota
    // User must click "Refresh Insights" button
    if (isOpen && activeMode === 'quickstats') {
      if (!quickStats) loadQuickStats();
    }
  }, [isOpen, activeMode]);

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      const data = await getAIInsights();
      setInsights(data.insights);
      setAiConfigured(true); // API is configured (responded)
      // Check if AI returned fallback data (quota exceeded) vs actual AI response
      if (data.fallback) {
        setAiAvailable(false); // Quota exceeded, not available right now
      } else {
        setAiAvailable(true); // AI is working normally
      }
    } catch (err: any) {
      console.error('Failed to load insights:', err);
      // Only mark as unavailable if AI is truly not configured
      if (err.message?.includes('not configured') || err.status === 503) {
        setAiConfigured(false); // Not configured
        setAiAvailable(false);
      }
      // Don't change state for quota errors - fallback data is still shown
    } finally {
      setInsightsLoading(false);
    }
  };

  const loadQuickStats = async () => {
    setStatsLoading(true);
    try {
      const orders = await apiRequest('/orders');
      const inventory = await apiRequest('/inventory');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const todayOrders = orders.filter((o: any) => new Date(o.createdAt) >= today).length;
      const weekRevenue = orders
        .filter((o: any) => new Date(o.createdAt) >= weekAgo)
        .reduce((sum: number, o: any) => sum + (o.totalPrice || 0), 0);
      
      const lowStock = inventory.filter((i: any) => (i.stock - (i.reservedStock || 0)) <= 5 && i.stock > 0).length;
      const outOfStock = inventory.filter((i: any) => i.stock === 0).length;
      
      setQuickStats({
        totalOrders: orders.length,
        pendingOrders: orders.filter((o: any) => o.status === 'pending').length,
        inProduction: orders.filter((o: any) => o.status === 'in_production').length,
        completed: orders.filter((o: any) => o.status === 'completed').length,
        totalRevenue: orders.reduce((sum: number, o: any) => sum + (o.totalPrice || 0), 0),
        lowStockItems: lowStock,
        outOfStock: outOfStock,
        todayOrders: todayOrders,
        weekRevenue: weekRevenue
      });
    } catch (err) {
      console.error('Failed to load quick stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // Chat handlers
  const handleSend = async () => {
    if (!message.trim() || loading) return;
    const userMessage = message.trim();
    setMessage('');
    // Attach a local timestamp so we can show "2 min ago" on each turn.
    setHistory(prev => [...prev, { role: 'user', content: userMessage, ts: Date.now() }]);
    setLoading(true);

    try {
      // Strip the local `ts` field before sending — backend expects {role,content}.
      const cleanHistory = history.map(({ role, content }) => ({ role, content }));
      const response = await chatWithAdminAI(userMessage, cleanHistory);
      // Check if AI is in fallback mode
      if (response.fallback) {
        setAiAvailable(false);
      }
      setHistory(prev => [...prev, { role: 'model', content: response.response, ts: Date.now() }]);
    } catch (err: any) {
      addToast('AI assistant error: ' + err.message, 'error');
      setHistory(prev => [...prev, {
        role: 'model',
        content: 'Sorry, I encountered an error. Please try again.',
        ts: Date.now(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickCommand = (command: typeof quickCommands[0]) => {
    if (command.id === 'predict-inventory') {
      setActiveMode('inventory');
      loadInventoryPrediction();
    } else if (command.id === 'pricing-suggestions') {
      setActiveMode('pricing');
      loadPricingSuggestions();
    } else if (command.id === 'marketing-ideas') {
      setActiveMode('marketing');
    } else if (command.id === 'sentiment-analysis') {
      setActiveMode('sentiment');
    } else {
      setMessage(command.query);
      setTimeout(() => handleSend(), 100);
    }
  };

  // Inventory Predictor
  const loadInventoryPrediction = async () => {
    setInventoryLoading(true);
    try {
      const data = await predictInventory();
      setInventoryData(data);
      // Check if AI is in fallback mode
      if (data.fallback) {
        setAiAvailable(false);
        addToast(data.message || 'AI quota exceeded. Showing system-generated data.', 'warning');
      } else {
        setAiAvailable(true);
      }
    } catch (err: any) {
      if (err.message?.includes('not configured') || err.status === 503) {
        setAiConfigured(false);
        setAiAvailable(false);
        addToast('AI features not configured. Add GEMINI_API_KEY to backend .env file.', 'warning');
      } else if (err.message?.includes('quota') || err.status === 429) {
        setAiAvailable(false);
        addToast('AI quota exceeded. Using fallback data.', 'warning');
      } else {
        addToast('Failed to load inventory prediction: ' + err.message, 'error');
      }
    } finally {
      setInventoryLoading(false);
    }
  };

  // Sentiment Analysis
  const handleSentimentAnalysis = async () => {
    if (!sentimentText.trim()) return;
    setSentimentLoading(true);
    try {
      const data = await analyzeSentiment(sentimentText);
      setSentimentResult(data.analysis);
    } catch (err: any) {
      addToast('Sentiment analysis failed: ' + err.message, 'error');
    } finally {
      setSentimentLoading(false);
    }
  };

  // Pricing Suggestions
  const loadPricingSuggestions = async () => {
    setPricingLoading(true);
    try {
      const data = await getPricingSuggestions();
      setPricingData(data);
      // Check if AI is in fallback mode
      if (data.fallback) {
        setAiAvailable(false);
        addToast(data.message || 'AI quota exceeded. Showing system-generated data.', 'warning');
      } else {
        setAiAvailable(true);
      }
    } catch (err: any) {
      if (err.message?.includes('not configured') || err.status === 503) {
        setAiConfigured(false);
        setAiAvailable(false);
        addToast('AI features not configured. Add GEMINI_API_KEY to backend .env file.', 'warning');
      } else if (err.message?.includes('quota') || err.status === 429) {
        setAiAvailable(false);
        addToast('AI quota exceeded. Using fallback data.', 'warning');
      } else {
        addToast('Failed to load pricing suggestions: ' + err.message, 'error');
      }
    } finally {
      setPricingLoading(false);
    }
  };

  // Marketing Ideas
  const generateMarketing = async () => {
    setMarketingLoading(true);
    try {
      const data = await generateMarketingIdeas(
        marketingConfig.campaignType,
        marketingConfig.budget,
        marketingConfig.targetAudience
      );
      setMarketingData(data);
      // Check if AI is in fallback mode
      if (data.fallback) {
        setAiAvailable(false);
        addToast(data.message || 'AI quota exceeded. Showing system-generated data.', 'warning');
      } else {
        setAiAvailable(true);
      }
    } catch (err: any) {
      if (err.message?.includes('not configured') || err.status === 503) {
        setAiConfigured(false);
        setAiAvailable(false);
        addToast('AI features not configured. Add GEMINI_API_KEY to backend .env file.', 'warning');
      } else if (err.message?.includes('quota') || err.status === 429) {
        setAiAvailable(false);
        addToast('AI quota exceeded. Using fallback data.', 'warning');
      } else {
        addToast('Failed to generate marketing ideas: ' + err.message, 'error');
      }
    } finally {
      setMarketingLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setHistory([]);
    setInsights(null);
  };

  // Mode selector tabs
  const ModeSelector = () => (
    <div className="flex border-b border-gray-200 bg-gray-50/50 overflow-x-auto">
      {/* Quick Stats Tab - Always Available */}
      <button
        onClick={() => setActiveMode('quickstats')}
        className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 text-[10px] font-medium transition-all min-w-[60px] ${
          activeMode === 'quickstats'
            ? 'bg-white text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        <LayoutDashboard className="w-4 h-4" />
        <span className="hidden sm:inline">Dashboard</span>
      </button>
      
      {aiFeatureModes.map((mode) => {
        const icons: Record<string, any> = {
          MessageSquare, Package, Heart, TrendingUp, Megaphone
        };
        const Icon = icons[mode.icon] || Bot;
        const isActive = activeMode === mode.id;
        
        return (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id as AIMode)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 text-[10px] font-medium transition-all min-w-[60px] ${
              isActive 
                ? 'bg-white text-blue-600 border-b-2 border-blue-600' 
                : aiAvailable 
                  ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  : 'text-gray-300 cursor-not-allowed'
            }`}
            disabled={!aiAvailable}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-lg shadow-blue-500/30 hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center group z-50"
        title="AI Admin Assistant"
      >
        <Bot className="w-6 h-6" />
        {aiAvailable && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />}
        {!aiAvailable && aiConfigured && <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full border-2 border-white" />}
        <span className="absolute right-full mr-3 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          {aiAvailable ? 'AI Assistant' : aiConfigured ? 'AI Quota Exceeded' : 'Admin Dashboard'}
        </span>
      </button>
    );
  }

  return (
    <div 
      className={`fixed bottom-6 right-6 bg-white rounded-2xl shadow-2xl z-50 flex flex-col transition-all duration-300 overflow-hidden border border-gray-200 ${
        isExpanded ? 'w-[650px] h-[750px]' : 'w-[420px] h-[600px]'
      }`}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold">Admin AI Assistant</h3>
            <p className="text-xs text-white/80">
              {aiAvailable 
                ? 'AI-powered insights' 
                : aiConfigured 
                  ? 'AI quota exceeded - Using system data' 
                  : 'Live Dashboard'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Mode Selector */}
      <ModeSelector />

      {/* CONTENT BASED ON MODE */}
      <div className="flex-1 overflow-hidden">
        
        {/* QUICK STATS MODE */}
        {activeMode === 'quickstats' && (
          <div className="h-full flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900">Live Dashboard</h3>
              </div>
              <Button size="sm" variant="outline" onClick={loadQuickStats} disabled={statsLoading}>
                {statsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Refresh
              </Button>
            </div>

            {statsLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            )}

            {quickStats && (
              <>
                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                    <p className="text-[10px] text-blue-600 uppercase font-bold">Total Revenue</p>
                    <p className="text-xl font-bold text-blue-700">{formatPeso(quickStats.totalRevenue)}</p>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                    <p className="text-[10px] text-green-600 uppercase font-bold">This Week</p>
                    <p className="text-xl font-bold text-green-700">{formatPeso(quickStats.weekRevenue)}</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                    <p className="text-[10px] text-purple-600 uppercase font-bold">Total Orders</p>
                    <p className="text-xl font-bold text-purple-700">{quickStats.totalOrders}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                    <p className="text-[10px] text-orange-600 uppercase font-bold">Today's Orders</p>
                    <p className="text-xl font-bold text-orange-700">{quickStats.todayOrders}</p>
                  </div>
                </div>

                {/* Order Status Breakdown */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                  <p className="text-[10px] text-gray-500 uppercase font-bold mb-3">Order Status</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm text-gray-700">Pending</span>
                      </div>
                      <span className="font-bold text-gray-900">{quickStats.pendingOrders}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Printer className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-gray-700">In Production</span>
                      </div>
                      <span className="font-bold text-gray-900">{quickStats.inProduction}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-gray-700">Completed</span>
                      </div>
                      <span className="font-bold text-gray-900">{quickStats.completed}</span>
                    </div>
                  </div>
                </div>

                {/* Inventory Alerts */}
                {(quickStats.lowStockItems > 0 || quickStats.outOfStock > 0) && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Inventory Alerts</p>
                    {quickStats.lowStockItems > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          <span className="text-sm text-yellow-800">Low Stock Items</span>
                        </div>
                        <span className="font-bold text-yellow-700">{quickStats.lowStockItems}</span>
                      </div>
                    )}
                    {quickStats.outOfStock > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-600" />
                          <span className="text-sm text-red-800">Out of Stock</span>
                        </div>
                        <span className="font-bold text-red-700">{quickStats.outOfStock}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Not Available Message */}
                {!aiAvailable && (
                  <div className="mt-4 bg-gray-100 border border-gray-200 rounded-lg p-3">
                    <p className="text-xs text-gray-500 text-center">
                      {aiConfigured 
                        ? '⚡ Gemini free tier quota exceeded (60 req/min). Using smart system insights. Wait 1 min to retry.'
                        : 'AI features not configured. Add GEMINI_API_KEY to enable AI insights.'}
                    </p>
                  </div>
                )}
              </>
            )}

            {!quickStats && !statsLoading && (
              <div className="text-center py-12">
                <LayoutDashboard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-600">Click Refresh to load dashboard data</p>
              </div>
            )}
          </div>
        )}

        {/* CHAT MODE */}
        {activeMode === 'chat' && (
          <div className="h-full flex flex-col">
            {/* Insights Banner */}
            {insights && insights.length > 0 && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700 uppercase">AI Insights</span>
                </div>
                <div className="space-y-1.5">
                  {insights.map((insight, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        idx === 0 ? 'bg-red-100 text-red-600' :
                        idx === 1 ? 'bg-blue-100 text-blue-600' :
                        'bg-green-100 text-green-600'
                      }`}>
                        {idx === 0 ? <AlertCircle className="w-3 h-3" /> :
                         idx === 1 ? <TrendingUp className="w-3 h-3" /> :
                         <CheckCircle2 className="w-3 h-3" />}
                      </span>
                      <span className="text-gray-700">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Commands */}
            {history.length === 0 && (
              <div className="p-3 border-b border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Quick Commands</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickCommands.slice(0, 4).map((cmd) => {
                    const icons: Record<string, any> = {
                      ClipboardList, Package, TrendingUp, Megaphone, Heart, Printer
                    };
                    const Icon = icons[cmd.icon] || Bot;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => handleQuickCommand(cmd)}
                        className="flex items-center gap-2 p-2 bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-lg text-left"
                      >
                        <Icon className="w-4 h-4 text-gray-600" />
                        <span className="text-xs text-gray-700">{cmd.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
              {history.length === 0 && (
                <div className="text-center py-6">
                  <BrainCircuit className="w-12 h-12 text-blue-200 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-700 mb-3">Ask me anything about your business</p>
                  {/* Example prompts — click any to drop it into the input.
                      Helps admins discover what the AI can do without
                      having to guess. Each is a real, useful question. */}
                  <div className="text-left max-w-xs mx-auto space-y-1.5">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Try asking</p>
                    {[
                      'What were my top 3 products this week?',
                      'Which SKUs are running low on stock?',
                      'Summarize today\'s order activity',
                      'Which urgency tier earns the most revenue?',
                      'What\'s the average order value this month?',
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => setMessage(q)}
                        className="block w-full text-left px-2.5 py-1.5 rounded-md text-xs text-gray-700 bg-white border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {history.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const ts = msg.ts ? new Date(msg.ts) : null;
                return (
                  <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                    <div className="max-w-[85%]">
                      <div className={`rounded-xl px-3 py-2 text-sm ${
                        isUser
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
                      }`}>
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                      </div>
                      {/* Footer row — timestamp + copy button. Copy only on
                          AI replies (no value copying your own questions). */}
                      <div className={`flex items-center gap-2 mt-1 px-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                        {ts && (
                          <span className="text-[10px] text-gray-400">
                            {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {!isUser && (
                          <button
                            onClick={() => handleCopyMessage(idx, msg.content)}
                            className="text-[10px] text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                            title="Copy response to clipboard"
                          >
                            {copiedIdx === idx ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-600">Copied</span>
                              </>
                            ) : (
                              <>
                                <Clipboard className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white">
              <div className="flex gap-2 items-start">
                {/* Multi-line textarea — many AI prompts benefit from
                    multiple lines (paste an order ID block, describe a
                    situation in detail). Auto-grows up to 4 rows. */}
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sends, Shift+Enter creates a new line — standard
                    // chat-UX convention.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask about orders, inventory, or analytics… (Shift+Enter for new line)"
                  rows={1}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20 resize-none max-h-32"
                  disabled={loading}
                />
                <Button size="sm" onClick={handleSend} disabled={!message.trim() || loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              {/* Helper row — char count + clear-chat button. Clear button
                  only appears once there's actually something to clear. */}
              {history.length > 0 && (
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-[10px] text-gray-400">
                    {history.length} message{history.length === 1 ? '' : 's'} in conversation
                  </span>
                  <button
                    onClick={handleClearChat}
                    className="text-[10px] text-gray-400 hover:text-rose-600 transition-colors flex items-center gap-1 font-semibold"
                    title="Clear all chat history"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* INVENTORY PREDICTOR MODE */}
        {activeMode === 'inventory' && (
          <div className="h-full flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900">Inventory Predictor</h3>
              </div>
              <Button size="sm" variant="outline" onClick={loadInventoryPrediction} disabled={inventoryLoading || !aiAvailable}>
                {inventoryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Analyze
              </Button>
            </div>

            {inventoryLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            )}

            {inventoryData && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{inventoryData.summary.critical}</p>
                    <p className="text-[10px] text-red-600 uppercase">Critical</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{inventoryData.summary.warning}</p>
                    <p className="text-[10px] text-yellow-600 uppercase">Warning</p>
                  </div>
                  <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{inventoryData.summary.healthy}</p>
                    <p className="text-[10px] text-green-600 uppercase">Healthy</p>
                  </div>
                </div>

                {/* AI Predictions */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-blue-700">AI Predictions</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{inventoryData.predictions}</div>
                </div>

                {/* At-Risk Items Table */}
                {inventoryData.atRiskItems.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">At-Risk Items</h4>
                    <div className="space-y-2">
                      {inventoryData.atRiskItems.slice(0, 5).map((item: any, idx: number) => (
                        <div key={idx} className={`flex items-center justify-between p-2 rounded-lg ${
                          item.status === 'critical' ? 'bg-red-50 border border-red-100' :
                          'bg-yellow-50 border border-yellow-100'
                        }`}>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">{item.daysOfSupply} days supply</p>
                          </div>
                          <div className={`px-2 py-1 rounded text-xs font-bold ${
                            item.status === 'critical' ? 'bg-red-200 text-red-800' :
                            'bg-yellow-200 text-yellow-800'
                          }`}>
                            {item.currentStock} left
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!inventoryData && !inventoryLoading && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                {!aiAvailable ? (
                  <>
                    <p className="text-sm text-gray-600">
                      {aiConfigured ? 'AI quota exceeded' : 'AI features not configured'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {aiConfigured ? 'Try again later or check Dashboard' : 'Add GEMINI_API_KEY to backend .env'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Click Analyze to predict inventory needs</p>
                    <p className="text-xs text-gray-400 mt-1">Based on last 30 days of orders</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* SENTIMENT ANALYSIS MODE */}
        {activeMode === 'sentiment' && (
          <div className="h-full flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="w-5 h-5 text-rose-500" />
              <h3 className="font-bold text-gray-900">Sentiment Analysis</h3>
            </div>

            <div className="space-y-3">
              <textarea
                value={sentimentText}
                onChange={(e) => setSentimentText(e.target.value)}
                placeholder="Paste customer feedback, review, or message here..."
                className="w-full h-32 border border-gray-200 rounded-lg p-3 text-sm resize-none focus:ring-2 focus:ring-rose-500/20"
              />
              <Button 
                onClick={handleSentimentAnalysis} 
                disabled={!sentimentText.trim() || sentimentLoading || !aiAvailable}
                className="w-full"
              >
                {sentimentLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Analyze Sentiment
              </Button>
            </div>

            {sentimentResult && (
              <div className="mt-4 space-y-3">
                {/* Sentiment Score */}
                <div className={`p-4 rounded-xl border-2 ${
                  sentimentResult.sentiment === 'positive' ? 'bg-green-50 border-green-200' :
                  sentimentResult.sentiment === 'negative' ? 'bg-red-50 border-red-200' :
                  sentimentResult.sentiment === 'very_negative' ? 'bg-red-100 border-red-300' :
                  'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-700">Sentiment</span>
                    <div className="flex items-center gap-1">
                      {sentimentResult.sentiment === 'positive' && <ThumbsUp className="w-5 h-5 text-green-600" />}
                      {sentimentResult.sentiment === 'negative' && <ThumbsDown className="w-5 h-5 text-red-600" />}
                      {sentimentResult.sentiment === 'neutral' && <Meh className="w-5 h-5 text-gray-500" />}
                      <span className={`font-bold ${
                        sentimentResult.sentiment === 'positive' ? 'text-green-700' :
                        sentimentResult.sentiment === 'negative' ? 'text-red-700' :
                        'text-gray-700'
                      }`}>
                        {sentimentResult.sentiment.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        sentimentResult.sentimentScore > 70 ? 'bg-green-500' :
                        sentimentResult.sentimentScore > 40 ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${sentimentResult.sentimentScore}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Score: {sentimentResult.sentimentScore}/100</p>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-[10px] text-gray-500 uppercase">Urgency</p>
                    <p className={`text-sm font-bold ${
                      sentimentResult.urgency === 'critical' ? 'text-red-600' :
                      sentimentResult.urgency === 'high' ? 'text-orange-600' :
                      'text-gray-700'
                    }`}>{sentimentResult.urgency}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-[10px] text-gray-500 uppercase">Intent</p>
                    <p className="text-sm font-bold text-gray-700">{sentimentResult.intent}</p>
                  </div>
                </div>

                {/* Recommended Action */}
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg">
                  <p className="text-[10px] text-blue-600 uppercase font-bold mb-1">Recommended Action</p>
                  <p className="text-sm text-gray-700">{sentimentResult.recommendedAction}</p>
                  <p className="text-xs text-blue-600 mt-1">Priority: {sentimentResult.responsePriority}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PRICING AI MODE */}
        {activeMode === 'pricing' && (
          <div className="h-full flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-gray-900">Pricing Strategy AI</h3>
              </div>
              <Button size="sm" variant="outline" onClick={loadPricingSuggestions} disabled={pricingLoading || !aiAvailable}>
                {pricingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Analyze
              </Button>
            </div>

            {pricingLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            )}

            {pricingData && (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-emerald-600">{pricingData.summary.totalProducts}</p>
                    <p className="text-[10px] text-emerald-600 uppercase">Products</p>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-blue-600">₱{(pricingData.summary.averageOrderValue / 1000).toFixed(1)}k</p>
                    <p className="text-[10px] text-blue-600 uppercase">Avg Order</p>
                  </div>
                  <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-purple-600">₱{(pricingData.summary.totalRevenue / 1000).toFixed(0)}k</p>
                    <p className="text-[10px] text-purple-600 uppercase">Revenue</p>
                  </div>
                </div>

                {/* AI Strategy */}
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-700">AI Pricing Strategy</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{pricingData.pricingStrategy}</div>
                </div>

                {/* Top Performers */}
                {pricingData.data.topProducts.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Top Performers</h4>
                    <div className="space-y-2">
                      {pricingData.data.topProducts.slice(0, 3).map((product: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-green-50 border border-green-100 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.totalSold} sold • Current: ₱{product.currentPrice}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-green-700">₱{(product.revenue / 1000).toFixed(1)}k</p>
                            <p className="text-[10px] text-green-600">revenue</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!pricingData && !pricingLoading && (
              <div className="text-center py-12">
                <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                {!aiAvailable ? (
                  <>
                    <p className="text-sm text-gray-600">
                      {aiConfigured ? 'AI quota exceeded' : 'AI features not configured'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {aiConfigured ? 'Try again later or check Dashboard' : 'Add GEMINI_API_KEY to backend .env'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Click Analyze for pricing insights</p>
                    <p className="text-xs text-gray-400 mt-1">Based on last 60 days of sales</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* MARKETING MODE */}
        {activeMode === 'marketing' && (
          <div className="h-full flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <Megaphone className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-gray-900">Marketing Campaign Generator</h3>
            </div>

            {/* Config */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <select 
                value={marketingConfig.campaignType}
                onChange={(e) => setMarketingConfig({...marketingConfig, campaignType: e.target.value})}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              >
                <option value="all">All Types</option>
                <option value="social_media">Social Media</option>
                <option value="email">Email</option>
                <option value="seasonal">Seasonal</option>
                <option value="promotions">Promotions</option>
              </select>
              <select
                value={marketingConfig.budget}
                onChange={(e) => setMarketingConfig({...marketingConfig, budget: e.target.value})}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              >
                <option value="low">Low Budget</option>
                <option value="medium">Medium Budget</option>
                <option value="high">High Budget</option>
              </select>
              <select
                value={marketingConfig.targetAudience}
                onChange={(e) => setMarketingConfig({...marketingConfig, targetAudience: e.target.value})}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
              >
                <option value="general">General</option>
                <option value="students">Students</option>
                <option value="business">Business</option>
                <option value="events">Events/Groups</option>
              </select>
            </div>

            <Button 
              onClick={generateMarketing} 
              disabled={marketingLoading || !aiAvailable}
              className="mb-4"
            >
              {marketingLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
              Generate Campaign Ideas
            </Button>

            {marketingData && (
              <div className="space-y-4">
                {/* Campaigns */}
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Megaphone className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold text-purple-700">Campaign Ideas</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{marketingData.campaigns}</div>
                </div>

                {/* Calendar */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-blue-700">30-Day Calendar</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">{marketingData.calendar}</div>
                </div>

                {/* Strategy Tips */}
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-700">Strategy Tips</span>
                  </div>
                  <div className="text-xs text-gray-700 space-y-1">
                    <p><strong>Channels:</strong> {marketingData.strategy.recommendedChannels.join(', ')}</p>
                    <p><strong>Seasonal Opportunities:</strong> {marketingData.strategy.seasonalOpportunities.join(', ')}</p>
                  </div>
                </div>
              </div>
            )}

            {!marketingData && !marketingLoading && (
              <div className="text-center py-12">
                <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                {!aiAvailable ? (
                  <>
                    <p className="text-sm text-gray-600">
                      {aiConfigured ? 'AI quota exceeded' : 'AI features not configured'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {aiConfigured ? 'Try again later or check Dashboard' : 'Add GEMINI_API_KEY to backend .env'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Configure and generate campaign ideas</p>
                    <p className="text-xs text-gray-400 mt-1">AI-powered marketing for Filipino market</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
