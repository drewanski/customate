/**
 * Urgency / delivery-date service.
 *
 * The customer picks a preferred delivery date at checkout. We compute the
 * business-day lead time from "now" to that date and classify it into one of
 * four tiers — each with its own surcharge (% of subtotal) and production-
 * priority mapping. Soft per-tier-per-day capacity caps prevent us from
 * accepting more rush/priority orders than the production team can deliver.
 *
 *   Standard  ≥10 days   0%   medium    (no cap)
 *   Express  6–9 days   20%   high      (no cap)
 *   Rush     3–5 days   40%   high      ≤12/day
 *   Priority 1–2 days   80%   urgent    ≤5/day
 *
 * Same-day delivery is intentionally not offered — it's too risky for a
 * custom-print pipeline that includes design review + printing + QC.
 *
 * All pricing/tier values are FROZEN onto the Order at placement time. Future
 * edits to TIERS won't retroactively change historical orders.
 */

import Order from '../models/Order.js';

// ─── Tier configuration ────────────────────────────────────────────────────
// Order matters: classify() walks the list and picks the first tier whose
// `maxLeadDays` covers the actual lead time.
export const URGENCY_TIERS = [
  {
    tier: 'priority',
    label: 'Priority',
    minLeadDays: 1,
    maxLeadDays: 2,
    surchargePct: 0.80,
    productionPriority: 'urgent',
    softCapPerDay: 5,
    color: '#dc2626', // rose-600
    description: 'Top of the queue. Highest surcharge.',
  },
  {
    tier: 'rush',
    label: 'Rush',
    minLeadDays: 3,
    maxLeadDays: 5,
    surchargePct: 0.40,
    productionPriority: 'high',
    softCapPerDay: 12,
    color: '#ea580c', // orange-600
    description: 'Expedited handling — moves ahead of standard orders.',
  },
  {
    tier: 'express',
    label: 'Express',
    minLeadDays: 6,
    maxLeadDays: 9,
    surchargePct: 0.20,
    productionPriority: 'high',
    softCapPerDay: 0, // no cap
    color: '#ca8a04', // yellow-600
    description: 'Faster than standard, modest surcharge.',
  },
  {
    tier: 'standard',
    label: 'Standard',
    minLeadDays: 10,
    maxLeadDays: 365,
    surchargePct: 0,
    productionPriority: 'medium',
    softCapPerDay: 0, // no cap
    color: '#16a34a', // green-600
    description: 'Normal production lead time. No surcharge.',
  },
];

const MIN_LEAD_DAYS = 1; // we don't accept same-day
const MAX_LEAD_DAYS = 90; // 3-month horizon

// ─── Date helpers ──────────────────────────────────────────────────────────

/** Strip time-of-day; align to UTC midnight so day comparisons are stable. */
function startOfDay(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/**
 * Count business days (Mon–Sat in PH; Sunday only is non-working) between two
 * dates. We include `to` but not `from` — so today→tomorrow == 1 lead day.
 *
 * Sunday-only off mirrors typical PH garment / print-shop operations. If the
 * business is ever closed on Saturdays too, change `=== 0` to `=== 0 || === 6`.
 */
export function businessDaysBetween(from, to) {
  const a = startOfDay(from);
  const b = startOfDay(to);
  if (b <= a) return 0;
  let count = 0;
  const cur = new Date(a);
  while (cur < b) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    if (cur.getUTCDay() !== 0) count++; // Sunday is the only off-day
  }
  return count;
}

// ─── Classification ────────────────────────────────────────────────────────

/**
 * Classify a requested delivery date into an urgency tier.
 *
 * Returns:
 *   { ok: true,  tier, label, leadTimeDays, surchargePct, productionPriority }
 *   { ok: false, reason }     — date is invalid, in the past, or out of range
 */
