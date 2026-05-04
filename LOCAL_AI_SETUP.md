# 🤖 Local AI Setup Guide - Unlimited Admin Assistant

## Overview
Replace Gemini AI with your own **unlimited, free** local AI using Ollama. No API limits, no monthly fees, complete privacy.

---

## Prerequisites

### Hardware Requirements
- **Minimum**: 8GB RAM (for smaller models)
- **Recommended**: 16GB+ RAM, SSD storage
- **Optional**: NVIDIA GPU with CUDA (for faster responses)

### Software
- Windows 10/11, macOS, or Linux
- Node.js 18+ (already installed)

---

## Installation Steps

### Step 1: Install Ollama

**Windows** (PowerShell as Admin):
```powershell
# Download and install from https://ollama.com/download/windows
# Or use winget:
winget install Ollama.Ollama
```

**macOS**:
```bash
brew install ollama
```

**Linux**:
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Step 2: Download AI Model

Open terminal and run:

```bash
# Pull llama3.2 (fast, good for general tasks, ~2GB)
ollama pull llama3.2

# Alternative models:
ollama pull mistral        # Better reasoning (~4GB)
ollama pull codellama      # Good for technical tasks (~4GB)
ollama pull llama3.2:1b    # Very fast, smaller (~1GB)
```

### Step 3: Start Ollama Server

```bash
# Start the server (keeps running)
ollama serve

# Or as background service:
# Windows: Ollama starts automatically after install
# Linux/macOS: ollama serve &
```

### Step 4: Enable Local AI in CustoMate

Edit `backend/.env`:

```env
# Change this to true to use Local AI
PREFER_LOCAL_AI=true

# Ollama runs on this port by default
OLLAMA_HOST=http://localhost:11434

# Model name (must match what you pulled)
LOCAL_AI_MODEL=llama3.2
```

### Step 5: Restart Backend

```bash
cd backend
node server.js
```

You should see: "✅ Local AI connected" or "⚠️ Local AI unavailable - using Gemini fallback"

---

## 🎯 Using the Admin AI Assistant

### Access in Admin Dashboard
1. Login as admin
2. Go to Admin Dashboard
3. Look for "AI Assistant" section
4. Start chatting or run automation tasks

### Available Automation Tasks

| Task | Description |
|------|-------------|
| `sales-analysis` | Analyzes recent sales, trends, top products |
| `inventory-alert` | Checks low stock, suggests reorders |
| `customer-insights` | Customer growth, retention metrics |
| `product-description` | Auto-generates SEO product descriptions |
| `customer-response` | Drafts professional customer replies |
| `marketing-email` | Creates marketing campaigns |
| `report-summary` | Summarizes reports for executives |

### Example Usage

```javascript
// Chat with AI
POST /api/ai/chat
{
  "message": "What are our top selling products this month?",
  "context": "sales"
}

// Run automation
POST /api/ai/automate/sales-analysis
{}

// Check AI status
GET /api/ai/status
```

---

## 📊 Performance Tips

### For Faster Responses:
1. **Use smaller models**: `llama3.2:1b` is much faster than full `llama3.2`
2. **Enable GPU**: If you have NVIDIA GPU, responses are 10x faster
3. **Keep Ollama running**: Don't stop the server between requests
4. **Use SSD**: Model loading is faster on SSD vs HDD

### Model Recommendations:

| Use Case | Model | RAM Needed | Speed |
|----------|-------|------------|-------|
| Quick tasks | llama3.2:1b | 2GB | ⚡ Very Fast |
| General admin | llama3.2 | 4GB | 🚀 Fast |
| Complex analysis | mistral | 6GB | 🏃 Medium |
| Technical code | codellama | 6GB | 🏃 Medium |

---

## 🔧 Troubleshooting

### "Local AI unavailable"
```bash
# Check if Ollama is running
ollama list

# If not running, start it
ollama serve
```

### "Model not found"
```bash
# Pull the model again
ollama pull llama3.2

# Verify it's installed
ollama list
```

### Slow responses
- Try a smaller model: `ollama pull llama3.2:1b`
- Check your CPU/RAM usage
- Close other applications

### Out of memory errors
- Use smaller models (1b parameter models)
- Close browser tabs
- Add more RAM or use swap space

---

## 🔐 Security & Privacy

✅ **Your data stays local** - Nothing leaves your server  
✅ **No API keys needed** - Completely self-hosted  
✅ **Works offline** - No internet required after setup  
✅ **HIPAA/GDPR friendly** - Data never sent to third parties  

---

## 📈 Comparison: Local AI vs Gemini

| Feature | Local AI | Gemini |
|---------|----------|--------|
| **Cost** | Free | Paid after free tier |
| **Rate Limits** | None | 60 requests/min |
| **Privacy** | ✅ 100% private | ❌ Cloud processing |
| **Offline** | ✅ Works offline | ❌ Needs internet |
| **Speed** | Depends on hardware | Fast |
| **Setup** | Requires install | Instant |
| **Maintenance** | Self-hosted | Managed |

---

## Next Steps

1. ✅ Install Ollama
2. ✅ Pull llama3.2 model
3. ✅ Set `PREFER_LOCAL_AI=true` in .env
4. ✅ Restart backend
5. ✅ Test AI Assistant in admin dashboard

---

## 🆘 Need Help?

**Ollama Docs**: https://github.com/ollama/ollama  
**Models List**: https://ollama.com/library  
**Community**: https://discord.gg/ollama

---

**Enjoy your unlimited, private AI assistant! 🎉**
