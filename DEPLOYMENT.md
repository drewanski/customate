# CustoMate — Deployment Guide

End-to-end checklist to take this app from local dev to production.
Estimated time end-to-end: **3–5 hours** the first time.

---

## 🚨 BEFORE YOU DEPLOY — fix these critical issues

### 1. Stop tracking `backend/.env` and rotate secrets

The previous `.gitignore` didn't include `.env`, so `backend/.env` has been committed and is visible to anyone with repo access (including past contributors and forks).

```bash
git rm --cached backend/.env
git commit -m "Untrack .env file"
```

Then **rotate every secret** in the file:

| Secret | Where to rotate |
| --- | --- |
| `MONGO_URI` | MongoDB Atlas → Database Access → reset password |
| `JWT_SECRET` | Generate new: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `PAYMONGO_*` | https://dashboard.paymongo.com |
| `GOOGLE_CLIENT_SECRET` | https://console.cloud.google.com |
| `CLOUDINARY_*` | https://cloudinary.com/console |
| `SMTP_PASS` | Re-create the Gmail App Password |
| `SEMAPHORE_API_KEY` | https://semaphore.co |

After rotating, store the new values in your hosting provider's env var UI (NOT in the repo).

### 2. Scan git history for accidentally committed secrets

```bash
# Install once
npm install -g trufflehog

# Or use the python version, or gitleaks
gitleaks detect --source . --no-banner
```

If you find secrets in history, you'll need to rewrite history with `git filter-repo` or accept the risk and rely on key rotation.

---

## ✅ Pre-deploy checklist

- [ ] All `.env*` files are untracked (`git status` should not show them)
- [ ] `.env.example` and `backend/.env.production.example` are up to date
- [ ] All API keys/secrets have been rotated (see above)
- [ ] `npm run build` succeeds locally with no errors
- [ ] You've tested the app once in `production` mode locally:
  ```bash
  npm run build && npm run preview
  ```
- [ ] MongoDB Atlas has IP allowlist set to `0.0.0.0/0` (or your Render egress IPs)
- [ ] You've decided on domains (e.g. `customate.app` and `api.customate.app`)

---

## 🎯 Recommended stack

| Layer | Service | Cost | Why |
| --- | --- | --- | --- |
| Frontend hosting | **Vercel** | Free (Hobby) → $20/mo (Pro) | Best DX for Vite/React; edge CDN; instant rollbacks |
| Backend hosting | **Render** | $7/mo (Starter) → $25/mo (Standard) | Cheap, simple, has Singapore region close to PH |
| Database | **MongoDB Atlas** | Free (M0 / 512MB) → $9/mo (M2) | Already in use; free tier is enough to launch |
| Domain | **Cloudflare** or **Namecheap** | ~$15/yr | Cloudflare for free DNS + DDoS protection |
| SSL | (included in Vercel + Render) | Free | Automatic certificate management |
| Image CDN | **Cloudinary** | Free → $89/mo | For user-uploaded design images |
| Error tracking | **Sentry** | Free (5K errors/mo) | Catch production errors fast |
| Analytics | **Plausible** or GA4 | $9/mo or free | Privacy-friendly |

**Total minimum**: ~$22/mo + $15/yr domain.

---

## 🚀 Deploy frontend → Vercel

1. **Push your code to GitHub** (private repo is fine)

2. **Create a Vercel project**:
   - Sign in at https://vercel.com
   - "Add New" → "Project" → import the GitHub repo
   - Framework preset: **Vite** (auto-detected)
   - Root directory: leave as default (the frontend lives at the repo root)
   - Build command: `npm run build` (auto-detected)
   - Output directory: `dist` (auto-detected)

3. **Set environment variables** (Project Settings → Environment Variables):
   ```
   VITE_API_BASE_URL=https://api.customate.app/api
   VITE_SENTRY_DSN=<your sentry frontend DSN>
   VITE_GOOGLE_CLIENT_ID=<your google client ID>
   ```

4. **Deploy**: click "Deploy". First build takes ~2 min.

5. **Custom domain**: Project Settings → Domains → add `customate.app`. Vercel gives you DNS records to add at your registrar.

The `vercel.json` in the repo root configures:
- SPA routing (everything → `index.html`)
- Long-term caching for assets and 3D models
- Security headers (X-Frame-Options, X-Content-Type-Options, etc.)

---

## 🚀 Deploy backend → Render

The `backend/render.yaml` is a Blueprint — Render reads it and creates the service automatically.

1. **Push the repo** with `backend/render.yaml` in it

2. **Render dashboard** → "New" → "Blueprint" → select your repo

3. **Fill in secret env vars** when Render prompts (all the `sync: false` keys in render.yaml)

4. **Wait ~3 min** for the first build

