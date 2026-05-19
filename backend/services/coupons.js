import Coupon from '../models/Coupon.js';
import CouponRedemption from '../models/CouponRedemption.js';
import Order from '../models/Order.js';
import Inventory from '../models/Inventory.js';

/**
 * Coupon service — central algorithms for validation, discount calculation,
 * and redemption. Every coupon code path in the system MUST go through this
 * module so:
 *   1. The validation rules stay consistent between cart preview and order create
 *   2. The race-safe atomic increment for the global usage cap is in one place
 *   3. Refund → release flow is centralised
 *
 * The algorithm has three distinct phases:
 *
 *   PHASE 1 — validateCoupon(code, ctx)
 *     Cheap, side-effect-free check. Used by the cart UI to show the
 *     customer whether their code works BEFORE they hit "place order".
 *     Runs all eligibility constraints but does NOT increment usage.
 *
 *   PHASE 2 — calculateDiscount(coupon, ctx)
 *     Compute the actual peso amount this coupon takes off this cart.
 *     Pure function of (coupon, cart contents). No DB writes.
 *
 *   PHASE 3 — redeemCoupon(coupon, order)
 *     Atomically increment usedCount with a guard so concurrent customers
 *     can't oversell the cap. Writes a CouponRedemption row. Called only
 *     after the order has been successfully saved.
 *
 *   PHASE 4 — releaseCouponForOrder(order, reason)
 *     Called when an order is cancelled/refunded. Decrements usedCount,
 *     marks redemption rows as released, allows the customer to re-use
 *     the code on a different order.
 */

// ─── PHASE 1: Validation ───────────────────────────────────────────────────

/**
 * Validate that `code` is usable for `customer` with `cartItems`.
 *
 * Returns:
 *   { valid: true, coupon, discount } if all checks pass
 *   { valid: false, reason } otherwise
 *
 * `cartItems` shape: [{ sku, name, quantity, unitPrice, category? }, ...]
 * `customerId` is required for per-customer limit + first-time check.
 *
 * This is the ONLY validation path — both /validate (cart preview) and
 * order-create use it, guaranteeing the customer sees the same answer
 * they'll get when they actually try to place the order.
 */
export async function validateCoupon({ code, cartItems, customerId, options = {} }) {
  if (!code || !String(code).trim()) {
    return { valid: false, reason: 'Coupon code required', code: 'EMPTY' };
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const coupon = await Coupon.findOne({ code: normalizedCode });
  if (!coupon) {
    return { valid: false, reason: 'Coupon code not found', code: 'NOT_FOUND' };
  }
  if (!coupon.isActive) {
    return { valid: false, reason: 'This coupon is no longer active', code: 'INACTIVE' };
  }

  const now = new Date();
  if (coupon.validFrom && now < coupon.validFrom) {
    return {
      valid: false,
      reason: `This coupon starts ${coupon.validFrom.toLocaleDateString()}`,
      code: 'NOT_YET_VALID',
    };
  }
  if (coupon.validUntil && now > coupon.validUntil) {
    return { valid: false, reason: 'This coupon has expired', code: 'EXPIRED' };
  }

  // Global usage cap — count active (not released) redemptions
  if (coupon.usageLimit > 0) {
    const used = await CouponRedemption.countDocuments({
      coupon: coupon._id,
      released: { $ne: true },
    });
    if (used >= coupon.usageLimit) {
      return { valid: false, reason: 'This coupon has reached its usage limit', code: 'GLOBAL_LIMIT' };
    }
  }

  // Per-customer cap
  if (customerId && coupon.usageLimitPerCustomer > 0) {
    const personalUsed = await CouponRedemption.countDocuments({
      coupon: coupon._id,
      customer: customerId,
      released: { $ne: true },
    });
    if (personalUsed >= coupon.usageLimitPerCustomer) {
      return {
        valid: false,
        reason: `You've already used this coupon ${personalUsed} time${personalUsed === 1 ? '' : 's'}`,
        code: 'PERSONAL_LIMIT',
      };
    }
  }

  // First-time customer check
  if (coupon.firstTimeCustomerOnly && customerId) {
    const priorOrders = await Order.countDocuments({
      customer: customerId,
      status: { $nin: ['cancelled', 'rejected'] },
    });
    if (priorOrders > 0) {
      return {
        valid: false,
        reason: 'This coupon is for first-time customers only',
        code: 'NOT_FIRST_TIME',
      };
    }
  }

  // Cart contents check — must run AFTER we know the cart isn't empty
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return { valid: false, reason: 'Cart is empty', code: 'EMPTY_CART' };
  }

  const subtotal = cartItems.reduce(
    (sum, it) => sum + Number(it.quantity || 0) * Number(it.unitPrice || 0),
    0
  );
  const totalQty = cartItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  if (coupon.minOrderValue > 0 && subtotal < coupon.minOrderValue) {
    return {
      valid: false,
      reason: `Add ₱${(coupon.minOrderValue - subtotal).toLocaleString()} more to use this coupon (min ₱${coupon.minOrderValue.toLocaleString()})`,
      code: 'MIN_ORDER_VALUE',
    };
  }

  // Bulk order exclusion (matches Order.isBulk threshold of 20 units)
  if (coupon.excludeBulkOrders && totalQty >= 20) {
    return {
      valid: false,
      reason: 'This coupon does not apply to bulk orders',
      code: 'BULK_EXCLUDED',
    };
  }

  // Category restriction — enrich missing categories from Inventory
  if (coupon.applicableCategories.length > 0) {
    const cartItemsWithCategory = await enrichWithCategory(cartItems);
    const eligible = cartItemsWithCategory.some((it) =>
      coupon.applicableCategories.includes(it.category)
    );
    if (!eligible) {
      return {
        valid: false,
        reason: `This coupon only applies to ${coupon.applicableCategories.join(', ')}`,
        code: 'CATEGORY_MISMATCH',
      };
    }
  }

  // SKU restriction
  if (coupon.applicableSkus.length > 0) {
    const eligible = cartItems.some((it) => coupon.applicableSkus.includes(it.sku));
    if (!eligible) {
      return {
        valid: false,
        reason: 'This coupon does not apply to any items in your cart',
        code: 'SKU_MISMATCH',
      };
    }
  }

  // All checks pass — compute the discount so the cart UI can show savings
  const discount = await calculateDiscount({ coupon, cartItems, subtotal });

  return { valid: true, coupon, discount, subtotal };
}

