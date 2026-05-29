import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: 'backend/.env' });

// Validate environment BEFORE we import routes — fail fast on misconfiguration
// instead of discovering a missing PayMongo key the first time a customer
// tries to check out. Process exits with non-zero on missing required vars.
import { validateEnv } from './config/envValidation.js';
validateEnv();

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import inventoryRoutes from './routes/inventory.js';
import supplierRoutes from './routes/suppliers.js';
import stockMovementRoutes from './routes/stockMovements.js';
import couponRoutes from './routes/coupons.js';
import reviewRoutes from './routes/reviews.js';
import abandonedCartRoutes from './routes/abandonedCarts.js';
import { sweepAbandonedCarts } from './services/abandonedCart.js';
import paymentRoutes from './routes/payments.js';
import paymongoRoutes from './routes/paymongo.js';
import uploadRoutes from './routes/upload.js';
import chatbotRoutes from './routes/chatbot.js';
import analyticsRoutes from './routes/analytics.js';
import adminAIRoutes from './routes/adminAI.js';
import aiRoutes from './routes/ai.js';
import aiDesignRoutes from './routes/aiDesign.js';
import adminInsightsRoutes from './routes/adminInsights.js';
import notificationRoutes from './routes/notifications.js';
import designRoutes from './routes/designs.js';
import productionRoutes from './routes/production.js';
import productionPublicRoutes from './routes/productionPublic.js';
import systemConfigRoutes from './routes/systemConfig.js';
import NotificationService from './services/notificationService.js';
import { expireStaleReservations } from './services/inventory.js';

// ─── Startup env validation ───────────────────────────────────────────────
// Fail fast on misconfigured deployments rather than crashing at runtime
// when the first request hits a broken code path.
(function validateEnv() {
  const required = ['MONGO_URI', 'JWT_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.error(`❌ Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  // Reject obviously weak JWT secrets in production.
  if (process.env.NODE_ENV === 'production') {
    if ((process.env.JWT_SECRET || '').length < 32) {
      console.error('❌ JWT_SECRET must be at least 32 characters in production.');
      process.exit(1);
    }
    if (!process.env.FRONTEND_URL) {
      console.error('❌ FRONTEND_URL must be set in production (used for CORS + redirects).');
      process.exit(1);
    }
  }
})();

const app = express();
const httpServer = createServer(app);

// Trust the first proxy hop in production (Vercel/Render/Cloudflare/etc.) so
// req.ip and rate-limit see the real client IP from X-Forwarded-For instead
// of the load balancer. WITHOUT this, rate limits become global.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Socket.io CORS — mirrors the HTTP CORS policy. In production this should
// match your frontend domain via FRONTEND_URL.
const socketAllowedOrigins =
  process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL].filter(Boolean)
    : [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3000'].filter(Boolean);

const io = new Server(httpServer, {
  cors: {
    origin: socketAllowedOrigins.length ? socketAllowedOrigins : false,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// ─── Security middleware ──────────────────────────────────────────────────
// Helmet: sets sensible security headers (X-Content-Type-Options, XSS, etc).
// crossOriginResourcePolicy is relaxed so static/3D assets can be served to
// the frontend on a different origin (Vercel → this API).
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // API-only server — CSP belongs on the frontend
}));

// Compression: gzip JSON responses, reduces bandwidth ~70% on JSON-heavy routes
app.use(compression());

// CORS — strict in production, permissive in development.
// FRONTEND_URL should be set to your deployed frontend domain (e.g. https://customate.app).
const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = [
  process.env.FRONTEND_URL,
  // Dev origins are only allowed when NODE_ENV !== 'production'
  ...(isProd ? [] : ['http://localhost:5173', 'http://localhost:3000']),
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow no-origin requests (server-to-server, curl, mobile native apps)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing with size limits to prevent payload-bomb DoS.
// NOTE: the PayMongo webhook route uses express.raw() inline because it needs
// the unparsed buffer for signature verification — don't add json() to it.
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ─── Static 3-D model files ───────────────────────────────────────────────
// Serve GLB files from public/models/ at GET /models/<sku>.glb
// cross-origin allowed so the mobile WebView (different origin) can fetch them.
// 1-day cache so repeated loads don't re-download 10-30 MB files.
app.use('/models', express.static(path.join(__dirname, 'public/models'), {
  setHeaders(res) {
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
  },
}));

// ─── NoSQL injection defense ──────────────────────────────────────────────
// Strip keys starting with `$` or containing `.` from req.body / req.query /
// req.params. Without this, a payload like { email: { "$gt": "" } } sent to
// a login endpoint that does User.findOne({ email }) would match the FIRST
// user in the DB. Cheap, ~10 lines, no dependency.
function sanitizeMongo(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
      continue;
    }
    const v = obj[key];
    if (v && typeof v === 'object') sanitizeMongo(v);
  }
}
app.use((req, _res, next) => {
  sanitizeMongo(req.body);
  sanitizeMongo(req.query);
  sanitizeMongo(req.params);
  next();
});

// ─── Rate limiting ────────────────────────────────────────────────────────
// Global: 200 requests / 15min / IP — protects against scraping and abuse.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Auth-only: 10 attempts / 15min / IP — stops brute-force login/signup.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed auth attempts
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// Apply global limiter to all routes
app.use(globalLimiter);

