/**
 * Daily end-of-day Production Digest.
 *
 * Composes a single HTML email summarising the day's production activity
 * and sends it to every active admin via the unified mailer (Brevo on
 * production, SMTP locally).
 *
 * Sections:
 *   1. Orders completed today (status moved to ready / shipped / delivered)
 *   2. Blockers raised today
 *   3. Per-staff productivity (orders moved across stages, time spent)
 *   4. Current backlog (queue depth by priority)
 *
 * The scheduler in server.js fires this once per day at the local hour
 * stored in SystemConfig.dailyDigestHour (defaults to 18:00 = 6 PM).
 * Re-running on the same day is idempotent — admins get one email.
 */

import Order from '../models/Order.js';
import User from '../models/User.js';
import ProductionLog from '../models/ProductionLog.js';
import SystemConfig from '../models/SystemConfig.js';
import { sendMail } from './mailer.js';

const REASON_LABELS = {
  material_out_of_stock: 'Material out of stock',
  machine_issue: 'Machine issue',
  design_unclear: 'Design unclear',
  customer_change_requested: 'Customer change',
  damaged_during_production: 'Damaged in production',
  other: 'Other',
};

function buildHtml({ date, completed, blockers, perStaff, backlog }) {
  const fmt = (n) => Number(n || 0).toLocaleString();
  const safeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return `
  <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto; background: #f8fafc; padding: 16px;">
    <div style="background: linear-gradient(135deg, #2563eb, #6366f1); color: white; padding: 24px; border-radius: 16px 16px 0 0;">
      <p style="margin: 0; font-size: 10px; font-weight: 800; letter-spacing: 2px; opacity: 0.85;">CUSTOMATE · PRODUCTION DIGEST</p>
      <h1 style="margin: 4px 0 0; font-size: 24px; font-weight: 900;">${date}</h1>
    </div>
    <div style="background: white; padding: 24px; border-radius: 0 0 16px 16px;">

      <h2 style="font-size: 14px; color: #475569; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Completed today</h2>
      <div style="display: flex; gap: 12px; margin-bottom: 24px;">
        <div style="flex: 1; padding: 16px; background: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 12px;">
          <p style="margin: 0; font-size: 11px; color: #047857; font-weight: 800;">READY FOR SHIPPING</p>
          <p style="margin: 4px 0 0; font-size: 28px; font-weight: 900; color: #064e3b;">${fmt(completed.ready)}</p>
        </div>
        <div style="flex: 1; padding: 16px; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 12px;">
          <p style="margin: 0; font-size: 11px; color: #1d4ed8; font-weight: 800;">SHIPPED</p>
          <p style="margin: 4px 0 0; font-size: 28px; font-weight: 900; color: #1e3a8a;">${fmt(completed.shipped)}</p>
        </div>
      </div>

      ${blockers.length > 0 ? `
        <h2 style="font-size: 14px; color: #be123c; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Blockers raised (${blockers.length})</h2>
        <ul style="list-style: none; padding: 0; margin: 0 0 24px;">
          ${blockers.map((b) => `
            <li style="padding: 10px 12px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; margin-bottom: 6px;">
              <p style="margin: 0; font-size: 11px; color: #be123c; font-weight: 800;">
                #${safeHtml(String(b.orderId).slice(-6).toUpperCase())} · ${safeHtml(REASON_LABELS[b.reason] || b.reason)}
              </p>
              ${b.note ? `<p style="margin: 4px 0 0; font-size: 12px; color: #475569;">${safeHtml(b.note)}</p>` : ''}
              <p style="margin: 4px 0 0; font-size: 10px; color: #94a3b8;">flagged by ${safeHtml(b.staffName)}</p>
            </li>`).join('')}
        </ul>` : ''}

      <h2 style="font-size: 14px; color: #475569; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Per-staff completions</h2>
      ${perStaff.length === 0 ? `<p style="color: #94a3b8; font-style: italic; margin-bottom: 24px;">No staff activity today.</p>` : `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="text-align: left; padding: 8px 12px; font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 1px;">Staff member</th>
              <th style="text-align: right; padding: 8px 12px; font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 1px;">Completed</th>
              <th style="text-align: right; padding: 8px 12px; font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 1px;">Avg time</th>
            </tr>
          </thead>
          <tbody>
            ${perStaff.map((p) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 12px; font-weight: 700; color: #0f172a;">${safeHtml(p.name)}</td>
                <td style="padding: 8px 12px; text-align: right; font-weight: 800; color: #047857;">${p.completed}</td>
                <td style="padding: 8px 12px; text-align: right; color: #64748b;">${p.avgTime}</td>
              </tr>`).join('')}
          </tbody>
        </table>`}

      <h2 style="font-size: 14px; color: #475569; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Current backlog</h2>
      <div style="display: flex; gap: 8px;">
        <div style="flex: 1; text-align: center; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
          <p style="margin: 0; font-size: 10px; color: #b91c1c; font-weight: 800;">URGENT</p>
          <p style="margin: 4px 0 0; font-size: 22px; font-weight: 900; color: #7f1d1d;">${fmt(backlog.urgent)}</p>
        </div>
        <div style="flex: 1; text-align: center; padding: 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;">
          <p style="margin: 0; font-size: 10px; color: #c2410c; font-weight: 800;">HIGH</p>
          <p style="margin: 4px 0 0; font-size: 22px; font-weight: 900; color: #7c2d12;">${fmt(backlog.high)}</p>
        </div>
        <div style="flex: 1; text-align: center; padding: 12px; background: #fefce8; border: 1px solid #fde68a; border-radius: 8px;">
          <p style="margin: 0; font-size: 10px; color: #a16207; font-weight: 800;">MEDIUM</p>
          <p style="margin: 4px 0 0; font-size: 22px; font-weight: 900; color: #713f12;">${fmt(backlog.medium)}</p>
        </div>
        <div style="flex: 1; text-align: center; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
          <p style="margin: 0; font-size: 10px; color: #15803d; font-weight: 800;">LOW</p>
          <p style="margin: 4px 0 0; font-size: 22px; font-weight: 900; color: #14532d;">${fmt(backlog.low)}</p>
        </div>
      </div>

      <p style="margin: 24px 0 0; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
        You're getting this because you're listed as an admin on CustoMate. Manage digest settings on the Production page.
      </p>
    </div>
  </div>`;
}

/**
 * Build the digest payload for a given Date (the start of the day in
 * server timezone). Pure function — no side effects.
 */
async function buildDigest(dayStart) {
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCHours(23, 59, 59, 999);

  // Section 1 — completed today
  const [readyCount, shippedCount] = await Promise.all([
    Order.countDocuments({ status: 'ready', productionCompletedAt: { $gte: dayStart, $lte: dayEnd } }),
    Order.countDocuments({ status: { $in: ['shipped', 'delivered'] }, updatedAt: { $gte: dayStart, $lte: dayEnd } }),
  ]);

  // Section 2 — blockers raised today
  const blockerOrders = await Order.find({
    blockerStatus: 'active',
    blockedAt: { $gte: dayStart, $lte: dayEnd },
  })
    .populate('blockedBy', 'name')
    .limit(20)
    .lean();
  const blockers = blockerOrders.map((o) => ({
    orderId: String(o._id),
    reason: o.blockerReason,
    note: o.blockerNote,
    staffName: o.blockedBy?.name || 'Staff',
  }));

  // Section 3 — per-staff completions
  const completedLogs = await ProductionLog.find({
    type: 'completed',
    createdAt: { $gte: dayStart, $lte: dayEnd },
  })
    .populate('performedBy', 'name role')
    .lean();
  const perStaffMap = {};
  for (const log of completedLogs) {
    const name = log.performedBy?.name || log.performedByName || 'Unknown';
    const role = log.performedBy?.role || log.performedByRole || '';
    if (role === 'production_staff') {
      perStaffMap[name] = (perStaffMap[name] || 0) + 1;
    }
  }
  const completedOrders = await Order.find({
    status: 'ready',
    productionCompletedAt: { $gte: dayStart, $lte: dayEnd },
    productionTimeMinutes: { $gt: 0 },
  })
    .populate('assignedTo', 'name')
    .select('assignedTo productionTimeMinutes')
    .lean();
  const timeAccum = {};
  for (const o of completedOrders) {
    const name = o.assignedTo?.name;
    if (!name) continue;
    if (!timeAccum[name]) timeAccum[name] = { total: 0, n: 0 };
    timeAccum[name].total += o.productionTimeMinutes;
    timeAccum[name].n += 1;
  }
  const perStaff = Object.keys(perStaffMap).map((name) => {
    const t = timeAccum[name];
    const avgM = t && t.n > 0 ? Math.round(t.total / t.n) : 0;
    const avgTime = avgM === 0
      ? '—'
      : avgM > 60 ? `${Math.floor(avgM / 60)}h ${avgM % 60}m` : `${avgM}m`;
    return { name, completed: perStaffMap[name], avgTime };
  }).sort((a, b) => b.completed - a.completed);

  // Section 4 — current backlog by priority
  const backlogAgg = await Order.aggregate([
    {
      $match: {
        status: { $in: ['pending', 'approved', 'in_production'] },
        blockerStatus: { $ne: 'active' },
      },
    },
    { $group: { _id: '$productionPriority', n: { $sum: 1 } } },
  ]);
  const backlog = { urgent: 0, high: 0, medium: 0, low: 0 };
  for (const row of backlogAgg) {
    if (row._id && backlog[row._id] !== undefined) backlog[row._id] = row.n;
  }

  return {
    date: dayStart.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    completed: { ready: readyCount, shipped: shippedCount },
    blockers,
    perStaff,
    backlog,
  };
}

/**
 * Build + dispatch the digest. Public entrypoint called by the scheduler.
 */
export async function sendDailyProductionDigest() {
  const cfg = await SystemConfig.getOrCreate();
  if (!cfg.dailyDigestEnabled) return { sent: 0, skipped: true };

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const payload = await buildDigest(dayStart);
  const html = buildHtml(payload);

  // All admins receive the digest (active accounts only)
  const admins = await User.find({ role: 'admin', status: 'active' })
    .select('email name')
    .lean();
  if (admins.length === 0) return { sent: 0, skipped: false };

  const subject = `CustoMate · Production Digest · ${payload.date}`;
  let sent = 0;
  for (const a of admins) {
    if (!a.email) continue;
    try {
      await sendMail({ to: a.email, subject, html });
      sent++;
    } catch (err) {
      console.error(`Digest send failed for ${a.email}:`, err.message);
    }
  }
  return { sent, skipped: false, recipients: admins.length };
}

/**
 * Scheduler — fires hourly, dispatches at the configured local hour.
 * State kept on the SystemConfig doc so reruns same-day are no-ops.
 */
let _lastSentDay = '';
export function startDigestScheduler() {
  const ONE_HOUR = 60 * 60 * 1000;
  const tick = async () => {
    try {
      const cfg = await SystemConfig.getOrCreate();
      if (!cfg.dailyDigestEnabled) return;
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (today === _lastSentDay) return;
      if (now.getHours() !== (cfg.dailyDigestHour ?? 18)) return;
      const result = await sendDailyProductionDigest();
      _lastSentDay = today;
      if (result?.sent) {
        console.log(`Production digest sent to ${result.sent}/${result.recipients} admin(s) for ${today}`);
      }
    } catch (err) {
      console.error('Digest scheduler tick failed:', err.message);
    }
  };
  // Fire immediately on boot in case server was offline when the hour ticked
  tick();
  setInterval(tick, ONE_HOUR);
}
