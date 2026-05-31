import nodemailer from 'nodemailer';

/**
 * Transactional customer emails.
 *
 * Centralised here so order routes and webhooks call ONE function per event
 * type and we don't have HTML templates scattered across the codebase. All
 * mails share the same branded layout for visual consistency.
 *
 * Fails silently — email delivery should never block an order from being
 * placed. Errors are logged and returned in the response so callers can
 * decide whether to surface them (we don't, currently).
 */

const FROM_DEFAULT = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@customate.app';
const BRAND_NAME = 'CustoMate';
const BRAND_COLOR = '#2563eb';

function getTransport() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  // Dev/test escape hatch — set SUPPRESS_TRANSACTIONAL_EMAILS=1 to short-
  // circuit the SMTP send. Used by the audit harness so end-to-end tests
  // don't fire real emails to fake addresses (which then bounce back to
  // SMTP_USER's inbox). Production-safe because it's opt-in.
  if (process.env.SUPPRESS_TRANSACTIONAL_EMAILS === '1') {
    return { sendMail: async (opts) => { console.log(`[mail suppressed] to=${opts.to} subject=${opts.subject}`); return { messageId: 'suppressed' }; } };
  }
  // Explicit host/port + STARTTLS — Render free tier blocks port 465 so
  // we use 587. Honour SMTP_HOST/PORT overrides so we can swap to Brevo
  // / Mailgun / Resend SMTP later without touching code.
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
}

/**
 * Shared HTML wrapper. Inline styles only (no external CSS) so the layout
 * survives email clients that strip <style> tags (Outlook, Gmail Web).
 */
function layout({ headline, body, ctaLabel, ctaUrl, preheader = '' }) {
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>${headline}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f1f5f9;padding:24px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#2563eb 0%,#7c3aed 100%);padding:32px 32px 24px;text-align:left;">
            <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:8px;">${BRAND_NAME}</div>
            <h1 style="margin:0;font-size:24px;font-weight:900;color:#ffffff;line-height:1.2;">${headline}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;color:#1e293b;font-size:15px;line-height:1.6;">
            ${body}
            ${ctaLabel && ctaUrl ? `
              <div style="margin:24px 0 8px;">
                <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-weight:700;border-radius:999px;font-size:14px;">${ctaLabel}</a>
              </div>
            ` : ''}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;text-align:center;">
            <p style="margin:0 0 4px;">© ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.</p>
            <p style="margin:0;">You're receiving this because you placed an order with us. Questions? Reply to this email.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
  `.trim();
}

function orderLineItems(order) {
  return (order.items || []).map((i) =>
    `<tr><td style="padding:4px 0;color:#475569;">${i.quantity}× ${escapeHtml(i.name)}</td><td style="padding:4px 0;text-align:right;color:#0f172a;font-weight:600;">₱${(i.quantity * i.unitPrice).toLocaleString()}</td></tr>`
  ).join('');
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Top-level send helper. Returns { ok: boolean, error?: string }.
 * Logs but never throws — email is best-effort.
 */
async function send({ to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) {
    console.warn('[customerMail] SMTP not configured — skipping email to', to);
    return { ok: false, error: 'SMTP not configured' };
  }
  if (!to) return { ok: false, error: 'No recipient' };
  try {
    await transport.sendMail({ from: FROM_DEFAULT, to, subject, html, text });
    return { ok: true };
  } catch (err) {
    console.error('[customerMail] send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Event-specific senders ────────────────────────────────────────────────

export async function sendOrderPlaced({ user, order }) {
  if (!user?.email) return { ok: false, error: 'no email' };
  const ref = String(order._id).slice(-6);
  return send({
    to: user.email,
    subject: `Order #${ref} received — ${BRAND_NAME}`,
    html: layout({
      headline: `Thanks for your order!`,
      preheader: `We've received your order #${ref} and will review it shortly.`,
      body: `
        <p>Hi ${escapeHtml(user.name || 'there')},</p>
        <p>We've received your order <strong>#${ref}</strong> and our team will start reviewing it shortly. You'll get another email when it moves into production.</p>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-top:16px;">
          <tr><td colspan="2" style="padding-bottom:8px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;">Order Summary</td></tr>
          ${orderLineItems(order)}
          <tr><td style="padding:12px 0 4px 0;border-top:1px solid #e2e8f0;font-size:13px;color:#64748b;">Total</td><td style="padding:12px 0 4px 0;border-top:1px solid #e2e8f0;text-align:right;font-size:18px;font-weight:900;color:#0f172a;">₱${(order.totalPrice || 0).toLocaleString()}</td></tr>
          <tr><td style="padding:4px 0;font-size:13px;color:#64748b;">Payment</td><td style="padding:4px 0;text-align:right;font-size:13px;color:#475569;text-transform:capitalize;">${escapeHtml(order.paymentMethod || 'cod')}</td></tr>
          ${order.isBulk ? `<tr><td colspan="2" style="padding-top:8px;font-size:12px;color:#9333ea;">Bulk order — 50% deposit required to proceed.</td></tr>` : ''}
        </table>
      `,
      ctaLabel: 'Track your order',
      ctaUrl: `${FRONTEND_URL}/order-tracking/${order._id}`,
    }),
    text: `Thanks for your order! Your order #${ref} has been received. Total: ₱${(order.totalPrice || 0).toLocaleString()}. Track it at: ${FRONTEND_URL}/order-tracking/${order._id}`,
  });
}

