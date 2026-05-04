# 🚀 CustoMate Deployment Guide

## Overview
This guide will help you deploy CustoMate to production using:
- **Frontend**: Vercel (free, fast, easy)
- **Backend**: Railway/Render/Heroku (free tier available)
- **Database**: MongoDB Atlas (already configured)
- **File Storage**: Cloudinary (free tier)

---

## Phase 1: Pre-Deployment Setup (30 minutes)

### Step 1: Get Required API Keys

You already have most of these - just verify they're using **production/live keys**:

#### ✅ MongoDB Atlas (Already Done)
- ✅ Database is live at: `cluster0.uwgkgpl.mongodb.net`
- ✅ No changes needed

#### ✅ PayMongo (Switch to Live Mode)
1. Go to https://dashboard.paymongo.com/
2. Complete business verification
3. Switch from "Test Mode" to "Live Mode"
4. Get your **Live API Keys**:
   - Live Public Key: `pk_live_...`
   - Live Secret Key: `sk_live_...`
5. Update `.env` with live keys

#### ✅ Semaphore (Already Done)
- ✅ API Key: `9c01c61c402514ae2bc57935562501c1`
- ✅ Apply for sender name "CustoMate" (wait for approval)

#### 🆕 Cloudinary (Required for Image Uploads)
1. Sign up at https://cloudinary.com/ (free tier)
2. Go to Dashboard → Get your credentials:
   - Cloud Name: `your_cloud_name`
   - API Key: `your_api_key`
   - API Secret: `your_api_secret`
3. Update `.env` file

#### 🆕 Google OAuth (Already Done)
- ✅ Current key works for production
- ✅ Domain: Add your deployed domain to authorized origins later

---

### Step 2: Prepare Environment Variables

Create production `.env` file for backend:

```env
# Backend Port (Render/Railway will override this)
PORT=4000

# MongoDB Atlas (Production - Same as dev)
MONGO_URI=mongodb+srv://jusepprincipe_db_user:f4qQ5lJAOgsOCALN@cluster0.uwgkgpl.mongodb.net/CustoMate?retryWrites=true&w=majority

# JWT Secret (Change for production!)
JWT_SECRET=your_super_secret_production_key_change_this

# Google OAuth (Same as dev)
GOOGLE_CLIENT_ID=458001122120-l668j5ulj18pqmu426t6v0pcno0ru73j.apps.googleusercontent.com

# SMTP (Production Email)
SMTP_USER=jusepprincipe@gmail.com
SMTP_PASS=fpblevqychastabb
SMTP_FROM="CustoMate <jusepprincipe@gmail.com>"

# Gemini AI (Same as dev)
GEMINI_API_KEY=AIzaSyDiCwgggQKnVoYrpdPs9bjO5QgthVkcpsM

# Semaphore SMS (Same as dev)
SEMAPHORE_API_KEY=9c01c61c402514ae2bc57935562501c1
SEMAPHORE_SENDER_NAME=CustoMate

# PayMongo (LIVE KEYS - Update these!)
PAYMONGO_PUBLIC_KEY=pk_live_your_live_public_key
PAYMONGO_SECRET_KEY=sk_live_your_live_secret_key
PAYMONGO_WEBHOOK_SECRET=whsec_your_webhook_secret

# Frontend URL (Will be your Vercel URL)
FRONTEND_URL=https://your-app-name.vercel.app

# Cloudinary (Required!)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

## Phase 2: Deploy Backend (20 minutes)

### Option A: Deploy to Railway (Recommended - Free Tier)

Railway offers $5/month free credit (enough for small app).

#### Step 1: Sign Up
1. Go to https://railway.app/
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"

#### Step 2: Connect Repository
1. Select your CustoMate repository
2. Railway auto-detects Node.js
3. Set Root Directory: `backend` (if monorepo)

#### Step 3: Add Environment Variables
In Railway Dashboard → Variables:
```
PORT=4000
MONGO_URI=mongodb+srv://...
JWT_SECRET=your_secret
... (add all from .env)
```

#### Step 4: Deploy
1. Click "Deploy"
2. Railway gives you URL: `https://custmate-api.up.railway.app`
3. **Save this URL** - you'll need it for frontend

---

### Option B: Deploy to Render (Free Tier)

Render has a generous free tier but sleeps after 15 min inactivity.

#### Step 1: Sign Up
1. Go to https://render.com/
2. Sign up with GitHub

#### Step 2: Create Web Service
1. Click "New" → "Web Service"
2. Connect GitHub repo
3. Configure:
   - **Name**: custmate-api
   - **Runtime**: Node
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start` (or `node server.js`)
   - **Plan**: Free

#### Step 3: Add Environment Variables
Click "Environment" tab, add all variables from `.env`

#### Step 4: Deploy
1. Click "Create Web Service"
2. URL: `https://custmate-api.onrender.com`

---

## Phase 3: Deploy Frontend (15 minutes)

### Deploy to Vercel (Best for React - Free)

#### Step 1: Prepare Frontend

