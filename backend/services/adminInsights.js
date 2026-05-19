import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';
import { generateText as llmGenerateText, generateJSON as llmGenerateJSON } from './llm.js';
import Order from '../models/Order.js';
import Inventory from '../models/Inventory.js';
import StockMovement from '../models/StockMovement.js';
import ProductionLog from '../models/ProductionLog.js';
import ProductionCapacity from '../models/ProductionCapacity.js';
import User from '../models/User.js';
import OrderAuditLog from '../models/OrderAuditLog.js';

/**
 * Admin Insights — three focused AI features that turn the operational data
 * we now collect (orders, audit logs, stock movements, production logs) into
 * actionable briefings:
 *
 *   1. summarizeOrder(orderId)      — Per-order brief + risk score
 *   2. suggestRestocks()            — Inventory items that need reordering
 *   3. forecastProduction()         — Next-7-day production bottleneck warning
 *
 * Each function:
 *   - Pulls REAL data from the DB (no fake stats)
 *   - Asks Gemini to write a structured JSON response we can render
 *   - Caches responses (10-30 min depending on volatility)
 *   - Falls back to a deterministic non-LLM analysis if Gemini fails so
 *     admins always see something useful
 */

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.AI_TEXT_MODEL || 'gemini-2.5-flash';
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// ─── Tiny in-memory cache ─────────────────────────────────────────────────
const cache = new Map();
function cacheKey(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}
function cacheGet(key, ttlMs) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}
function cacheSet(key, value) {
  cache.set(key, { ts: Date.now(), value });
  if (cache.size > 200) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
    if (oldest) cache.delete(oldest);
  }
}

/**
 * Extract a JSON object from a possibly-fenced LLM response.
 * Returns null if no valid JSON found.
 */
function parseJsonResponse(text) {
  if (!text) return null;
  const cleaned = String(text).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

// ─── 1. Order summarizer + risk scoring ───────────────────────────────────
/**
 * Generate a concise brief for a specific order. Looks at:
 *   - Order details (items, totals, payment status, customization)
 *   - Customer history (how many past orders, refund history)
 *   - Audit log (status changes, time at each stage)
 *
 * Returns:
 *   {
 *     summary: 1-2 sentence overview,
 *     risk: 'low' | 'medium' | 'high',
 *     riskReasons: [bullets],
 *     suggestedAction: short imperative sentence,
 *     model, fromCache, fallback
 *   }
 */
export async function summarizeOrder(orderId) {
  const order = await Order.findById(orderId).populate('customer', 'name email createdAt');
  if (!order) throw new Error('Order not found');

  // Pull useful context
  const customerId = order.customer?._id || order.customer;
  const [customerOrderCount, customerRefundCount, recentAuditLogs] = await Promise.all([
    customerId ? Order.countDocuments({ customer: customerId }) : 0,
    customerId ? Order.countDocuments({ customer: customerId, refundedAmount: { $gt: 0 } }) : 0,
    OrderAuditLog.find({ order: orderId }).sort({ createdAt: -1 }).limit(15).lean(),
  ]);

  const key = cacheKey(['order-summary', String(orderId), String(order.updatedAt), String(recentAuditLogs.length)]);
  const cached = cacheGet(key, 15 * 60 * 1000); // 15-min cache
  if (cached) return { ...cached, fromCache: true };

  // Compose the data brief — kept TIGHT so token cost stays low
  const ageHours = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 3600000);
  const dataBrief = {
    orderId: String(order._id).slice(-6),
    customer: order.customer?.name || 'Unknown',
    customerEmail: order.customer?.email || '',
    customerTenure: order.customer?.createdAt
      ? Math.round((Date.now() - new Date(order.customer.createdAt).getTime()) / 86400000)
      : null,
    customerOrderCount,
    customerRefundCount,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    isBulk: order.isBulk,
    totalQty: order.totalQty,
    totalPrice: order.totalPrice,
    paidAmount: order.paidAmount || 0,
    refundedAmount: order.refundedAmount || 0,
    ageHours,
    items: (order.items || []).slice(0, 5).map((i) => `${i.quantity}× ${i.name}`),
    shippingAddress: (order.shippingAddress || '').slice(0, 120),
    recentEvents: recentAuditLogs.slice(0, 8).map((l) => ({
      type: l.type, from: l.from, to: l.to, at: l.createdAt,
    })),
  };

  try {
    const prompt = [
      `You are an operations analyst at a custom-merch e-commerce shop.`,
      `Analyse this order and return ONLY valid JSON with this shape:`,
      `{ "summary": "1-2 sentence summary in plain English", "risk": "low" | "medium" | "high", "riskReasons": ["bullet 1", "bullet 2"], "suggestedAction": "short imperative sentence" }`,
      `Risk factors to consider: payment status (unpaid+old = high), refund history, first-time customer with high value, long stage age, bulk orders with partial payment.`,
      `Keep summary <30 words. Keep each riskReason <12 words. Action <15 words.`,
      ``,
      `Order data:`,
      JSON.stringify(dataBrief, null, 2),
    ].join('\n');

    const result = await llmGenerateJSON({
      prompt,
      cacheTtlSeconds: 15 * 60, // per-order cache via cacheContext
      cacheContext: { op: 'order-summary', orderId: String(orderId), updated: String(order.updatedAt) },
      maxTokens: 400,
      json: true,
    });
    const parsed = result.data;
    if (!parsed?.summary) return staticOrderSummary(dataBrief);

    const out = {
      summary: parsed.summary,
      risk: ['low', 'medium', 'high'].includes(parsed.risk) ? parsed.risk : 'low',
      riskReasons: Array.isArray(parsed.riskReasons) ? parsed.riskReasons.slice(0, 4) : [],
      suggestedAction: parsed.suggestedAction || '',
      model: result.model,
      provider: result.provider,
      fromCache: result.fromCache,
      fallback: false,
    };
    cacheSet(key, out);
    return out;
  } catch (err) {
    console.error('summarizeOrder error:', err.message);
    return staticOrderSummary(dataBrief);
  }
}