export async function sendOrderStatusUpdate({ user, order, from, to }) {
  if (!user?.email) return { ok: false, error: 'no email' };
  const ref = String(order._id).slice(-6);

  // Only send for status changes the customer cares about
  const customerVisible = ['approved', 'in_production', 'ready', 'shipped', 'delivered', 'completed', 'cancelled', 'rejected', 'refunded'];
  if (!customerVisible.includes(to)) return { ok: true, skipped: true };

  const meta = {
    approved:      { headline: `Order #${ref} approved`,          body: `Your order has been reviewed and approved. We're moving it into production now.` },
    in_production: { headline: `Order #${ref} is being made`,     body: `Our team has started working on your order. We'll let you know when it's ready.` },
    ready:         { headline: `Order #${ref} is ready`,          body: `Your order is finished and ready for shipment.` },
    shipped:       { headline: `Order #${ref} is on the way`,     body: `Your order has been handed off to the courier. You'll receive it soon.` },
    delivered:     { headline: `Order #${ref} delivered 🎉`,      body: `Your order has been delivered! We hope you love it. We'd appreciate a review if you have a minute.` },
    completed:     { headline: `Order #${ref} complete`,          body: `Your order is complete. Thank you for choosing ${BRAND_NAME}!` },
    cancelled:     { headline: `Order #${ref} cancelled`,         body: `Your order has been cancelled. If you didn't request this, please reply and we'll investigate.` },
    rejected:      { headline: `Order #${ref} couldn't be fulfilled`, body: `Unfortunately we couldn't fulfill this order. Any payment received will be refunded within 3–5 business days.` },
    refunded:      { headline: `Order #${ref} refunded`,          body: `A refund has been processed for this order. It may take 3–5 business days to appear in your account.` },
  }[to];

  return send({
    to: user.email,
    subject: meta.headline,
    html: layout({
      headline: meta.headline,
      preheader: meta.body.slice(0, 100),
      body: `<p>Hi ${escapeHtml(user.name || 'there')},</p><p>${meta.body}</p>`,
      ctaLabel: to === 'delivered' ? 'View order' : 'Track your order',
      ctaUrl: `${FRONTEND_URL}/order-tracking/${order._id}`,
    }),
    text: `${meta.headline}\n\n${meta.body}\n\nTrack: ${FRONTEND_URL}/order-tracking/${order._id}`,
  });
}

export async function sendPaymentConfirmed({ user, order, amountPaid }) {
  if (!user?.email) return { ok: false, error: 'no email' };
  const ref = String(order._id).slice(-6);
  return send({
    to: user.email,
    subject: `Payment received — Order #${ref}`,
    html: layout({
      headline: `Payment received`,
      preheader: `We've received your payment of ₱${(amountPaid || 0).toLocaleString()} for order #${ref}.`,
      body: `
        <p>Hi ${escapeHtml(user.name || 'there')},</p>
        <p>We've received your payment of <strong>₱${(amountPaid || 0).toLocaleString()}</strong> for order <strong>#${ref}</strong>. Your order will move into production shortly.</p>
      `,
      ctaLabel: 'Track your order',
      ctaUrl: `${FRONTEND_URL}/order-tracking/${order._id}`,
    }),
    text: `Payment received. ₱${(amountPaid || 0).toLocaleString()} for order #${ref}. Track: ${FRONTEND_URL}/order-tracking/${order._id}`,
  });
}

export async function sendRefundIssued({ user, order, amount, reason }) {
  if (!user?.email) return { ok: false, error: 'no email' };
  const ref = String(order._id).slice(-6);
  return send({
    to: user.email,
    subject: `Refund processed — Order #${ref}`,
    html: layout({
      headline: `Refund processed`,
      preheader: `A refund of ₱${(amount || 0).toLocaleString()} has been issued for your order.`,
      body: `
        <p>Hi ${escapeHtml(user.name || 'there')},</p>
        <p>A refund of <strong>₱${(amount || 0).toLocaleString()}</strong> has been processed for order <strong>#${ref}</strong>.</p>
        ${reason ? `<p style="color:#64748b;">Reason: <em>${escapeHtml(reason)}</em></p>` : ''}
        <p>It may take 3–5 business days to appear in your account, depending on your payment method.</p>
      `,
    }),
    text: `Refund of ₱${(amount || 0).toLocaleString()} processed for order #${ref}.${reason ? ' Reason: ' + reason : ''}`,
  });
}