Update frontend API base URL:

**File: `src/app/api.ts`**
```typescript
// Change from:
const API_BASE = 'http://localhost:4000/api';

// To your deployed backend:
const API_BASE = 'https://your-backend-url.com/api';
```

Or better - use environment variable:

**Create `.env.production` in frontend root:**
```
VITE_API_BASE_URL=https://your-backend-url.com/api
```

#### Step 2: Deploy to Vercel

1. Go to https://vercel.com/
2. Sign up with GitHub
3. Click "Add New Project"
4. Import your GitHub repo
5. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (or `frontend` if separate)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Click "Deploy"

7. **Get your URL**: `https://custmate.vercel.app`

#### Step 3: Update CORS

In your **backend** `.env`, update:
```env
FRONTEND_URL=https://custmate.vercel.app
```

Redeploy backend if needed.

---

## Phase 4: Post-Deployment Configuration (20 minutes)

### Step 1: Update Google OAuth Authorized Origins

1. Go to https://console.cloud.google.com/
2. APIs & Services → Credentials
3. Edit your OAuth 2.0 Client ID
4. Add to "Authorized JavaScript origins":
   - `https://custmate.vercel.app`
5. Add to "Authorized redirect URIs":
   - `https://custmate.vercel.app/auth/callback`

### Step 2: Update PayMongo Webhooks

1. Go to https://dashboard.paymongo.com/
2. Webhooks → Add Endpoint
3. URL: `https://your-backend-url.com/api/paymongo/webhook`
4. Events: `payment.paid`, `payment.failed`, `source.chargeable`

### Step 3: Configure Cloudinary

1. Go to https://cloudinary.com/console
2. Settings → Upload
3. Add upload preset for unsigned uploads (for client-side)
4. Note down the preset name for frontend config

---

## Phase 5: Testing (30 minutes)

### Test These Features:

```bash
✅ User Registration (Email OTP)
✅ User Registration (Phone OTP - if sender name approved)
✅ Google Sign-In
✅ Product Browsing
✅ Customization Studio (3D view)
✅ Add to Cart
✅ Checkout with GCash/Maya (use PayMongo test mode first!)
✅ Admin Dashboard
✅ Order Management
✅ Inventory Management
✅ Notifications
```

### Test Payment Flow:

1. **Use PayMongo Test Mode First:**
   - Test GCash: Use `09171234567`
   - Test Maya: Use `09171234567`
   - Confirm payments work

2. **Switch to Live Mode:**
   - Update PayMongo keys to live
   - Test with real GCash/Maya (small amount first)

---

## Phase 6: Domain & SSL (Optional - 15 minutes)

### Custom Domain (Optional)

#### Vercel Custom Domain:
1. Buy domain from Namecheap/GoDaddy
2. Vercel Dashboard → Domains → Add
3. Follow DNS instructions

#### Railway Custom Domain:
1. Railway Dashboard → Settings → Domains
2. Add custom domain
3. Configure DNS

---

## Quick Reference: Deployment Checklist

```
☐ Backend deployed (Railway/Render)
☐ Frontend deployed (Vercel)
☐ Environment variables set
☐ MongoDB Atlas accessible
☐ Cloudinary configured
☐ PayMongo webhooks set
☐ Google OAuth origins updated
☐ CORS configured
☐ Test user registration
☐ Test payments (test mode)
☐ Test payments (live mode - small amount)
☐ SSL/HTTPS working
☐ Custom domain (optional)
```

---

## Troubleshooting

### Backend won't start:
```bash
# Check logs in Railway/Render dashboard
# Verify all env variables are set
# Ensure MongoDB IP whitelist includes 0.0.0.0/0
```

### Frontend can't connect to backend:
```bash
# Check CORS settings in backend
# Verify FRONTEND_URL env var matches actual URL
# Check browser console for CORS errors
```

### Payments not working:
```bash
# Verify PayMongo keys (test vs live)
# Check webhook URL is correct
# Review PayMongo dashboard for failed payments
```

---

## Cost Estimate (Monthly)

| Service | Free Tier | Paid (If Needed) |
|---------|-----------|------------------|
| Vercel (Frontend) | $0 | $0 (generous free tier) |
| Railway (Backend) | $5 credit | ~$5-10 |
| MongoDB Atlas | $0 (M0 tier) | $0 (512MB free) |
| Cloudinary | $0 (25GB) | $0 for small apps |
| PayMongo | Transaction fees only | 2.5% per transaction |
| Semaphore | Per SMS cost | ~₱0.50-1.00 per SMS |
| **Total** | **~$0-5/month** | **~$10-20/month** |

---

## Need Help?

1. **Check Deployment Logs**: Railway/Render/Vercel dashboards
2. **Test API**: Use Postman to test backend endpoints
3. **Check MongoDB**: Verify connection in Atlas dashboard
4. **Review .env**: Ensure all variables are correct

---

**Estimated Total Deployment Time: 1-2 hours**

**Good luck with your deployment! 🎉**
