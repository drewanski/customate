# 🚀 Production AI Deployment Guide

## Overview
Deploy your unlimited Local AI in production with 3 different hosting options.

---

## 🎯 Deployment Options

### Option 1: Same-Server Deployment (EASIEST)
**Run Ollama on the same server as your backend**

**Best For:** Small-medium traffic, cost savings

**Pros:**
- ✅ Simple setup
- ✅ No network latency
- ✅ Lowest cost

**Cons:**
- ❌ Shares resources with backend
- ❌ Single point of failure

**Setup:**
```bash
# On your production server (e.g., Railway, Render, VPS)
# Install Ollama alongside your backend

# 1. SSH into your server
ssh root@your-server-ip

# 2. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 3. Start Ollama service
systemctl start ollama
systemctl enable ollama  # Auto-start on boot

# 4. Pull model
ollama pull llama3.2

# 5. Update environment variables in Railway/Render dashboard:
OLLAMA_HOST=http://localhost:11434
AI_PROVIDER_PRIORITY=local
```

---

### Option 2: Dedicated AI Server (RECOMMENDED)
**Separate VPS/cloud instance just for AI**

**Best For:** High traffic, performance-critical apps

**Pros:**
- ✅ Dedicated AI resources
- ✅ Backend not affected by AI load
- ✅ Can scale AI independently
- ✅ Can use GPU instances

**Cons:**
- ❌ Additional server cost (~$20-50/month)
- ❌ Network latency (minimal)

**Architecture:**
```
┌─────────────────┐      ┌─────────────────┐
│  Backend Server │◄────►│   AI Server     │
│  (Railway)      │      │  (VPS/GPU)      │
│                 │      │  Ollama:11434   │
└─────────────────┘      └─────────────────┘
```

**Setup:**

**Step 1: Create AI Server**
```bash
# Recommended: Hetzner Cloud, DigitalOcean, or AWS
# Minimum: 4 vCPU, 8GB RAM, 50GB SSD

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Configure Ollama to accept external connections
# Edit /etc/systemd/system/ollama.service
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"

# Reload and restart
systemctl daemon-reload
systemctl restart ollama

# Pull model
ollama pull llama3.2

# Open firewall port (if needed)
ufw allow 11434/tcp
```

**Step 2: Secure with Nginx (Recommended)**
```nginx
# /etc/nginx/sites-available/ollama
server {
    listen 80;
    server_name ai.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:11434;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Security: Only allow from your backend IP
        allow YOUR_BACKEND_IP;
        deny all;
    }
}
```

**Step 3: Backend Environment**
```env
# In Railway/Render dashboard
OLLAMA_HOST=http://ai.yourdomain.com  # or http://AI_SERVER_IP:11434
AI_PROVIDER_PRIORITY=local
```

---

### Option 3: GPU-Accelerated AI (BEST PERFORMANCE)
**Use cloud GPU instances for fastest responses**

**Best For:** Real-time AI, large-scale operations

**Pros:**
- ✅ 10-50x faster than CPU
- ✅ Can run larger, smarter models
- ✅ Professional-grade AI performance

**Cons:**
- ❌ Higher cost (~$0.50-2/hour when running)
- ❌ More complex setup

**GPU Providers:**
- RunPod.io - $0.34/hour RTX 3090
- Lambda Labs - $0.60/hour A10
- Vast.ai - $0.20/hour RTX 3090 (spot)
- Google Colab - Free tier available

**Setup with RunPod.io:**
```bash
# 1. Create RunPod account
# 2. Deploy "Ollama" template
# 3. Get endpoint URL: https://your-pod.runpod.net

# 4. Backend environment
OLLAMA_HOST=https://your-pod.runpod.net
AI_PROVIDER_PRIORITY=local
```

---

## 🔧 Production Configuration

### Environment Variables
```env
# AI Provider Priority
# "local" = Always use Ollama (fail if unavailable)
# "gemini" = Always use Gemini
# "hybrid" = Try Ollama first, fallback to Gemini (RECOMMENDED)
AI_PROVIDER_PRIORITY=hybrid

# Ollama Server URL
# Development: http://localhost:11434
# Production Same-Server: http://localhost:11434
# Production Remote: http://your-ai-server:11434
OLLAMA_HOST=http://localhost:11434

# Model Configuration
LOCAL_AI_MODEL=llama3.2  # or llama3.2:1b for faster responses

# Timeout Settings
AI_TIMEOUT_MS=30000      # 30 seconds max wait
AI_MAX_RETRIES=2         # Retry failed requests

# Gemini Fallback (required for hybrid mode)
GEMINI_API_KEY=your_key_here
```

### Health Check Endpoint
```javascript
// Add to your backend health check
app.get('/api/health', async (req, res) => {
  const aiStatus = await aiService.localAI.checkStatus();
  
  res.json({
    status: 'healthy',
    ai: {
      local: aiStatus.running ? 'connected' : 'disconnected',
      model: aiStatus.modelAvailable ? 'available' : 'unavailable',
      fallback: process.env.GEMINI_API_KEY ? 'ready' : 'not-configured'
    }
  });
});
```

---

## 📊 Production Monitoring

