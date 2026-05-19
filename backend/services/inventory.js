import Inventory from '../models/Inventory.js';
import StockMovement from '../models/StockMovement.js';
import Order from '../models/Order.js';

/**
 * Centralized inventory service. Every stock change in the system MUST go
 * through one of these helpers so:
 *   1. The StockMovement audit log stays complete
 *   2. The math is consistent (no double-counts, no negatives)
 *   3. Side-effects like reservations are handled correctly
 *   4. Race conditions are minimised via $inc atomic ops
 *
 * Vocabulary:
 *   - stock           = physical inventory we currently hold
 *   - reservedStock   = stock pre-allocated to orders not yet shipped
 *   - available       = stock - reservedStock (what new orders can claim)
 *
 * State transitions during an order lifecycle:
 *
 *   Order placed (COD or pending payment):
 *     reserveStockForOrder() → reservedStock += qty (stock unchanged)
 *
 *   Order paid / shipped:
 *     consumeReservedForOrder() → stock -= qty, reservedStock -= qty
 *
 *   Order cancelled / refunded / rejected:
 *     releaseReservedForOrder() → reservedStock -= qty (stock unchanged)
 *
 *   Order shipped without prior reservation (legacy):
 *     deductStockForOrder() → stock -= qty (no reservation involved)
 *
 * Each helper writes a StockMovement row keyed back to the order for
 * end-to-end traceability.
 */

/**
 * Validate that enough AVAILABLE stock exists for the requested items.
 * Returns { ok: true } or { ok: false, errors: [{ sku, name, available, needed }] }.
 *
 * Use BEFORE creating an order. The actual reservation happens via
 * reserveStockForOrder() which is the canonical mutation path.
 */