/**
 * Enrich cart items with category from Inventory if not already present.
 * Cached per-call to avoid N+1 lookups.
 */
async function enrichWithCategory(cartItems) {
  if (cartItems.every((it) => it.category)) return cartItems;
  const skus = cartItems.map((it) => it.sku);
  const inv = await Inventory.find({ sku: { $in: skus } }).select('sku category').lean();
  const bySku = Object.fromEntries(inv.map((i) => [i.sku, i.category]));
  return cartItems.map((it) => ({ ...it, category: it.category || bySku[it.sku] || '' }));
}

// ─── PHASE 2: Discount calculation ─────────────────────────────────────────

/**
 * Pure function: given a coupon and a cart, return the discount in PHP.
 * No DB writes. Used by both /validate (preview) and order-create (lock in).
 *
 * Returns: { amount, breakdown, freeShipping }
 */
export async function calculateDiscount({ coupon, cartItems, subtotal }) {
  const sub = Number(subtotal) || cartItems.reduce(
    (sum, it) => sum + Number(it.quantity || 0) * Number(it.unitPrice || 0),
    0
  );

  let amount = 0;
  const breakdown = [];

  switch (coupon.type) {
    case 'percentage': {
      // value is the percentage (1-100)
      amount = Math.round((sub * coupon.value / 100) * 100) / 100;
      breakdown.push(`${coupon.value}% of ₱${sub.toLocaleString()}`);
      // Cap at maxDiscount if set
      if (coupon.maxDiscount > 0 && amount > coupon.maxDiscount) {
        breakdown.push(`Capped at ₱${coupon.maxDiscount.toLocaleString()}`);
        amount = coupon.maxDiscount;
      }
      break;
    }

    case 'fixed_amount': {
      // value is a flat PHP amount
      amount = Math.min(coupon.value, sub); // never exceed cart total
      breakdown.push(`Flat ₱${coupon.value.toLocaleString()} off`);
      break;
    }

    case 'free_shipping': {
      // Discount handled by external shipping calc; signal via flag
      breakdown.push('Free shipping applied');
      return { amount: 0, breakdown, freeShipping: true };
    }

    case 'bogo': {
      // Buy `value` items, get 1 free. Algorithm: sort cart items by unit
      // price desc, group items in chunks of (value+1), the cheapest item in
      // each group is the freebie. Operates on EXPANDED units, not lines.
      const eligible = coupon.applicableSkus.length > 0
        ? cartItems.filter((it) => coupon.applicableSkus.includes(it.sku))
        : (coupon.applicableCategories.length > 0
            ? (await enrichWithCategory(cartItems)).filter((it) =>
                coupon.applicableCategories.includes(it.category))
            : cartItems);

      // Expand to per-unit array so the algorithm works on individual items
      const units = [];
      for (const item of eligible) {
        for (let i = 0; i < (item.quantity || 0); i++) units.push(Number(item.unitPrice || 0));
      }
      units.sort((a, b) => b - a); // expensive first

      const buyCount = Math.max(1, Math.floor(coupon.value)); // "buy N"
      const groupSize = buyCount + 1; // every group of (N+1) gets 1 free
      let freeUnits = 0;
      for (let i = groupSize - 1; i < units.length; i += groupSize) {
        amount += units[i]; // cheapest unit in this group is free
        freeUnits += 1;
      }
      breakdown.push(`Buy ${buyCount} get 1 free × ${freeUnits} freebie${freeUnits === 1 ? '' : 's'}`);
      break;
    }

    default:
      amount = 0;
  }

  // Never refund negative cart — cap discount at subtotal
  amount = Math.max(0, Math.min(amount, sub));
  // Round to 2 decimals to avoid floating-point pesos like ₱149.999...
  amount = Math.round(amount * 100) / 100;

  return { amount, breakdown, freeShipping: false };
}

