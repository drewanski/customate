# Deploying CustoMate

A practical, end-to-end deploy guide. Covers the **one** path we recommend
(Render for backend, Vercel for frontend, MongoDB Atlas for DB) plus the
gotchas you'll otherwise discover the hard way.

> If you've been looking at `DEPLOYMENT.md`, `DEPLOYMENT_GUIDE.md`, or
> `PRODUCTION_AI_DEPLOYMENT.md` — those are older. This file is the
> source of truth.

---

## 1. Architecture at a glance

```
┌──────────────┐     HTTPS      ┌───────────────────┐
│   Vercel     │ ◄────────────► │   Render / Fly    │
│  (frontend)  │  /api/* JSON   │   (backend API)   │
└──────────────┘                └─────────┬─────────┘
                                          │
                                  ┌───────▼────────┐
                                  │ MongoDB Atlas  │
                                  │  (primary DB)  │
                                  └────────────────┘

External services:
  · Cloudinary    — design preview hosting
  · PayMongo      — GCash / Maya / cards
  · Gmail SMTP    — OTP + transactional email
  · Semaphore     — PH SMS (optional)
  · Gemini        — AI design assistant (optional)
```

---

## 2. Prerequisites

| Service | Purpose | Cost (start tier) |
|---|---|---|
| **MongoDB Atlas** | Database | Free (M0) |
| **Render** *(or Fly.io / Railway)* | Backend host | Free / $7/mo |
| **Vercel** | Frontend host | Free |
| **Cloudinary** | Image CDN | Free (25 GB/mo) |
| **PayMongo** | Payments | Per-transaction |
| **Gmail App Password** | SMTP | Free (2-Step Verification required) |

You'll need a domain too (optional but recommended): set DNS later.

---

## 3. Environment variables

Production values for **backend** (`backend/.env` on Render):

```env
NODE_ENV=production
PORT=4000

# Required
MONGO_URI=mongodb+srv://<user>:<pass>@<cluster>/CustoMate?retryWrites=true&w=majority
JWT_SECRET=<generate 32+ random chars — do NOT reuse the dev value>

# Required in production (the server refuses to start without these)
FRONTEND_URL=https://customate.example.com
SMTP_USER=<gmail address>
SMTP_PASS=<16-char Gmail App Password, no spaces>
SMTP_FROM=CustoMate <noreply@customate.example.com>

# Strongly recommended
CLOUDINARY_CLOUD_NAME=<from cloudinary.com dashboard>
CLOUDINARY_API_KEY=<from cloudinary.com dashboard>
CLOUDINARY_API_SECRET=<from cloudinary.com dashboard>

PAYMONGO_PUBLIC_KEY=pk_live_xxx
PAYMONGO_SECRET_KEY=sk_live_xxx
PAYMONGO_WEBHOOK_SECRET=whsec_xxx

# Optional
SEMAPHORE_API_KEY=<sms gateway>
GEMINI_API_KEY=<google ai studio>
GOOGLE_CLIENT_ID=<google oauth>
AI_PROVIDER_PRIORITY=hybrid
```

**Generate a strong JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The server runs `validateEnv()` at boot — if any required var is missing
or matches a known placeholder (`your_cloud_name`, `supersecretkey`, etc),
it prints exactly what's wrong and exits with code 1. Use this signal.

For **frontend** (Vercel env vars):

```env
VITE_API_URL=https://api.customate.example.com
VITE_PAYMONGO_PUBLIC_KEY=pk_live_xxx
VITE_GOOGLE_CLIENT_ID=<google oauth>
```

---

## 4. MongoDB Atlas

1. Create a free M0 cluster
2. **Database Access** → add user with `readWrite` on `CustoMate`
3. **Network Access** → add `0.0.0.0/0` (Render egress IPs are dynamic). Lock
   this down later if you move to Render's static-egress tier.
4. Copy the `mongodb+srv://...` URI into `MONGO_URI`

---

## 5. Cloudinary

1. Sign up at cloudinary.com (free tier is enough for low five-figure orders)
2. Dashboard → copy **Cloud Name / API Key / API Secret** into the three env vars
3. (Optional) Create a folder `designs/orders` — the backend creates it on
   first upload anyway

The backend auto-detects placeholder values; if you forget to set these,
design previews fall back to base64 in MongoDB. Functional but not scalable.

---

## 6. Backend — Render

