/**
 * pricing.js — server-side estimation engine.
 *
 * Mirror of src/app/utils/pricing.ts. Keep the two in lock-step. See
 * the .ts file for the longer comments — this file holds the same
 * formulas in JS so the API can pre-fill the admin Quote Builder.
 *
 * The Quote Builder admin sees this as the starting point; the admin
 * sets the FINAL price. This file never produces a final number, only
 * an estimate.
 */

export const BASE_PRICE_WHITE = 240;
export const BASE_PRICE_COLORED = 250;

export const FABRIC_UPCHARGE = {
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

export const DECAL_SURCHARGE = {
  small: 30,
  medium: 70,
  large: 120,
  xl: 180,
};

export function classifyDecalSize(scale) {
  const s = Math.max(0, Math.min(1, Number(scale) || 0));
  if (s < 0.15) return 'small';
  if (s < 0.40) return 'medium';
  if (s < 0.70) return 'large';
  return 'xl';
}

export const TEXT_DECAL_DISCOUNT = 0.5;

export const RUSH_MULTIPLIER = {
  standard: 0,
  express: 0.10,
  rush: 0.20,
  priority: 0.40,
};

export const SHIPPING_FEE_FLAT = 100;
export const SHIPPING_FREE_THRESHOLD = 500;
export const PRINT_AREA_SURCHARGE = 50;

export function estimateUnitPrice(item) {
  const c = (item && item.customization) || {};

  const colorStr = String(c.color || '').toLowerCase();
  const isWhite = colorStr.includes('white') || colorStr === '#ffffff' || colorStr === 'fff';
  const base = isWhite ? BASE_PRICE_WHITE : BASE_PRICE_COLORED;
  const baseLabel = isWhite ? 'Base (white shirt)' : 'Base (colored shirt)';

  const fabricKey = String(c.fabric || '').toLowerCase().replace(/[\s_-]+/g, '');
  let fabricUpcharge = 0;
  for (const [k, v] of Object.entries(FABRIC_UPCHARGE)) {
    if (k.replace(/[\s_-]+/g, '').toLowerCase() === fabricKey) { fabricUpcharge = v; break; }
  }
  const fabricLabel = c.fabricLabel || c.fabric || 'Cotton';

  const decals = Array.isArray(c.decals) ? c.decals : [];
  const decalSurcharges = [];
  if (decals.length > 0) {
    for (const d of decals) {
      const tier = classifyDecalSize(d.scale != null ? d.scale : 0.3);
      const type = d.type === 'text' ? 'text' : 'image';
      const base = DECAL_SURCHARGE[tier];
      const amount = Math.round(type === 'text' ? base * TEXT_DECAL_DISCOUNT : base);
      decalSurcharges.push({ tier, type, amount });
    }
  } else {
    if (c.text)  decalSurcharges.push({ tier: 'medium', type: 'text',  amount: Math.round(DECAL_SURCHARGE.medium * TEXT_DECAL_DISCOUNT) });
    if (c.image) decalSurcharges.push({ tier: 'medium', type: 'image', amount: DECAL_SURCHARGE.medium });
  }
  const decalTotal = decalSurcharges.reduce((s, x) => s + x.amount, 0);

  const printAreas = Math.max(1, Number(c.printAreas) || 1);
  const multiSideSurcharge = Math.max(0, printAreas - 1) * PRINT_AREA_SURCHARGE;

  const unit = base + fabricUpcharge + decalTotal + multiSideSurcharge;
  return {
    base, baseLabel, fabricUpcharge, fabricLabel,
    decalSurcharges, decalTotal,
    multiSideSurcharge, printAreas,
    unit,
    min: Math.round(unit * 0.95),
    max: Math.round(unit * 1.15),
  };
}

export function estimateOrderTotal(items, options = {}) {
  const itemEstimates = (items || []).map((it) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const unit = estimateUnitPrice(it);
    return {
      sku: it.sku, name: it.name, quantity: qty, unit,
      lineMin: unit.min * qty, lineMax: unit.max * qty,
    };
  });

  const subtotalMin = itemEstimates.reduce((s, x) => s + x.lineMin, 0);
  const subtotalMax = itemEstimates.reduce((s, x) => s + x.lineMax, 0);

  const rushPct = RUSH_MULTIPLIER[options.urgencyTier || 'standard'] || 0;
  const rushMin = Math.round(subtotalMin * rushPct);
  const rushMax = Math.round(subtotalMax * rushPct);

  const isPickup = options.deliveryMethod === 'pickup';
  const shippingFee = isPickup ? 0 : (subtotalMin >= SHIPPING_FREE_THRESHOLD ? 0 : SHIPPING_FEE_FLAT);

  return {
    items: itemEstimates,
    subtotalMin, subtotalMax,
    rushPct, rushMin, rushMax,
    shippingFee,
    totalMin: subtotalMin + rushMin + shippingFee,
    totalMax: subtotalMax + rushMax + shippingFee,
  };
}