function staticOrderSummary(d) {
  // Rule-based fallback so admins always see useful info even if Gemini is
  // unreachable or quota-limited.
  const reasons = [];
  let risk = 'low';

  if (d.paymentStatus === 'awaiting_payment' && d.ageHours > 48) {
    reasons.push('Payment outstanding for >48h');
    risk = 'medium';
  }
  if (d.paymentStatus === 'failed') {
    reasons.push('Payment failed');
    risk = 'high';
  }
  if (d.refundedAmount > 0) {
    reasons.push('Has been partially or fully refunded');
    risk = risk === 'high' ? 'high' : 'medium';
  }
  if (d.customerRefundCount > 1) {
    reasons.push('Customer has multiple past refunds');
    risk = 'high';
  }
  if (d.isBulk && d.paymentStatus !== 'paid') {
    reasons.push('Bulk order without full payment');
    if (risk !== 'high') risk = 'medium';
  }
  if (d.customerOrderCount === 1 && d.totalPrice > 5000) {
    reasons.push('First-time customer placing a high-value order');
    if (risk !== 'high') risk = 'medium';
  }
  if (d.status === 'pending' && d.ageHours > 24) {
    reasons.push(`Pending review for ${Math.floor(d.ageHours / 24)} day(s)`);
    if (risk !== 'high') risk = 'medium';
  }

  let action = 'No action needed';
  if (d.status === 'pending') action = 'Review and approve or reject';
  if (d.paymentStatus === 'awaiting_payment') action = 'Follow up on payment';
  if (d.status === 'approved' && !d.recentEvents?.some((e) => e.type === 'status_changed')) {
    action = 'Schedule for production';
  }
  if (d.status === 'ready') action = 'Ship to customer';
  if (risk === 'high') action = 'Escalate — investigate before fulfilling';

  return {
    summary: `${d.customer} ordered ${d.totalQty} units (${d.items?.[0] || 'item'}${d.items?.length > 1 ? ' + more' : ''}) for ₱${d.totalPrice?.toLocaleString() || 0}. Status: ${d.status}, payment ${d.paymentStatus}.`,
    risk,
    riskReasons: reasons,
    suggestedAction: action,
    model: 'static',
    fromCache: false,
    fallback: true,
  };
}