1. Connect your GitHub repo
2. **New → Web Service**
3. Build command: `cd backend && npm install`
4. Start command: `cd backend && node server.js`
5. Add all backend env vars from §3
6. Deploy

**Auto-scaling**: Render's free tier sleeps after 15 min idle. Upgrade to the
$7/mo starter to keep the API hot. Otherwise the first request after sleep
takes ~30 seconds.

**Health check**: configure Render to probe `/healthz` — it returns 503 if
MongoDB is disconnected so Render can route around bad instances.

---

## 7. Frontend — Vercel

1. Import GitHub repo
2. Build command: `npm run build`
3. Output directory: `dist`
4. Add `VITE_*` env vars from §3
5. Deploy

`vercel.json` already in the repo handles SPA routing.

---

## 8. PayMongo webhook setup

PayMongo posts payment events to your backend. **In dev, localhost can't
receive these** — there's a fallback `/api/paymongo/verify/:orderId` endpoint
that pulls live status from PayMongo, but it only fires when the customer
lands on the success page. Production needs the real webhook.

**Production**:

1. PayMongo Dashboard → **Webhooks** → **Add**
2. URL: `https://api.customate.example.com/api/paymongo/webhook`
3. Events: `source.chargeable`, `payment.paid`, `payment.failed`
4. Copy the signing secret → `PAYMONGO_WEBHOOK_SECRET`

**Dev**: use ngrok to expose your local server:

```bash
ngrok http 4000
# Set the resulting https URL + /api/paymongo/webhook in PayMongo dashboard
# (test mode webhook). Change it back before going to prod.
```

---

## 9. Gmail OTP

OTP delivery is via Gmail SMTP. Gmail requires 2-Step Verification + an App
Password (NOT your normal account password):

1. https://myaccount.google.com/security → enable 2-Step Verification
2. https://myaccount.google.com/apppasswords → generate one named "CustoMate"
3. Copy the 16 chars **without spaces** into `SMTP_PASS`

For higher volumes (>500/day), switch to a transactional provider (Resend,
SendGrid, AWS SES). The transporter setup is in
`backend/routes/auth.js` `/otp/send` and `backend/services/customerMail.js`.

---

## 10. Post-deploy checklist

- [ ] `GET /healthz` returns `status: ok` with all features green
- [ ] Place a test order with COD → arrives in admin queue
- [ ] Place a test order with GCash → verify webhook fired (check
      `/api/orders/<id>` shows `paymentStatus: paid`)
- [ ] Apply a test coupon → discount lands on the order
- [ ] Submit a review → appears in `/admin/reviews` as pending
- [ ] Run a manual abandoned-cart sweep: `POST /api/abandoned-carts/admin/sweep`
- [ ] Check Cloudinary dashboard shows a design preview upload
- [ ] Trigger an OTP email → arrives in inbox (not spam)
- [ ] Force-load the admin calendar → renders within 1 second

---

## 11. Operational notes

**Logs**: Render → service → Logs tab. Look for `[abandoned-cart-sweep]`
hourly. Validation failures at boot print `❌ Environment validation failed`.

**Backups**: Atlas free tier has 7-day point-in-time recovery. For paid
tiers, configure scheduled snapshots.

**Scaling triggers**:
- API latency >300ms p95 → upsize Render instance
- MongoDB IOPS warnings → upgrade Atlas tier
- Cloudinary >20 GB → either prune old orders or upgrade

**Cost ceilings** (rough, ~1000 orders/month):
- MongoDB Atlas: $0 (M0) → $9 (M10) at scale
- Render: $7 (starter) → $25 (standard)
- Cloudinary: $0 → $89 (plus plan) at 100 GB
- PayMongo: 2.5% + ₱15/txn on GCash; 3.5% on cards

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Server exits at boot with "MISSING JWT_SECRET" | `.env` not loaded or missing | Check the `.env` is committed/uploaded to Render |
| `403 CORS` from frontend | `FRONTEND_URL` mismatch | Confirm exact URL incl. https:// in env var |
| OTP email never arrives | Gmail App Password wrong | Regenerate; ensure 2FA is on; check spam |
| Order stuck `awaiting_payment` after PayMongo | Webhook not reaching backend | Verify PayMongo webhook URL + signing secret; or call `/api/paymongo/verify/:id` |
| Design preview is a tiny base64 string | Cloudinary not configured | Set the three CLOUDINARY_* env vars |
| `429 Too many requests` in normal use | Behind a shared NAT IP | Increase `globalLimiter` max or add `app.set('trust proxy', N)` |
