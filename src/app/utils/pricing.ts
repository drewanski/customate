/**
 * pricing.ts — shared estimation engine (frontend mirror).
 *
 * Custom merch can't have a "final price" until the admin reviews the design,
 * but we still owe the customer a *useful* estimate at the cart so they know
 * the rough ballpark. This module computes that estimate with a transparent,
 * itemized breakdown.
 *
 * Keep in lock-step with backend/utils/pricing.js — the two files implement
 * the same formula so the customer's estimate matches the admin's pre-fill
 * when the admin opens the Quote Builder.
 *
 * Final price is set by the admin via the Quote Builder; this is purely an
 * estimate shown on cart/checkout/order-tracking with a disclaimer.
 */

// ── Base price per shirt color ───────────────────────────────────────
// Source: business owner specification.
export const BASE_PRICE_WHITE = 240;
export const BASE_PRICE_COLORED = 250;

// ── Fabric upcharges (peso) — paid on TOP of base ────────────────────
// Set per the available fabrics in PRODUCT_MODELS / Inventory.fabrics.
export const FABRIC_UPCHARGE: Record<string, number> = {
  cotton: 0,
  poly: 30,
  drifit: 80,
  'dri-fit': 80,
  jersey: 60,
  linen: 100,
  silk: 150,
  cotton_poly: 40,
  'cotton-poly': 40,
};

// ── Decal coverage tiers ──────────────────────────────────────────────
// `scale` is a normalised 0–1 ratio of the decal's bounding box vs the
// canvas. We rank into four tiers because printing cost jumps non-linearly
// (a small chest logo vs a full-front print is a 4× cost difference IRL).
export type DecalSizeTier = 'small' | 'medium' | 'large' | 'xl';

export const DECAL_SURCHARGE: Record<DecalSizeTier, number> = {
  small: 30,   // < 15% — chest badge / small logo
  medium: 70,  // 15-40% — typical front graphic
  large: 120,  // 40-70% — large front print
  xl: 180,     // > 70% — full coverage
};

export function classifyDecalSize(scale: number): DecalSizeTier {
  const s = Math.max(0, Math.min(1, Number(scale) || 0));
  if (s < 0.15) return 'small';
  if (s < 0.40) return 'medium';
  if (s < 0.70) return 'large';
  return 'xl';
}

// Text decals are ~50% cheaper to produce than image decals at the same size.
export const TEXT_DECAL_DISCOUNT = 0.5;

// ── Rush fee (% of subtotal) ─────────────────────────────────────────
export const RUSH_MULTIPLIER: Record<string, number> = {
  standard: 0,
  express: 0.10,
  rush: 0.20,
  priority: 0.40,
};

// ── Shipping ──────────────────────────────────────────────────────────
// Free over ₱500, ₱100 otherwise. Pickup is always free.
export const SHIPPING_FEE_FLAT = 100;
export const SHIPPING_FREE_THRESHOLD = 500;

// ── Multi-print-area surcharge ───────────────────────────────────────
export const PRINT_AREA_SURCHARGE = 50;  // +₱50 per area after the first

export interface DecalLike {
  type?: 'text' | 'image';
  scale?: number;
}

export interface ItemCustomization {
  color?: string;
  fabric?: string;
  fabricLabel?: string;
  text?: string;
  image?: string;
  printAreas?: number;
  decals?: DecalLike[];
}

export interface ItemLike {
  sku?: string;
  name?: string;
  quantity?: number;
  customization?: ItemCustomization;
}

export interface UnitEstimate {
  base: number;
  baseLabel: string;
  fabricUpcharge: number;
  fabricLabel: string;
  decalSurcharges: { tier: DecalSizeTier; type: 'text' | 'image'; amount: number }[];
  decalTotal: number;
  multiSideSurcharge: number;
  printAreas: number;
  unit: number;
  /** Range bounds — give the customer a ballpark band. */
  min: number;
  max: number;
}

/**
 * Estimate the per-unit price for a single line item.
 *
 * The breakdown is the important part — it lets the cart show:
 *   "₱250 base + ₱80 Dri-Fit + ₱120 large front print = ₱450/each"
 * so the customer can see *why* it costs what it does.
 */