export function classifyUrgency(requestedDeliveryDate, now = new Date()) {
  if (!requestedDeliveryDate) {
    return { ok: false, reason: 'Delivery date is required.' };
  }
  const target = startOfDay(requestedDeliveryDate);
  const today = startOfDay(now);

  if (Number.isNaN(target.getTime())) {
    return { ok: false, reason: 'Invalid delivery date.' };
  }
  if (target <= today) {
    return { ok: false, reason: 'Delivery date must be in the future.' };
  }
  // Sundays aren't a delivery day in our PH-default schedule.
  if (target.getUTCDay() === 0) {
    return { ok: false, reason: 'Sundays are not available for delivery.' };
  }

  const leadDays = businessDaysBetween(today, target);
  if (leadDays < MIN_LEAD_DAYS) {
    return { ok: false, reason: 'Same-day delivery is not available.' };
  }
  if (leadDays > MAX_LEAD_DAYS) {
    return { ok: false, reason: 'Delivery date is too far in the future.' };
  }

  const tier = URGENCY_TIERS.find(
    (t) => leadDays >= t.minLeadDays && leadDays <= t.maxLeadDays,
  ) || URGENCY_TIERS[URGENCY_TIERS.length - 1]; // fallback to standard

  return {
    ok: true,
    tier: tier.tier,
    label: tier.label,
    leadTimeDays: leadDays,
    surchargePct: tier.surchargePct,
    productionPriority: tier.productionPriority,
    color: tier.color,
    description: tier.description,
  };
}

/** Compute the rush-fee amount for a given subtotal and tier. */
export function calculateRushFee(subtotal, tier) {
  const t = URGENCY_TIERS.find((x) => x.tier === tier);
  if (!t) return 0;
  return Math.round(Math.max(0, subtotal) * t.surchargePct);
}

// ─── Capacity ──────────────────────────────────────────────────────────────

/**
 * How many orders of each capped tier are already booked for `date`?
 * Returns { priority: <count>, rush: <count> }.
 */
export async function getDayLoad(date) {
  const start = startOfDay(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  // Cancelled / rejected orders shouldn't count against capacity.
  const rows = await Order.aggregate([
    {
      $match: {
        requestedDeliveryDate: { $gte: start, $lt: end },
        status: { $nin: ['cancelled', 'rejected'] },
      },
    },
    { $group: { _id: '$urgencyTier', count: { $sum: 1 } } },
  ]);

  const out = { priority: 0, rush: 0, express: 0, standard: 0 };
  for (const r of rows) {
    if (r._id in out) out[r._id] = r.count;
  }
  return out;
}

/**
 * For each tier, what's the remaining capacity on `date`? Tiers without a
 * cap report `available: Infinity`.
 *
 * This is the canonical "can the customer pick this tier today?" check —
 * used both by the checkout preview and by the order-create validation.
 */
export async function getTierAvailability(date) {
  const load = await getDayLoad(date);
  return URGENCY_TIERS.map((t) => ({
    tier: t.tier,
    label: t.label,
    softCapPerDay: t.softCapPerDay,
    used: load[t.tier] || 0,
    available:
      t.softCapPerDay > 0 ? Math.max(0, t.softCapPerDay - (load[t.tier] || 0)) : Infinity,
    saturated: t.softCapPerDay > 0 && (load[t.tier] || 0) >= t.softCapPerDay,
  }));
}

/**
 * Validate that the customer's chosen delivery date has capacity for the
 * tier they've been classified into. Throws-style return: { ok, reason }.
 */
export async function checkCapacity(tier, date) {
  const t = URGENCY_TIERS.find((x) => x.tier === tier);
  if (!t || t.softCapPerDay <= 0) return { ok: true };
  const load = await getDayLoad(date);
  const used = load[tier] || 0;
  if (used >= t.softCapPerDay) {
    return {
      ok: false,
      reason: `${t.label} slots for that date are fully booked. Please choose a different date.`,
      used,
      cap: t.softCapPerDay,
    };
  }
  return { ok: true, used, cap: t.softCapPerDay };
}

// ─── Quote helper (used by routes) ─────────────────────────────────────────

/**
 * Single-call preview the customer sees before they commit: classifies the
 * date, computes the fee, and checks capacity in one shot.
 */
export async function quoteDelivery({ requestedDeliveryDate, subtotal }) {
  const cls = classifyUrgency(requestedDeliveryDate);
  if (!cls.ok) return { ok: false, reason: cls.reason };

  const rushFee = calculateRushFee(subtotal || 0, cls.tier);
  const cap = await checkCapacity(cls.tier, requestedDeliveryDate);

  return {
    ok: true,
    tier: cls.tier,
    label: cls.label,
    leadTimeDays: cls.leadTimeDays,
    surchargePct: cls.surchargePct,
    productionPriority: cls.productionPriority,
    color: cls.color,
    description: cls.description,
    rushFee,
    newSubtotal: (subtotal || 0) + rushFee,
    capacity: cap.ok
      ? { available: true }
      : { available: false, reason: cap.reason, used: cap.used, cap: cap.cap },
  };
}