// Socket.io connection logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_order', (orderId) => {
    socket.join(`order_${orderId}`);
    console.log(`Socket ${socket.id} joined order_${orderId}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// Initialize notification service with socket.io
const notificationService = new NotificationService(io);
app.set('notificationService', notificationService);

// Server session ID - changes on every restart to force client logout
const SERVER_SESSION_ID = Date.now().toString();
app.get('/api/session', (req, res) => res.json({ sessionId: SERVER_SESSION_ID }));

console.log('Registering routes...');
// Auth gets a stricter rate limiter (brute-force protection) BEFORE its routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/stock-movements', stockMovementRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/abandoned-carts', abandonedCartRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-design', aiDesignRoutes);
app.use('/api/admin-insights', adminInsightsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/products', productRoutes);
app.use('/api/payments', paymentRoutes);
console.log('Routes registered');
app.use('/api/admin-ai', adminAIRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/designs', designRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/production-public', productionPublicRoutes);
app.use('/api/system', systemConfigRoutes);
app.use('/api/paymongo', paymongoRoutes);
app.use('/api/chatbot', chatbotRoutes);

app.get('/api/test', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Health check endpoint for monitoring/load-balancer probes. Reports DB status
// so an unhealthy DB triggers a non-200 (load balancer can route around).
const healthHandler = async (req, res) => {
  const dbState = mongoose.connection.readyState; // 0=disconnected, 1=connected
  const healthy = dbState === 1;

  // Lightweight feature-availability snapshot — useful for an admin "system
  // health" widget. Doesn't touch external services on each probe to avoid
  // making the health endpoint itself a load source.
  const cloudinaryOk = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET &&
    process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name'
  );
  const smtpOk = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const paymongoOk = !!(
    process.env.PAYMONGO_SECRET_KEY &&
    process.env.PAYMONGO_PUBLIC_KEY
  );

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    db: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    features: {
      cloudinary: cloudinaryOk,
      smtp: smtpOk,
      paymongo: paymongoOk,
    },
    nodeEnv: process.env.NODE_ENV || 'development',
  });
};

// Two routes for the same handler:
//   /healthz   — Kubernetes / cloud-provider convention
//   /api/health — matches the rest of our API namespace
app.get('/healthz', healthHandler);
app.get('/api/health', healthHandler);

// Centralized error handler — catches anything thrown in routes/middleware
// and returns a JSON error instead of an HTML stack trace (which leaks info).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  // eslint-disable-next-line no-console
  console.error('[unhandled]', err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 && isProd ? 'Internal server error' : err.message,
  });
});

const PORT = process.env.PORT || 4000;

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log('✅ Connected to MongoDB Atlas');
    httpServer.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} (Accessible on network with Real-time Sync)`));

    // Hourly abandoned-cart sweep. Best-effort — failures inside the sweep
    // are logged but never crash the server. Skipped silently if SMTP isn't
    // configured (the service double-checks).
    setInterval(async () => {
      try {
        const result = await sweepAbandonedCarts();
        if (result.sent > 0 || result.failed > 0) {
          console.log(`[abandoned-cart-sweep] sent=${result.sent} failed=${result.failed} processed=${result.processed}`);
        }
      } catch (err) {
        console.error('[abandoned-cart-sweep] error:', err.message);
      }
    }, 60 * 60 * 1000);

    // ─── Background jobs ─────────────────────────────────────────────────
    // Sweep stale order reservations every 15 minutes. Cancels orders that
    // have been awaiting payment for >24h and releases their reserved stock
    // so other shoppers can claim it. Idempotent — safe to run on a schedule.
    const RESERVATION_SWEEP_INTERVAL_MS = 15 * 60 * 1000; // 15 min
    const RESERVATION_TIMEOUT_HOURS = Number(process.env.RESERVATION_TIMEOUT_HOURS) || 24;
    setInterval(async () => {
      try {
        const result = await expireStaleReservations({ olderThanHours: RESERVATION_TIMEOUT_HOURS });
        if (result.released > 0) {
          console.log(`[reservation-sweep] released ${result.released} stale reservations`);
        }
      } catch (err) {
        console.error('[reservation-sweep] failed:', err.message);
      }
    }, RESERVATION_SWEEP_INTERVAL_MS);
    // Run once on startup so a long-down server doesn't leave reservations stuck.
    expireStaleReservations({ olderThanHours: RESERVATION_TIMEOUT_HOURS })
      .then((r) => r.released > 0 && console.log(`[reservation-sweep:boot] released ${r.released} stale reservations`))
      .catch((err) => console.error('[reservation-sweep:boot] failed:', err.message));

    // End-of-day production digest scheduler — fires hourly, dispatches
    // at the configured local hour (default 18:00). State is kept in
    // module scope so reruns the same day are no-ops.
    try {
      const { startDigestScheduler } = await import('./services/productionDigest.js');
      startDigestScheduler();
      console.log('[digest] Production digest scheduler started');
    } catch (err) {
      console.error('[digest] Failed to start scheduler:', err.message);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  });