export async function validateOrderStock(items) {
  const errors = [];
  for (const it of items) {
    const inv = await Inventory.findOne({ sku: it.sku });
    if (!inv) {
      errors.push({ sku: it.sku, name: it.name, error: 'SKU not found' });
      continue;
    }
    const available = (inv.stock || 0) - (inv.reservedStock || 0);
    if (available < Number(it.quantity)) {
      errors.push({
        sku: it.sku,
        name: inv.name,
        available,
        needed: Number(it.quantity),
        error: `Only ${available} available — ${it.quantity} requested`,
      });
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Atomically reserve stock for an order. Increments reservedStock without
 * touching the physical stock count — that happens later when the order is
 * confirmed paid + shipped.
 *
 * Uses $inc so concurrent writers don't lose updates. The math fail-safe
 * uses a conditional update that only fires if available stock is still
 * enough; if not, we report the SKU back.
 */
export async function reserveStockForOrder({ order, actor }) {
  const movements = [];
  const failed = [];

  for (const item of order.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    // Conditional $inc: only succeeds if available >= qty
    const result = await Inventory.findOneAndUpdate(
      {
        sku: item.sku,
        $expr: { $gte: [{ $subtract: ['$stock', { $ifNull: ['$reservedStock', 0] }] }, qty] },
      },
      { $inc: { reservedStock: qty } },
      { new: true }
    );

    if (!result) {
      failed.push({ sku: item.sku, name: item.name });
      continue;
    }

    movements.push(
      await StockMovement.create({
        inventory: result._id,
        inventorySku: result.sku,
        inventoryName: result.name,
        type: 'reservation',
        quantity: 0,
        reservationDelta: qty,
        balanceBefore: result.stock,
        balanceAfter: result.stock,
        relatedOrder: order._id,
        notes: `Reserved for order #${String(order._id).slice(-6)}`,
        performedBy: actor?.userId,
        performedByName: actor?.name || '',
        performedByRole: actor?.role || '',
      })
    );
  }

  return { reserved: movements.length, failed };
}

/**
 * Convert a previously-reserved stock to actually-deducted stock when an
 * order is confirmed paid / shipped. Both stock and reservedStock decrement.
 *
 * Safe to call even if items weren't pre-reserved — reservedStock is
 * clamped to 0 so it won't go negative.
 */
export async function consumeReservedForOrder({ order, actor, reason = 'Order fulfilled' }) {
  for (const item of order.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const inv = await Inventory.findOne({ sku: item.sku });
    if (!inv) continue;
    const balanceBefore = inv.stock;

    // Use $inc with a guard so stock never goes negative
    const updated = await Inventory.findOneAndUpdate(
      { _id: inv._id, stock: { $gte: qty } },
      {
        $inc: { stock: -qty, reservedStock: -Math.min(qty, inv.reservedStock || 0) },
      },
      { new: true }
    );
    if (!updated) {
      // Stock somehow went below qty between reads — log and continue with
      // partial deduction. In production this would be an error worth Sentry'ing.
      console.error(`consumeReservedForOrder: ${item.sku} stock went below qty (${inv.stock} < ${qty})`);
      continue;
    }

    await StockMovement.create({
      inventory: updated._id,
      inventorySku: updated.sku,
      inventoryName: updated.name,
      type: 'sale',
      quantity: -qty,
      reservationDelta: -Math.min(qty, inv.reservedStock || 0),
      balanceBefore,
      balanceAfter: updated.stock,
      relatedOrder: order._id,
      notes: reason,
      performedBy: actor?.userId,
      performedByName: actor?.name || '',
      performedByRole: actor?.role || '',
    });
  }
}

/**
 * Release reservation when an order is cancelled / rejected / refunded /
 * expired. reservedStock decrements, stock stays unchanged.
 */
export async function releaseReservedForOrder({ order, actor, reason = 'Order cancelled' }) {
  for (const item of order.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const inv = await Inventory.findOne({ sku: item.sku });
    if (!inv) continue;
    const reservedNow = inv.reservedStock || 0;
    const releaseAmt = Math.min(qty, reservedNow);
    if (releaseAmt === 0) continue;

    const updated = await Inventory.findByIdAndUpdate(
      inv._id,
      { $inc: { reservedStock: -releaseAmt } },
      { new: true }
    );

    await StockMovement.create({
      inventory: updated._id,
      inventorySku: updated.sku,
      inventoryName: updated.name,
      type: 'release',
      quantity: 0,
      reservationDelta: -releaseAmt,
      balanceBefore: updated.stock,
      balanceAfter: updated.stock,
      relatedOrder: order._id,
      reason: reason,
      performedBy: actor?.userId,
      performedByName: actor?.name || '',
      performedByRole: actor?.role || '',
    });
  }
}

/**
 * If an order is shipped / delivered without prior reservation (e.g. ad-hoc
 * in-person sales added by admin), deduct stock directly with a sale entry.
 */
export async function deductStockForOrder({ order, actor, reason = 'Direct sale' }) {
  for (const item of order.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const inv = await Inventory.findOne({ sku: item.sku });
    if (!inv) continue;

    const updated = await Inventory.findOneAndUpdate(
      { _id: inv._id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true }
    );
    if (!updated) {
      console.error(`deductStockForOrder: insufficient stock for ${item.sku}`);
      continue;
    }

    await StockMovement.create({
      inventory: updated._id,
      inventorySku: updated.sku,
      inventoryName: updated.name,
      type: 'sale',
      quantity: -qty,
      balanceBefore: inv.stock,
      balanceAfter: updated.stock,
      relatedOrder: order._id,
      notes: reason,
      performedBy: actor?.userId,
      performedByName: actor?.name || '',
      performedByRole: actor?.role || '',
    });
  }
}

/**
 * Restore stock when an item is returned by the customer. Audit-logged as
 * a `return` movement so refunds can be reconciled.
 */
export async function restockReturnForOrder({ order, actor, reason = 'Customer return' }) {
  for (const item of order.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const inv = await Inventory.findOne({ sku: item.sku });
    if (!inv) continue;
    const balanceBefore = inv.stock;
    const updated = await Inventory.findByIdAndUpdate(
      inv._id,
      { $inc: { stock: qty } },
      { new: true }
    );

    await StockMovement.create({
      inventory: updated._id,
      inventorySku: updated.sku,
      inventoryName: updated.name,
      type: 'return',
      quantity: qty,
      balanceBefore,
      balanceAfter: updated.stock,
      relatedOrder: order._id,
      reason: reason,
      performedBy: actor?.userId,
      performedByName: actor?.name || '',
      performedByRole: actor?.role || '',
    });
  }
}

// ─── Reservation expiry sweep ─────────────────────────────────────────────

/**
 * Sweep orders that have been awaiting payment for too long. Releases their
 * reservations so the stock becomes available to other shoppers.
 *
 * Intended to be run periodically (every 10–15 minutes). Idempotent —
 * running it twice is safe.
 */
export async function expireStaleReservations({ olderThanHours = 24 } = {}) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
  const stale = await Order.find({
    status: { $in: ['pending', 'approved'] },
    paymentStatus: { $in: ['pending', 'awaiting_payment', 'partial'] },
    createdAt: { $lt: cutoff },
  });

  let released = 0;
  for (const order of stale) {
    try {
      await releaseReservedForOrder({
        order,
        actor: { name: 'System (reservation expiry)', role: 'system' },
        reason: `Reservation expired after ${olderThanHours}h without payment`,
      });
      // Mark the order as expired so it doesn't keep getting picked up
      order.status = 'cancelled';
      order.notes = (order.notes || '') + ` [auto-cancelled: payment timeout ${olderThanHours}h]`;
      await order.save();
      released += 1;
    } catch (err) {
      console.error('expireStaleReservations failed for order', order._id, err.message);
    }
  }
  return { swept: stale.length, released };
}

// ─── Low-stock detection ──────────────────────────────────────────────────

/**
 * List items currently at or below their `minStock` threshold.
 * Used by the dashboard low-stock card + restock-suggestions service.
 */
export async function listLowStock() {
  const all = await Inventory.find({ isActive: true });
  return all
    .filter((i) => (i.stock || 0) - (i.reservedStock || 0) <= (i.minStock || 10))
    .map((i) => ({
      id: i._id,
      sku: i.sku,
      name: i.name,
      available: (i.stock || 0) - (i.reservedStock || 0),
      stock: i.stock || 0,
      reserved: i.reservedStock || 0,
      minStock: i.minStock || 10,
    }))
    .sort((a, b) => a.available - b.available);
}