// ─── PHASE 3: Redemption (commit) ──────────────────────────────────────────

/**
 * Atomically claim a usage slot for `coupon` and persist the redemption.
 *
 * Race safety: the global usageLimit check uses a conditional
 * findOneAndUpdate that only fires when usedCount < usageLimit, so two
 * concurrent customers can't both succeed against a single remaining use.
 *
 * If the redemption fails (race lost), throws an Error with code
 * 'GLOBAL_LIMIT' so the caller can roll back the order.
 *
 * Per-customer limit isn't atomically guarded (a customer placing two
 * orders simultaneously with the same code could in theory exceed it), but
 * that's an acceptable trade-off — same customer racing themselves is rare,
 * and we'd just over-charge them by one use which is recoverable.
 */
export async function redeemCoupon({ coupon, order, customer, discountAmount, subtotal }) {
  // Atomic increment with conditional guard. If usageLimit is 0 (unlimited)
  // we drop the condition.
  const query = coupon.usageLimit > 0
    ? { _id: coupon._id, isActive: true, usedCount: { $lt: coupon.usageLimit } }
    : { _id: coupon._id, isActive: true };

  const updated = await Coupon.findOneAndUpdate(
    query,
    { $inc: { usedCount: 1 } },
    { new: true }
  );

  if (!updated) {
    const err = new Error('Coupon usage limit reached');
    err.code = 'GLOBAL_LIMIT';
    throw err;
  }

  // Write the redemption row — append-only audit. If this fails, decrement
  // the counter we just incremented (best-effort roll-back).
  try {
    const redemption = await CouponRedemption.create({
      coupon: coupon._id,
      couponCode: coupon.code,
      customer: customer._id || customer,
      order: order._id,
      discountType: coupon.type,
      discountAmount,
      cartSubtotal: subtotal,
      cartItemCount: order.items?.length || 0,
    });
    return { redemption, coupon: updated };
  } catch (err) {
    // Roll back the usedCount increment so we don't drift
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: -1 } }).catch(() => {});
    throw err;
  }
}

// ─── PHASE 4: Release on refund/cancel ────────────────────────────────────

/**
 * When an order is refunded/cancelled, release its coupon redemption so:
 *   - The global usedCount goes back down
 *   - The customer can re-use the code on a different order
 *   - Reports correctly exclude this redemption
 *
 * Marks the redemption row as `released: true` (instead of deleting) so the
 * audit trail stays intact.
 */
export async function releaseCouponForOrder({ order, reason = 'Order cancelled' }) {
  if (!order?.couponCode) return { released: 0 };

  const redemptions = await CouponRedemption.find({
    order: order._id,
    released: { $ne: true },
  });

  let released = 0;
  for (const r of redemptions) {
    r.released = true;
    r.releasedAt = new Date();
    r.releaseReason = reason;
    await r.save();
    // Decrement coupon usedCount, clamped to 0 to avoid negatives
    await Coupon.updateOne(
      { _id: r.coupon, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } }
    ).catch(() => {});
    released += 1;
  }
  return { released };
}

// ─── Admin reporting helpers ───────────────────────────────────────────────

/**
 * Aggregate stats per coupon for the admin dashboard. One pass over the
 * redemption collection.
 */
export async function getCouponStats(couponId) {
  const matchStage = couponId
    ? { $match: { coupon: typeof couponId === 'string' ? new (await import('mongoose')).default.Types.ObjectId(couponId) : couponId } }
    : { $match: {} };

  const agg = await CouponRedemption.aggregate([
    matchStage,
    {
      $group: {
        _id: '$coupon',
        totalRedemptions: { $sum: 1 },
        activeRedemptions: {
          $sum: { $cond: [{ $eq: ['$released', true] }, 0, 1] },
        },
        releasedRedemptions: {
          $sum: { $cond: [{ $eq: ['$released', true] }, 1, 0] },
        },
        totalDiscount: {
          $sum: { $cond: [{ $eq: ['$released', true] }, 0, '$discountAmount'] },
        },
        avgDiscount: { $avg: '$discountAmount' },
        uniqueCustomers: { $addToSet: '$customer' },
        firstUsed: { $min: '$redeemedAt' },
        lastUsed: { $max: '$redeemedAt' },
      },
    },
    {
      $project: {
        _id: 0,
        couponId: '$_id',
        totalRedemptions: 1,
        activeRedemptions: 1,
        releasedRedemptions: 1,
        totalDiscount: 1,
        avgDiscount: 1,
        uniqueCustomerCount: { $size: '$uniqueCustomers' },
        firstUsed: 1,
        lastUsed: 1,
      },
    },
  ]);
  return agg;
}
