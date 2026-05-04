# ✅ Production Deployment Checklist

## Pre-Deployment Setup

### 1. AI Server Setup (Choose One)

#### Option A: Same Server (Small Scale)
```bash
# On your Railway/Render/VPS server
sudo curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl start ollama
sudo systemctl enable ollama
ollama pull llama3.2
```

#### Option B: Dedicated AI Server (Recommended)
- [ ] Create VPS (Hetzner CPX31: 4vCPU/8GB - €12/mo)
- [ ] Install Ollama
- [ ] Pull llama3.2 model
- [ ] Configure firewall (port 11434)
- [ ] Test: `curl http://AI_SERVER_IP:11434/api/tags`

#### Option C: GPU Cloud (High Performance)
- [ ] Create RunPod account
- [ ] Deploy Ollama template
- [ ] Get endpoint URL
- [ ] Test connection

### 2. Backend Configuration

Update these in Railway/Render dashboard:
```env
# AI Settings
OLLAMA_HOST=http://your-ai-server:11434  # or localhost for same-server
AI_PROVIDER_PRIORITY=hybrid
LOCAL_AI_MODEL=llama3.2
GEMINI_API_KEY=your_fallback_key

# Production URLs
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production

# Live PayMongo Keys
PAYMONGO_PUBLIC_KEY=pk_live_...
PAYMONGO_SECRET_KEY=sk_live_...
PAYMONGO_WEBHOOK_SECRET=whsec_...
```

### 3. Frontend Configuration

Update `.env.production`:
```env
VITE_API_BASE_URL=https://api.yourdomain.com/api
VITE_GOOGLE_CLIENT_ID=your_google_id
VITE_PAYMONGO_PUBLIC_KEY=pk_live_...
```

## Deployment Steps

### Backend Deployment
- [ ] Deploy backend to Railway/Render
- [ ] Verify environment variables loaded
- [ ] Check AI status: GET /api/ai/status
- [ ] Test AI chat: POST /api/ai/chat

### Frontend Deployment
- [ ] Build: `npm run build`
- [ ] Deploy to Vercel
- [ ] Configure custom domain
- [ ] Verify API connection

### PayMongo Webhooks
- [ ] Configure webhook URL: `https://api.yourdomain.com/api/paymongo/webhook`
- [ ] Add webhook secret to env
- [ ] Test payment flow

### AI Testing
- [ ] Check AI status returns healthy
- [ ] Test chat with local AI
- [ ] Verify Gemini fallback works
- [ ] Test automation tasks

## Post-Deployment Verification

### Critical Checks
- [ ] User registration/login works
- [ ] Product catalog loads
- [ ] Checkout with GCash works
- [ ] Admin dashboard accessible
- [ ] AI assistant responds
- [ ] Orders appear in admin

### AI-Specific Checks
```bash
# 1. Check AI status
curl https://api.yourdomain.com/api/ai/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Test chat
curl -X POST https://api.yourdomain.com/api/ai/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are today\'s sales?"}'

# 3. Check automation
curl -X POST https://api.yourdomain.com/api/ai/automate/sales-analysis \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Monitoring Setup

### Health Checks
- [ ] Set up /api/health monitoring
- [ ] Configure AI status alerts
- [ ] Monitor response times

### Alerts For
- AI server down (fallback to Gemini)
- High error rates
- Slow response times (>30s)
- Payment failures

## Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Backend (Railway) | $5-20 |
| Frontend (Vercel) | $0 |
| Database (MongoDB Atlas) | $0-15 |
| AI Server (Hetzner) | €12 (~$13) |
| **Total** | **~$18-48** |

vs. Gemini Pro: $20/month with limits

**You save money AND get unlimited AI! 💰**

## Troubleshooting

### AI Not Responding
```bash
# 1. Check Ollama on AI server
sudo systemctl status ollama

# 2. Test Ollama API
curl http://localhost:11434/api/tags

# 3. Check backend logs
railway logs

# 4. Verify env variable
echo $OLLAMA_HOST
```

### Fallback Issues
- If local AI fails, check `GEMINI_API_KEY` is set
- Verify AI_PROVIDER_PRIORITY isn't set to "local" only

## 🎉 Success!

Your production deployment should now:
- ✅ Serve customers worldwide
- ✅ Process payments via PayMongo
- ✅ Provide unlimited AI assistance
- ✅ Scale as your business grows

**Questions?** Check PRODUCTION_AI_DEPLOYMENT.md for detailed guides.
