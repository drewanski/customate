/**
 * Unified mail sender.
 *
 * Tries providers in order of reliability on Render's free tier:
 *   1. Brevo (Sendinblue) HTTPS API — works on free tier because it uses
 *      port 443 instead of SMTP ports 465/587 which Render blocks. Set
 *      BREVO_API_KEY to enable. 300 emails/day free, no domain verification
 *      needed for the first sends.
 *   2. Resend HTTPS API — same story; uses port 443. Set RESEND_API_KEY
 *      to enable. 3000 emails/month free but requires verified domain.
 *   3. nodemailer SMTP fallback — only works on hosts that allow outbound
 *      port 587 (NOT Render free). Kept so local dev still works.
 *
 * All paths share the same timeout discipline so one slow provider can't
 * stall the request loop. Caller never has to know which provider ran.
 */

import nodemailer from 'nodemailer';

const FROM_DEFAULT =
  process.env.MAIL_FROM ||
  process.env.SMTP_FROM ||
  process.env.SMTP_USER ||
  'noreply@customate.app';
const FROM_NAME = process.env.MAIL_FROM_NAME || 'CustoMate';

/**
 * Send an email. Resolves with { ok: true, provider } on success,
 * rejects with an Error on failure. Internal timeouts mean this never
 * hangs longer than ~15 s.
 *
 * Required: { to, subject, html | text }
 */
export async function sendMail({ to, subject, html, text, from }) {
  if (!to || !subject || (!html && !text)) {
    throw new Error('sendMail: to, subject, and html|text are required');
  }
  const sender = from || FROM_DEFAULT;

  // 1) Brevo HTTPS API — preferred for Render free tier.
  if (process.env.BREVO_API_KEY) {
    return sendViaBrevo({ to, subject, html, text, from: sender });
  }
  // 2) Resend HTTPS API
  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ to, subject, html, text, from: sender });
  }
  // 3) Local nodemailer SMTP
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return sendViaNodemailer({ to, subject, html, text, from: sender });
  }
  throw new Error('No mail provider configured (set BREVO_API_KEY, RESEND_API_KEY, or SMTP_USER+SMTP_PASS)');
}

// ─── Brevo (Sendinblue) HTTPS API ─────────────────────────────────────
async function sendViaBrevo({ to, subject, html, text, from }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: from },
        to: [{ email: to }],
        subject,
        htmlContent: html || `<pre>${escapeHtml(text || '')}</pre>`,
        textContent: text || stripHtml(html || ''),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return { ok: true, provider: 'brevo' };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Resend HTTPS API ─────────────────────────────────────────────────
async function sendViaResend({ to, subject, html, text, from }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${from}>`,
        to: [to],
        subject,
        html: html || undefined,
        text: text || undefined,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return { ok: true, provider: 'resend' };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── nodemailer SMTP (local dev or non-Render hosts) ──────────────────
async function sendViaNodemailer({ to, subject, html, text, from }) {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
  await Promise.race([
    transport.sendMail({ from, to, subject, html, text }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP send timed out after 15s')), 15000)),
  ]);
  return { ok: true, provider: 'smtp' };
}

// Tiny helpers — used to back-fill missing text/html when only one is given.
function stripHtml(html) {
  return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Diagnostic — used by /api/health to surface which provider is active.
 */
export function describeMailProvider() {
  if (process.env.BREVO_API_KEY) return { provider: 'brevo', ready: true };
  if (process.env.RESEND_API_KEY) return { provider: 'resend', ready: true };
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return { provider: 'smtp', ready: true };
  return { provider: 'none', ready: false };
}
