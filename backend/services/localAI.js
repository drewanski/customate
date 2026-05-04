/**
 * Optimized Gemini AI Service with Smart Caching & Rate Limit Protection
 * Focuses on efficiency and admin productivity
 */

class OptimizedGeminiService {
  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.requestQueue = [];
    this.processing = false;
    this.cache = new Map(); // In-memory cache
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.lastRequestTime = 0;
    this.minRequestInterval = 1000; // 1 second between requests (60/min)
    this.dailyRequestCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.quotaExceeded = false; // Emergency flag
    this.quotaResetTime = null; // When to retry
    
    // Admin prompt templates (pre-optimized to reduce tokens)
    this.adminTemplates = {
      sales: `Analyze sales data concisely:
- Top 3 products by revenue
- Trend vs last period (up/down %)
- Action items (max 2)
Format: Bullet points only`,

      inventory: `Inventory status:
- Items below min stock (count)
- Top 3 items needing reorder
- Estimated revenue at risk
Format: Brief bullets`,

      customer: `Customer insights:
- New vs returning ratio
- Top customer segment
- 1 growth recommendation
Format: 3 bullet points`,

      product: `Write product description:
SEO-friendly, persuasive, under 100 words.
Highlight benefits, not just features.`,

      response: `Draft professional customer reply:
Empathetic, solution-focused, actionable next steps.
Max 3 sentences.`,

      default: `You are CustoMate Admin AI. Be concise and actionable.`
    };
  }

  /**
   * Check if we should reset daily counter
   */
  checkDailyReset() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyRequestCount = 0;
      this.lastResetDate = today;
    }
  }

  /**
   * Smart caching with hash key
   */
  getCacheKey(prompt, type) {
    // Simple hash for caching
    return type + ':' + prompt.slice(0, 50).toLowerCase().replace(/\s+/g, '');
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.content;
  }

  setCache(key, content) {
    this.cache.set(key, {
      content,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Rate limiting with exponential backoff
   */
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Queue system for batching requests
   */
  async queueRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        fn: requestFn,
        resolve,
        reject
      });
      
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.requestQueue.length === 0) return;
    
    this.processing = true;
    
    while (this.requestQueue.length > 0) {
      const { fn, resolve, reject } = this.requestQueue.shift();
      
      try {
        await this.waitForRateLimit();
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
      
      // Small delay between requests
      await new Promise(r => setTimeout(r, 500));
    }
    
    this.processing = false;
  }

  /**
   * Optimized Gemini call with retries
   */
  async callGemini(prompt, systemPrompt = null, retries = 0) {
    this.checkDailyReset();
    
    // EMERGENCY: Quota exceeded - don't even try
    if (this.quotaExceeded) {
      const now = Date.now();
      if (this.quotaResetTime && now < this.quotaResetTime) {
        throw new Error('API quota exceeded. Please try again after ' + new Date(this.quotaResetTime).toLocaleTimeString());
      }
      // Reset after cooldown
      this.quotaExceeded = false;
      this.quotaResetTime = null;
    }
    
    if (this.dailyRequestCount >= 1400) { // Leave buffer from 1500 limit
      throw new Error('Daily rate limit approaching. Using cached responses.');
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(this.geminiKey);
        
        // Use gemini-1.5-flash for faster, cheaper responses
        const model = genAI.getGenerativeModel({ 
          model: 'gemini-1.5-flash',
          generationConfig: {
            maxOutputTokens: 512, // Limit response size
            temperature: 0.3, // Lower = more consistent
          }
        });

        const fullPrompt = systemPrompt 
          ? systemPrompt + '\n\nQuery: ' + prompt + '\n\nRespond concisely:'
          : prompt;

        const result = await model.generateContent(fullPrompt);
        this.dailyRequestCount++;
        
        return {
          success: true,
          content: result.response.text(),
          source: 'gemini',
          cached: false
        };
      } catch (error) {
        if (error.message?.includes('429') || error.status === 429) {
          // Quota exceeded - set emergency flag and don't retry
          console.log('[AI] QUOTA EXCEEDED - Blocking all AI calls for 1 hour');
          this.quotaExceeded = true;
          this.quotaResetTime = Date.now() + (60 * 60 * 1000); // 1 hour cooldown
          throw new Error('API quota exceeded. AI features disabled for 1 hour. Please try again later.');
        } else if (attempt < retries) {
          // Other errors - retry
          const delay = Math.pow(2, attempt) * 1000;
          console.log('[AI] Error, retrying in ' + delay + 'ms...');
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Smart admin assistant with caching
   */
  async generateResponse(prompt, type = 'default', useCache = true) {
    const cacheKey = this.getCacheKey(prompt, type);
    
    // Check cache first
    if (useCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log('[AI] Cache hit');
        return {
          success: true,
          content: cached,
          source: 'cache',
          cached: true
        };
      }
    }

    // Use optimized template
    const systemPrompt = this.adminTemplates[type] || this.adminTemplates.default;

    // Queue the request
    const result = await this.queueRequest(() => 
      this.callGemini(prompt, systemPrompt)
    );

    // Cache the result
    if (result.success && useCache) {
      this.setCache(cacheKey, result.content);
    }

    return result;
  }

  /**
   * Batch processing for multiple items
   */
  async batchProcess(items, processor, batchSize = 5) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Process batch in parallel (within rate limits)
      const batchPromises = batch.map(item => 
        this.queueRequest(() => processor(item))
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
      
      // Wait between batches
      if (i + batchSize < items.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    return results;
  }

  /**
   * Admin automation with pre-computed insights
   */
  async adminAutomation(task, data) {
    const prompts = {
      'sales-summary': 'Sales: ' + data.revenue + ' revenue, ' + data.orders + ' orders. Trend: ' + data.trend + '. Top: ' + data.topProduct + '. Suggest 2 actions.',
      'inventory-alert': data.lowStockCount + ' items low. Critical: ' + (data.criticalItems ? data.criticalItems.join(', ') : '') + '. Recommend restock quantities.',
      'daily-brief': 'Yesterday: P' + data.yesterdayRevenue + ', ' + data.yesterdayOrders + ' orders. Today so far: P' + data.todayRevenue + '. Compare and alert.',
      'pricing-suggestion': 'Product: ' + data.name + ', Cost: P' + data.cost + ', Current: P' + data.price + ', Competitor: P' + data.competitorPrice + '. Suggest price.',
      'default': JSON.stringify(data)
    };

    const prompt = prompts[task] || prompts.default;
    return this.generateResponse(prompt, task === 'default' ? 'default' : task.replace('-', ''));
  }

  /**
   * Check status and usage
   */
  getStatus() {
    this.checkDailyReset();
    return {
      provider: 'gemini',
      dailyRequests: this.dailyRequestCount,
      dailyLimit: 1500,
      remaining: 1500 - this.dailyRequestCount,
      cacheSize: this.cache.size,
      queueLength: this.requestQueue.length,
      lastRequest: this.lastRequestTime
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton
export default new OptimizedGeminiService();