5. **Custom domain**: in the service → "Settings" → "Custom Domains" → add `api.customate.app`

6. **Update CORS**: in Render dashboard, set `FRONTEND_URL=https://customate.app`

7. **Update Vercel**: set `VITE_API_BASE_URL=https://api.customate.app/api` and redeploy

The Render service has:
- Auto-deploy on push to main (`autoDeploy: true`)
- Health check at `/healthz` — Render restarts the service if this fails
- Singapore region (closest to PH)

---

## 🚀 MongoDB Atlas

You're already using Atlas. For production:

1. **Network Access** → add the Render egress IPs (or temporarily `0.0.0.0/0`, but lock down later)
2. **Database Access** → create a production-only user with `readWrite` on your DB only
3. **Backups** → enable Continuous Backup on M10+ tier ($57/mo) OR just rely on snapshots on free tier
4. **Connection string** → copy it into Render's `MONGO_URI` env var (use the new production user, NOT your dev user)

---

## 🚀 GLB / 3D asset optimization

Your `/public/models/` folder probably has ~30–50MB of GLB + texture files. That's slow on mobile. Optimize them:

```bash
# Install gltfpack globally
npm install -g gltfpack

# Compress every GLB (Draco mesh compression + KTX2 texture compression)
cd public/models
for f in *.glb; do gltfpack -i "$f" -o "compressed-$f" -cc -tc; done

# Check sizes — should be 70–90% smaller
ls -lh
```

Replace the originals once you confirm they still render correctly.

For the gltf files (Universal Base Characters folder), gltfpack handles those too:

```bash
gltfpack -i "Superhero_Male_FullBody.gltf" -o "Superhero_Male_FullBody.glb" -cc -tc
```

This will also convert to .glb format (single file). Update the import path in `ProductCustomizer3D.tsx` accordingly.

---

## 🚀 Sentry (error tracking)

1. Sign up at https://sentry.io — free tier: 5K errors/mo
2. Create two projects: `customate-frontend` (React) and `customate-backend` (Node.js)
3. Frontend setup:
   ```bash
   npm install @sentry/react
   ```
   Add to `src/main.tsx`:
   ```ts
   import * as Sentry from '@sentry/react';
   if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
     Sentry.init({
       dsn: import.meta.env.VITE_SENTRY_DSN,
       tracesSampleRate: 0.1,
     });
   }
   ```
   Wire the existing `<ErrorBoundary>` to report:
   ```tsx
   <ErrorBoundary onError={(err) => Sentry.captureException(err)}>
   ```
4. Backend setup:
   ```bash
   npm install @sentry/node --prefix backend
   ```
   At the top of `server.js`:
   ```js
   import * as Sentry from '@sentry/node';
   if (process.env.SENTRY_DSN) {
     Sentry.init({ dsn: process.env.SENTRY_DSN });
   }
   ```

---

## 🚀 Custom domain + SSL

1. **Buy domain** at Namecheap / Cloudflare / Google Domains
2. **Add Vercel DNS** records (Vercel shows them in the Domains tab)
3. **Add Render custom domain** for `api.subdomain` (Render shows DNS instructions)
4. **SSL is automatic** on both platforms

---

## ✅ Post-launch checklist

- [ ] All env vars set in Vercel + Render
- [ ] `https://customate.app` loads
- [ ] `https://api.customate.app/healthz` returns 200
- [ ] Login + signup work end-to-end
- [ ] You can browse products, customize one, add to cart
- [ ] 3D customizer loads (try the t-shirt and jersey)
- [ ] Try-On mode shows the human model
- [ ] On a slow mobile device: page is responsive, sheet UI works
- [ ] Sentry shows test errors when you trigger them
- [ ] CORS headers correct: `curl -I https://api.customate.app/healthz`
- [ ] Rate limits work: hit `/api/auth/login` 11 times → 11th returns 429
- [ ] Privacy/Terms pages are linked from footer
- [ ] Google Analytics or Plausible is tracking pageviews

---

## 🆘 Common gotchas

**"CORS error" after deploy** — `FRONTEND_URL` on Render isn't set, or doesn't match Vercel's domain exactly (no trailing slash, exact protocol).

**"MongoDB connection error"** — IP allowlist on Atlas doesn't include Render's egress IP.

**Build fails on Vercel** — local node version mismatch. Set "Node.js Version" to 20.x in Vercel project settings.

**3D models won't load on production** — public folder pathing. After Vite build, GLBs should be at `/models/...` (not `/public/models/...`).

**Stripe/PayMongo webhook signature fails** — `PAYMONGO_WEBHOOK_SECRET` doesn't match what's configured in the PayMongo dashboard.

---

That's everything. Most steps are 5–10 min each; the slowest is the first DNS propagation (~30 min) and PayMongo verification if you're new to them.