// ─── 2. Restock suggestions ───────────────────────────────────────────────
/**
 * For each inventory item, look at the last 30 days of sales/restocks to
 * compute a daily burn rate, then predict days-until-out and a suggested
 * reorder quantity. Optionally asks Gemini to phrase a one-line headline.
 *
 * Returns: { suggestions: [...], generatedAt, model, fallback }
 */
export async function suggestRestocks() {
  const key = cacheKey(['restocks', new Date().toISOString().slice(0, 13)]); // cache per-hour
  const cached = cacheGet(key, 60 * 60 * 1000);
  if (cached) return { ...cached, fromCache: true };

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [inventory, salesAgg, restockAgg] = await Promise.all([
    Inventory.find({ isActive: true }).lean(),
    StockMovement.aggregate([
      { $match: { type: 'sale', createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: '$inventory', sold: { $sum: { $abs: '$quantity' } }, lastSale: { $max: '$createdAt' } } },
    ]),
    StockMovement.aggregate([
      { $match: { type: 'restock', createdAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: '$inventory', received: { $sum: '$quantity' }, avgCost: { $avg: '$unitCost' }, lastSupplier: { $last: '$supplierSnapshot.name' }, lastRestock: { $max: '$createdAt' } } },
    ]),
  ]);

  const salesByItem = Object.fromEntries(salesAgg.map((s) => [String(s._id), s]));
  const restockByItem = Object.fromEntries(restockAgg.map((r) => [String(r._id), r]));

  // Compute a deterministic suggestion list FIRST. This is what the UI
  // primarily renders — Gemini is then asked only to add a phrasing flourish.
  const suggestions = inventory
    .map((inv) => {
      const sales = salesByItem[String(inv._id)] || { sold: 0, lastSale: null };
      const restock = restockByItem[String(inv._id)] || { received: 0, avgCost: 0, lastSupplier: null };
      const dailyBurn = sales.sold / 30;
      const available = (inv.stock || 0) - (inv.reservedStock || 0);
      const daysToEmpty = dailyBurn > 0 ? available / dailyBurn : Infinity;
      const minStock = inv.minStock || 10;
      const leadTimeDays = 7; // default assumption; future: per-supplier
      const safetyStock = Math.ceil(dailyBurn * leadTimeDays);
      const reorderTriggerStock = minStock + safetyStock;
      const needsReorder = available <= reorderTriggerStock || daysToEmpty < leadTimeDays * 1.5;
      // Reorder up to ~45 days of supply
      const suggestedQty = Math.max(0, Math.ceil(dailyBurn * 45) - available);

      return {
        inventoryId: inv._id,
        sku: inv.sku,
        name: inv.name,
        image: inv.image,
        category: inv.category,
        availableStock: available,
        minStock,
        dailyBurnRate: Math.round(dailyBurn * 10) / 10,
        daysToEmpty: Number.isFinite(daysToEmpty) ? Math.round(daysToEmpty) : null,
        needsReorder,
        urgency:
          daysToEmpty < leadTimeDays ? 'urgent' :
          daysToEmpty < leadTimeDays * 2 ? 'high' :
          available <= minStock ? 'medium' :
          'low',
        suggestedQty: needsReorder ? suggestedQty : 0,
        estimatedCost: needsReorder ? suggestedQty * (restock.avgCost || inv.price * 0.3) : 0,
        lastSupplier: restock.lastSupplier || null,
        avgUnitCost: Math.round((restock.avgCost || 0) * 100) / 100,
        lastRestockedAt: restock.lastRestock || null,
      };
    })
    .filter((s) => s.needsReorder)
    .sort((a, b) => {
      const rank = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (rank[a.urgency] ?? 9) - (rank[b.urgency] ?? 9);
    });

  // Optional headline — routed through the LLM provider chain (Ollama → Gemini → fallback)
  let headline = `${suggestions.length} ${suggestions.length === 1 ? 'item' : 'items'} need restocking`;
  if (suggestions.length > 0) {
    try {
      const top = suggestions.slice(0, 5).map((s) => `${s.name} (${s.urgency}, ${s.daysToEmpty}d left)`);
      const out = await llmGenerateText({
        prompt: `Write a one-sentence operations headline summarizing this restock situation in under 20 words. No emojis. No greeting. Just the headline.\n\n${top.join('\n')}`,
        cacheTtlSeconds: 60 * 60,
        cacheContext: { op: 'restock-headline', items: top.join('|') },
        maxTokens: 80,
      });
      const text = out.text.replace(/^["']|["']$/g, '');
      if (text && text.length < 200) headline = text;
    } catch {
      /* keep default headline */
    }
  }

  const out = {
    headline,
    suggestions,
    totalReorderCost: suggestions.reduce((s, x) => s + (x.estimatedCost || 0), 0),
    urgentCount: suggestions.filter((s) => s.urgency === 'urgent').length,
    generatedAt: new Date(),
    model: genAI ? MODEL : 'static',
    fromCache: false,
    fallback: !genAI,
  };
  cacheSet(key, out);
  return out;
}

// ─── 3. Production forecast ───────────────────────────────────────────────
/**
 * Predict production load for the next 7 days. Compares scheduled units
 * against capacity and stage throughput. Flags likely bottlenecks.
 *
 * Returns: {
 *   headline,
 *   nextSevenDays: [{date, scheduledUnits, capacity, utilization, status}],
 *   bottleneckStage,
 *   stageBacklog: { design_review: N, printing: N, ... },
 *   recommendations: [bullets],
 *   fallback
 * }
 */
export async function forecastProduction() {
  const key = cacheKey(['production-forecast', new Date().toISOString().slice(0, 13)]);
  const cached = cacheGet(key, 30 * 60 * 1000); // 30-min cache
  if (cached) return { ...cached, fromCache: true };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sevenDaysOut = new Date(today);
  sevenDaysOut.setUTCDate(sevenDaysOut.getUTCDate() + 7);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const [scheduledOrders, stageCounts, recentCompletions, capacityDoc] = await Promise.all([
    Order.find({
      status: { $in: ['approved', 'in_production'] },
      productionDate: { $gte: today, $lte: sevenDaysOut },
    }).select('productionDate productionStage totalQty productionPriority').lean(),
    Order.aggregate([
      { $match: { status: 'in_production' } },
      { $group: { _id: '$productionStage', count: { $sum: 1 }, units: { $sum: '$totalQty' } } },
    ]),
    ProductionLog.countDocuments({
      type: 'completed',
      createdAt: { $gte: sevenDaysAgo },
    }),
    ProductionCapacity.getOrCreate(),
  ]);

  // Per-day scheduled load
  const byDay = {};
  for (const o of scheduledOrders) {
    const k = new Date(o.productionDate).toISOString().slice(0, 10);
    if (!byDay[k]) byDay[k] = { date: k, scheduledUnits: 0, scheduledOrders: 0 };
    byDay[k].scheduledUnits += o.totalQty || 0;
    byDay[k].scheduledOrders += 1;
  }
  const overrideMap = Object.fromEntries(capacityDoc.overrides.map((o) => [o.date, o.capacity]));
  const nextSevenDays = [];
  const cur = new Date(today);
  let overCount = 0;
  let totalScheduled = 0;
  let totalCapacity = 0;
  while (cur < sevenDaysOut) {
    const k = cur.toISOString().slice(0, 10);
    const isWorking = capacityDoc.workingDays.includes(cur.getUTCDay());
    const capacity = overrideMap[k] !== undefined
      ? overrideMap[k]
      : (isWorking ? capacityDoc.defaultDailyCapacity : 0);
    const sched = byDay[k] || { scheduledUnits: 0, scheduledOrders: 0 };
    const utilization = capacity > 0 ? sched.scheduledUnits / capacity : 0;
    const status = capacity === 0 ? 'closed' : utilization >= 1 ? 'over' : utilization > 0.85 ? 'tight' : utilization > 0.5 ? 'healthy' : 'open';
    if (status === 'over') overCount += 1;
    totalScheduled += sched.scheduledUnits;
    totalCapacity += capacity;
    nextSevenDays.push({
      date: k,
      isWorking,
      scheduledUnits: sched.scheduledUnits,
      scheduledOrders: sched.scheduledOrders,
      capacity,
      utilization: Math.round(utilization * 100) / 100,
      status,
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // Stage backlog — find the heaviest stage
  const stageBacklog = Object.fromEntries(stageCounts.map((s) => [s._id, s.count]));
  const bottleneckStage = stageCounts.length > 0
    ? stageCounts.sort((a, b) => b.count - a.count)[0]?._id
    : null;
  const bottleneckCount = bottleneckStage ? stageBacklog[bottleneckStage] : 0;
  const dailyThroughput = recentCompletions / 7;
  const daysToClearBacklog = dailyThroughput > 0
    ? Math.ceil((Object.values(stageBacklog).reduce((s, n) => s + n, 0)) / dailyThroughput)
    : null;

  // Recommendations (rule-based; supplemented by Gemini headline below)
  const recommendations = [];
  if (overCount > 0) {
    recommendations.push(`${overCount} day${overCount === 1 ? '' : 's'} next week scheduled over capacity — consider rescheduling or adding a shift.`);
  }
  if (bottleneckStage && bottleneckCount > 5) {
    recommendations.push(`${bottleneckCount} orders queued at ${bottleneckStage.replace('_', ' ')} — likely bottleneck.`);
  }
  if (daysToClearBacklog && daysToClearBacklog > 7) {
    recommendations.push(`At current pace (${Math.round(dailyThroughput * 10) / 10}/day), the active backlog takes ${daysToClearBacklog} days to clear.`);
  }
  if (totalScheduled === 0) {
    recommendations.push('Nothing scheduled in the next 7 days — pull from the queue if approved orders exist.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Production load is well-balanced — keep dispatching as usual.');
  }

  let headline = totalScheduled === 0
    ? 'Next 7 days are open'
    : overCount > 0
    ? `${overCount} day${overCount === 1 ? '' : 's'} over capacity next week`
    : `${totalScheduled} units scheduled across ${nextSevenDays.filter(d => d.scheduledUnits > 0).length} days`;

  try {
    const out = await llmGenerateText({
      prompt:
        `Write a one-sentence operations headline in under 20 words summarizing this production situation:\n` +
        `- Total scheduled next 7 days: ${totalScheduled} units of ${totalCapacity || 'N/A'} capacity\n` +
        `- Days over capacity: ${overCount}\n` +
        `- Bottleneck stage: ${bottleneckStage || 'none'} (${bottleneckCount} orders)\n` +
        `- Daily throughput: ${Math.round(dailyThroughput * 10) / 10} orders\n` +
        `No greeting. Just the headline.`,
      cacheTtlSeconds: 30 * 60,
      cacheContext: {
        op: 'production-headline', totalScheduled, totalCapacity, overCount,
        bottleneckStage: bottleneckStage || '', dailyThroughput: Math.round(dailyThroughput * 10) / 10,
      },
      maxTokens: 80,
    });
    const text = out.text.replace(/^["']|["']$/g, '');
    if (text && text.length < 200) headline = text;
  } catch {
    /* keep default headline */
  }

  const out = {
    headline,
    nextSevenDays,
    totalScheduledUnits: totalScheduled,
    totalCapacity,
    overCount,
    bottleneckStage,
    bottleneckCount,
    stageBacklog,
    dailyThroughput: Math.round(dailyThroughput * 10) / 10,
    daysToClearBacklog,
    recommendations,
    generatedAt: new Date(),
    model: genAI ? MODEL : 'static',
    fromCache: false,
    fallback: !genAI,
  };
  cacheSet(key, out);
  return out;
}