### 1. AI Service Health Monitoring
```javascript
// Check AI health every 5 minutes
setInterval(async () => {
  const status = await aiService.localAI.checkStatus();
  
  if (!status.running) {
    // Alert: Local AI down, using Gemini fallback
    console.error('[AI] Local AI disconnected - using Gemini fallback');
    
    // Send alert to monitoring service (Sentry, Datadog, etc.)
    alertService.notify('AI_FALLBACK', {
      message: 'Local AI unavailable, switched to Gemini',
      timestamp: new Date()
    });
  }
}, 300000);
```

### 2. Response Time Tracking
```javascript
// Track AI response times
async function generateWithMetrics(prompt, systemPrompt) {
  const start = Date.now();
  const result = await aiService.generateWithFallback(prompt, systemPrompt);
  const duration = Date.now() - start;
  
  // Log metrics
  console.log(`[AI] Response time: ${duration}ms | Source: ${result.local ? 'local' : 'gemini'}`);
  
  // Send to APM (New Relic, DataDog, etc.)
  metrics.histogram('ai.response_time', duration, {
    source: result.local ? 'local' : 'gemini',
    model: process.env.LOCAL_AI_MODEL
  });
  
  return result;
}
```

### 3. Error Rate Monitoring
```javascript
// Track AI errors
aiService.on('error', (error) => {
  metrics.increment('ai.errors', {
    type: error.type,
    source: error.source
  });
});
```

---

## 🛡️ Production Security

### 1. Network Security
```bash
# If using dedicated AI server, restrict access:

# UFW Firewall (Ubuntu)
ufw default deny incoming
ufw allow from YOUR_BACKEND_IP to any port 11434
ufw enable

# Or use cloud security groups:
# AWS Security Group: Allow port 11434 only from backend security group
```

### 2. Authentication (Optional)
```nginx
# Add basic auth to Ollama endpoint
location / {
    auth_basic "AI Service";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://localhost:11434;
}
```

### 3. Rate Limiting
```javascript
// Add rate limiting to AI routes
import rateLimit from 'express-rate-limit';

const aiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: 'AI service rate limit exceeded'
});

router.post('/chat', aiRateLimit, async (req, res) => {
  // ... handle request
});
```

---

## 💰 Cost Comparison

| Setup | Monthly Cost | Performance | Best For |
|-------|-------------|-------------|----------|
| **Gemini Only** | Free tier, then $20/month | Fast | Low traffic |
| **Same Server** | $0 (uses existing) | Medium | Small apps |
| **Dedicated VPS** | $20-50/month | Medium | Medium traffic |
| **GPU Server** | $50-200/month | Very Fast | High traffic |
| **Hybrid** | $20-50/month | Flexible | All scenarios |

---

## 🔄 Deployment Checklist

### Pre-Deployment
- [ ] Choose deployment option (1, 2, or 3)
- [ ] Set up Ollama server
- [ ] Pull required model
- [ ] Test Ollama API: `curl http://localhost:11434/api/tags`
- [ ] Configure firewall rules
- [ ] Set environment variables

### Backend Deployment
- [ ] Update `OLLAMA_HOST` to production URL
- [ ] Set `AI_PROVIDER_PRIORITY=hybrid`
- [ ] Verify Gemini API key as fallback
- [ ] Deploy backend
- [ ] Test AI endpoint: `POST /api/ai/status`

### Post-Deployment
- [ ] Verify AI health check responds
- [ ] Test chat functionality
- [ ] Test automation tasks
- [ ] Monitor response times
- [ ] Set up alerts for AI failures
- [ ] Document AI server access

---

## 🆘 Troubleshooting Production Issues

### "Connection refused" to Ollama
```bash
# Check Ollama is running
systemctl status ollama

# Check port is listening
netstat -tlnp | grep 11434

# Test locally
curl http://localhost:11434/api/tags

# Check firewall
ufw status
```

### Slow responses
- Check server CPU/RAM usage: `htop`
- Use smaller model: `llama3.2:1b`
- Enable GPU if available
- Consider dedicated AI server

### Model not found
```bash
# List available models
ollama list

# Pull required model
ollama pull llama3.2
```

### Gemini fallback not working
- Verify `GEMINI_API_KEY` is set
- Check API key has quota remaining
- Review fallback logic in logs

---

## 📈 Scaling Strategy

### Phase 1: Start Small (0-1000 users)
- Use **same-server deployment**
- Small model: `llama3.2:1b`
- Hybrid mode with Gemini fallback

### Phase 2: Growth (1000-10000 users)
- Move to **dedicated AI server**
- Larger model: `llama3.2`
- Add caching for common queries

### Phase 3: Scale (10000+ users)
- **GPU server** for AI
- Load balancer for multiple AI instances
- Query queuing system

---

## 🎓 Recommended Production Setup

**For most production deployments:**

1. **Use Option 2** (Dedicated AI Server)
2. **Hetzner Cloud** CPX31 (4 vCPU, 8GB RAM) - €12.40/month
3. **Model**: `llama3.2` for balanced performance
4. **Mode**: `hybrid` with Gemini fallback
5. **Monitoring**: Check health every 5 minutes
6. **Security**: Firewall restrict port 11434

**Estimated monthly cost:** €12.40 ($13.50) for unlimited AI requests

**vs Gemini Pro:** $20/month for limited requests

**Savings:** $6.50/month + unlimited usage!

---

## 📞 Support

**Ollama Issues:** https://github.com/ollama/ollama/issues  
**Model Selection:** https://ollama.com/library  
**GPU Hosting:** RunPod Discord, Vast.ai docs

---

**Your production AI is ready for unlimited scale! 🚀**