export function estimateUnitPrice(item: ItemLike): UnitEstimate {
  const c = item.customization || {};

  // Base price — white vs colored.
  const colorStr = String(c.color || '').toLowerCase();
  const isWhite = colorStr.includes('white') || colorStr === '#ffffff' || colorStr === 'fff';
  const base = isWhite ? BASE_PRICE_WHITE : BASE_PRICE_COLORED;
  const baseLabel = isWhite ? 'Base (white shirt)' : 'Base (colored shirt)';

  // Fabric upcharge.
  const fabricKey = String(c.fabric || '').toLowerCase().replace(/[\s_-]+/g, '');
  const fabricUpcharge = (() => {
    // Try fuzzy match — fabric codes vary slightly between sources.
    for (const [k, v] of Object.entries(FABRIC_UPCHARGE)) {
      if (k.replace(/[\s_-]+/g, '').toLowerCase() === fabricKey) return v;
    }
    return 0;
  })();
  const fabricLabel = c.fabricLabel || c.fabric || 'Cotton';

  // Decal surcharges — each decal's size class contributes a fee.
  const decals = Array.isArray(c.decals) ? c.decals : [];
  const decalSurcharges: { tier: DecalSizeTier; type: 'text' | 'image'; amount: number }[] = [];

  if (decals.length > 0) {
    for (const d of decals) {
      const tier = classifyDecalSize(d.scale ?? 0.3);
      const type: 'text' | 'image' = d.type === 'text' ? 'text' : 'image';
      const base = DECAL_SURCHARGE[tier];
      const amount = Math.round(type === 'text' ? base * TEXT_DECAL_DISCOUNT : base);
      decalSurcharges.push({ tier, type, amount });
    }
  } else {
    // Legacy customization shape (single text + single image fields).
    // Each counts as a medium decal.
    if (c.text) decalSurcharges.push({ tier: 'medium', type: 'text', amount: Math.round(DECAL_SURCHARGE.medium * TEXT_DECAL_DISCOUNT) });
    if (c.image) decalSurcharges.push({ tier: 'medium', type: 'image', amount: DECAL_SURCHARGE.medium });
  }
  const decalTotal = decalSurcharges.reduce((s, x) => s + x.amount, 0);

  // Multi-side surcharge.
  const printAreas = Math.max(1, Number(c.printAreas) || 1);
  const multiSideSurcharge = Math.max(0, printAreas - 1) * PRINT_AREA_SURCHARGE;

  const unit = base + fabricUpcharge + decalTotal + multiSideSurcharge;

  return {
    base,
    baseLabel,
    fabricUpcharge,
    fabricLabel,
    decalSurcharges,
    decalTotal,
    multiSideSurcharge,
    printAreas,
    unit,
    // Range: -5% / +15% spread for uncertainty (admin may add minor
    // production extras like specialty thread, larger size XL+ shirts, etc.)
    min: Math.round(unit * 0.95),
    max: Math.round(unit * 1.15),
  };
}

export interface OrderEstimateOptions {
  urgencyTier?: string;
  deliveryMethod?: 'delivery' | 'pickup';
}

export interface OrderEstimate {
  items: {
    sku?: string;
    name?: string;
    quantity: number;
    unit: UnitEstimate;
    lineMin: number;
    lineMax: number;
  }[];
  subtotalMin: number;
  subtotalMax: number;
  rushPct: number;
  rushMin: number;
  rushMax: number;
  shippingFee: number;
  totalMin: number;
  totalMax: number;
}

/**
 * Estimate the order total — calls estimateUnitPrice() per item then layers
 * on rush + shipping. Returns a range; final number is set by the admin via
 * the Quote Builder once the design has been reviewed.
 */
export function estimateOrderTotal(items: ItemLike[], options: OrderEstimateOptions = {}): OrderEstimate {
  const itemEstimates = items.map((it) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const unit = estimateUnitPrice(it);
    return {
      sku: it.sku,
      name: it.name,
      quantity: qty,
      unit,
      lineMin: unit.min * qty,
      lineMax: unit.max * qty,
    };
  });

  const subtotalMin = itemEstimates.reduce((s, x) => s + x.lineMin, 0);
  const subtotalMax = itemEstimates.reduce((s, x) => s + x.lineMax, 0);

  const rushPct = RUSH_MULTIPLIER[options.urgencyTier || 'standard'] ?? 0;
  const rushMin = Math.round(subtotalMin * rushPct);
  const rushMax = Math.round(subtotalMax * rushPct);

  const isPickup = options.deliveryMethod === 'pickup';
  // Use the LOW estimate for the shipping threshold check (more
  // conservative — if there's any chance the order will be over the
  // threshold, customer might think shipping is free when it isn't).
  const shippingFee = isPickup ? 0 : (subtotalMin >= SHIPPING_FREE_THRESHOLD ? 0 : SHIPPING_FLAT_FEE());

  return {
    items: itemEstimates,
    subtotalMin,
    subtotalMax,
    rushPct,
    rushMin,
    rushMax,
    shippingFee,
    totalMin: subtotalMin + rushMin + shippingFee,
    totalMax: subtotalMax + rushMax + shippingFee,
  };
}

function SHIPPING_FLAT_FEE() { return SHIPPING_FEE_FLAT; }

/**
 * Format a price range as "₱2,400 – ₱4,200" for compact display.
 * When min == max, returns a single number.
 */
export function formatRange(min: number, max: number): string {
  const f = (n: number) => `₱${Math.round(n).toLocaleString()}`;
  if (Math.round(min) === Math.round(max)) return f(min);
  return `${f(min)} – ${f(max)}`;
}
