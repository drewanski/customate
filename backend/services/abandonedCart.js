/**
 * Abandoned-cart recovery service.
 *
 * Runs as an hourly sweep that:
 *   1. Finds carts with status='active' that haven't been touched in N
 *      minutes for the next notify stage:
 *        - stage 0 → 1h idle → send "did you forget something?" email
 *        - stage 1 → 24h idle → send "still saved for you" reminder
 *        - stage 2 → 72h idle → final "10% off if you complete it" nudge
 *   2. Sends the matching email template (best-effort; failures don't
 *      block other carts).
 *   3. Updates notifyStage + lastNotifiedAt so we don't double-send.
 *
 * The sweep is a no-op when SMTP isn't configured (dev mode without creds).
 */

import nodemailer from 'nodemailer';
import AbandonedCart from '../models/AbandonedCart.js';

const NOTIFY_STAGES = [
  { stage: 1, idleMinutes: 60, subject: 'You left something in your cart' },
  { stage: 2, idleMinutes: 60 * 24, subject: 'Still thinking it over?' },
  { stage: 3, idleMinutes: 60 * 72, subject: 'Last chance — your cart' },
];

function buildEmailHtml(cart, stage) {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const itemsHtml = (cart.items || [])
    .map(
      (it) =>
        `<tr>
          <td style="padding:6px 0;font-size:13px;">${it.name} × ${it.quantity}</td>
          <td style="padding:6px 0;font-size:13px;text-align:right;">₱${(it.unitPrice * it.quantity).toLocaleString()}</td>
        </tr>`,
    )
    .join('');
  const promo = stage === 3
    ? `<p style="margin:16px 0;padding:12px;background:#fef3c7;border-radius:8px;font-size:13px;">
         Use code <strong>COMEBACK10</strong> for 10% off if you check out in the next 24 hours.
       </p>`
    : '';
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="color:#1e293b;margin:0 0 12px;">Hi ${cart.customerName || 'there'},</h2>
      <p style="color:#475569;font-size:14px;line-height:1.5;">
        We saved your cart so you can pick up right where you left off.
      </p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin:16px 0;">
        ${itemsHtml}
        <tr>
          <td style="padding:10px 0;font-weight:bold;">Subtotal</td>
          <td style="padding:10px 0;font-weight:bold;text-align:right;">₱${(cart.subtotal || 0).toLocaleString()}</td>
        </tr>
      </table>
      ${promo}
      <a href="${FRONTEND_URL}/cart" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;">
        Resume checkout →
      </a>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px;">
        Don't want these reminders? Just complete or empty your cart.
      </p>
    </div>
  `;
}

async function sendRecoveryEmail(cart, stage) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { ok: false, reason: 'SMTP not configured' };
  }
  // Port 587 + STARTTLS works on Render free tier where 465 is blocked.
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  const stageMeta = NOTIFY_STAGES.find((s) => s.stage === stage);
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: cart.customerEmail,
    subject: stageMeta.subject,
    html: buildEmailHtml(cart, stage),
  });
  return { ok: true };
}

/**
 * Single sweep pass. Run from a cron / setInterval / external scheduler.
 * Returns a summary the admin can inspect.
 */
export async function sweepAbandonedCarts(now = new Date()) {
  const summary = { processed: 0, sent: 0, failed: 0, errors: [] };

  // For each notify stage, find carts whose last-update is older than the
  // stage's idle threshold AND who haven't been notified at this stage yet.
  for (const meta of NOTIFY_STAGES) {
    const cutoff = new Date(now.getTime() - meta.idleMinutes * 60 * 1000);
    const carts = await AbandonedCart.find({
      status: 'active',
      notifyStage: { $lt: meta.stage },
      updatedAt: { $lt: cutoff },
    });
    for (const cart of carts) {
      summary.processed++;
      if (!cart.customerEmail) continue;
      try {
        await sendRecoveryEmail(cart, meta.stage);
        cart.notifyStage = meta.stage;
        cart.lastNotifiedAt = new Date();
        await cart.save();
        summary.sent++;
      } catch (err) {
        summary.failed++;
        summary.errors.push({ cartId: cart._id, error: err.message });
      }
    }
  }
  return summary;
}

/**
 * Mark a customer's abandoned cart as recovered. Called from the order
 * create route when a customer successfully places an order — prevents
 * the sweeper from emailing them right after they finished checking out.
 */
export async function markRecovered(customerId, orderId) {
  await AbandonedCart.findOneAndUpdate(
    { customer: customerId, status: 'active' },
    {
      status: 'recovered',
      recoveredAt: new Date(),
      recoveredOrder: orderId,
    },
  );
}
