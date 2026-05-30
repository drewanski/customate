/**
 * Environment-variable validation.
 *
 * Run on server startup. Fails LOUD if any required variable is missing or
 * looks like the .env.example placeholder. Catching this at boot is far
 * better than discovering it the first time a customer tries to check out.
 *
 * Three tiers:
 *   - REQUIRED  → server refuses to start
 *   - PROD_ONLY → required only when NODE_ENV=production
 *   - WARNINGS  → optional; missing → log a warning, don't crash
 */

const REQUIRED = [
  ['MONGO_URI', 'MongoDB connection string'],
  ['JWT_SECRET', 'JWT signing secret'],
];

const PROD_ONLY = [
  ['FRONTEND_URL', 'Public frontend URL (used by CORS + redirect targets)'],
  ['SMTP_USER', 'SMTP username for OTP + transactional emails'],
  ['SMTP_PASS', 'SMTP password / app password'],
];

const WARNINGS = [
  ['CLOUDINARY_CLOUD_NAME', 'Design previews will stay base64 in MongoDB'],
  ['CLOUDINARY_API_KEY', 'Design previews will stay base64 in MongoDB'],
  ['CLOUDINARY_API_SECRET', 'Design previews will stay base64 in MongoDB'],
  ['PAYMONGO_SECRET_KEY', 'PayMongo payments will not work'],
  ['PAYMONGO_WEBHOOK_SECRET', 'PayMongo webhooks will be unverified'],
  // SEMAPHORE_API_KEY removed per panel revision #13 — SMS disabled.
  ['GEMINI_API_KEY', 'AI-design assistant will be unavailable'],
  ['GOOGLE_CLIENT_ID', 'Google sign-in will be unavailable'],
];

// Values that look like placeholders we shipped in .env.example.
const PLACEHOLDER_VALUES = new Set([
  'your_cloud_name',
  'your_api_key',
  'your_api_secret',
  'whsec_your_webhook_secret_here',
  'supersecretkey', // JWT_SECRET — we'll specifically reject this in prod
  'changeme',
  'replaceme',
]);

function isPresent(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlaceholder(value) {
  return PLACEHOLDER_VALUES.has((value || '').trim());
}

export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const missing = [];
  const placeholders = [];
  const warnings = [];

  for (const [key, hint] of REQUIRED) {
    const v = process.env[key];
    if (!isPresent(v)) missing.push({ key, hint });
    else if (isProd && isPlaceholder(v)) placeholders.push({ key, hint });
  }

  if (isProd) {
    for (const [key, hint] of PROD_ONLY) {
      const v = process.env[key];
      if (!isPresent(v)) missing.push({ key, hint });
      else if (isPlaceholder(v)) placeholders.push({ key, hint });
    }
    // JWT_SECRET in particular must not be the dev default.
    if (process.env.JWT_SECRET === 'supersecretkey') {
      placeholders.push({
        key: 'JWT_SECRET',
        hint: 'Default dev value is unsafe — generate a strong random secret.',
      });
    }
  }

  for (const [key, hint] of WARNINGS) {
    const v = process.env[key];
    if (!isPresent(v) || isPlaceholder(v)) {
      warnings.push({ key, hint });
    }
  }

  // Render the report.
  if (warnings.length) {
    console.warn('\n⚠ Environment warnings (non-fatal):');
    for (const w of warnings) {
      console.warn(`  · ${w.key} — ${w.hint}`);
    }
  }

  if (missing.length || placeholders.length) {
    console.error('\n❌ Environment validation failed:');
    for (const m of missing) {
      console.error(`  · MISSING: ${m.key} — ${m.hint}`);
    }
    for (const p of placeholders) {
      console.error(`  · PLACEHOLDER: ${p.key} — ${p.hint}`);
    }
    console.error('\nFix these in your .env file before starting the server.\n');
    process.exit(1);
  }

  console.log(`✓ Environment validated (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
}
