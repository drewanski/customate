/**
 * pricing.js — server-side mirror of src/app/utils/pricing.ts.
 *
 * Keep these two files in lock-step. The frontend computes the customer-
 * facing estimate; the backend pre-fills the admin's Quote Builder with
 * the same numbers. Any divergence is a bug.
 *
 * Business rules in the .ts file's header comment.
 */

export const COTTON_PRICE = {
  XS: 230, S: 230, M: 240, L: 250, XL: 260, '2XL': 270, '3XL': 280, '5XL': 290,
};

export const POLYESTER_PRICE = {
  small: 140, freesize: 170, oversize: 190, plus: 210,
};

export const FIXED_PRICE = {
  tote: 180,
  mug: 120,
};

export const PRINT_SIZE_FEE = {
  none: 0, logo: 65, a4: 85, a3: 130, a2: 150,
};

export const BULK_DISCOUNT_PER_ITEM = 10;
export const BULK_DISCOUNT_THRESHOLD = 30;
export const RUSH_FEE_PER_ITEM = 20;

export function availablePrintingMethods(category, fabric) {
  if (category === 'mug')                return ['sublimation'];
  if (category === 'tote')               return ['standard'];
  if (category === 'cotton_shirt')       return ['dtf'];
  if (category === 'polyester_wearable') return ['dtf', 'sublimation'];
  const f = String(fabric || '').toLowerCase();
  if (f === 'cotton')                    return ['dtf'];
  if (f === 'polyester' || f === 'poly') return ['dtf', 'sublimation'];
  return ['dtf'];
}

function inferCategoryFromName(name) {
  const n = String(name || '').toLowerCase();
  if (/\bmug\b/.test(n))                          return 'mug';
  if (/tote|bag/.test(n))                         return 'tote';
  if (/jersey|polyester|drifit|dri-fit/.test(n))  return 'polyester_wearable';
  if (/shirt|tee|t-shirt|cotton/.test(n))         return 'cotton_shirt';
  return 'cotton_shirt';
}

function normalizeCottonSize(s) {
  const t = String(s || '').toUpperCase().replace(/\s+/g, '');
  if (t === 'XS') return 'XS';
  if (t === 'S')  return 'S';
  if (t === 'M')  return 'M';
  if (t === 'L')  return 'L';
  if (t === 'XL') return 'XL';
  if (t === '2XL' || t === 'XXL')   return '2XL';
  if (t === '3XL' || t === 'XXXL')  return '3XL';
  if (t === '5XL') return '5XL';
  return 'M';
}

function normalizePolyesterSize(s) {
  const t = String(s || '').toLowerCase();
  if (t === 'small' || t === 's')                    return 'small';
  if (t === 'oversize' || t === 'xl' || t === '2xl') return 'oversize';
  if (t === 'plus' || t === '3xl')                   return 'plus';
  return 'freesize';
}

export function getBaseUnitPrice(item) {
  const c = (item && item.customization) || {};
  const cat = c.productCategory || inferCategoryFromName(item && item.name);

  if (cat === 'tote') return { price: FIXED_PRICE.tote, label: 'Tote Bag (standard)' };
  if (cat === 'mug')  return { price: FIXED_PRICE.mug,  label: 'Mug + box + sticker' };
  if (cat === 'cotton_shirt') {
    const k = normalizeCottonSize(c.size);
    return { price: COTTON_PRICE[k], label: `Cotton shirt · ${k}` };
  }
  if (cat === 'polyester_wearable') {
    const k = normalizePolyesterSize(c.size);
    const pretty = ({ small: 'Small', freesize: 'Freesize (M–L)', oversize: 'Oversize (XL–2XL)', plus: 'Plus Size (3XL)' })[k];
    return { price: POLYESTER_PRICE[k], label: `Polyester · ${pretty}` };
  }
  return { price: 240, label: 'Item · M' };
}

export function estimateUnitPrice(item) {
  const c = (item && item.customization) || {};
  const cat = c.productCategory || inferCategoryFromName(item && item.name);
  const { price: base, label: baseLabel } = getBaseUnitPrice(item);

  const ps = String(c.printSize || 'logo').toLowerCase();
  const printSize = ['none','logo','a4','a3','a2'].includes(ps) ? ps : 'logo';
  const printSizeFee = PRINT_SIZE_FEE[printSize] || 0;

  const allowed = availablePrintingMethods(cat, c.fabric);
  let method = c.printingMethod || allowed[0];
  if (!allowed.includes(method)) method = allowed[0];

  return {
    category: cat,
    base, baseLabel,
    printSize, printSizeFee,
    printingMethod: method,
    unit: base + printSizeFee,
  };
}

export function estimateOrderTotal(items, options = {}) {
  const lines = (items || []).map((it) => {
    const qty = Math.max(1, Number(it.quantity) || 1);
    const unit = estimateUnitPrice(it);
    const gross = unit.unit * qty;
    const bulkDiscount = qty >= BULK_DISCOUNT_THRESHOLD ? qty * BULK_DISCOUNT_PER_ITEM : 0;
    const net = gross - bulkDiscount;
    return { sku: it.sku, name: it.name, quantity: qty, unit, gross, bulkDiscount, net };
  });

  const totalItems = lines.reduce((s, l) => s + l.quantity, 0);
  const itemsGross = lines.reduce((s, l) => s + l.gross, 0);
  const bulkDiscountTotal = lines.reduce((s, l) => s + l.bulkDiscount, 0);
  const itemsNet = itemsGross - bulkDiscountTotal;

  let rushFee = options.rush ? totalItems * RUSH_FEE_PER_ITEM : 0;
  if (typeof options.rushOverride === 'number') rushFee = Math.max(0, options.rushOverride);

  const manualAdjustment = Number(options.manualAdjustment) || 0;
  const total = Math.max(0, itemsNet + rushFee + manualAdjustment);

  return {
    lines, totalItems, itemsGross, bulkDiscountTotal, itemsNet,
    rushFee, rushApplied: !!options.rush || (typeof options.rushOverride === 'number' && options.rushOverride > 0),
    manualAdjustment,
    manualAdjustmentLabel: options.manualAdjustmentLabel || (manualAdjustment ? 'Adjustment' : ''),
    total,
  };
}

export function quotationLinesFromEstimate(est) {
  const out = [];
  for (const l of est.lines) {
    const parts = [l.name || l.unit.baseLabel];
    parts.push(`× ${l.quantity} @ ₱${l.unit.base}`);
    out.push({ label: parts.join(' '), amount: l.unit.base * l.quantity });
    if (l.unit.printSizeFee > 0) {
      out.push({ label: `${l.unit.printSize.toUpperCase()} print · × ${l.quantity}`, amount: l.unit.printSizeFee * l.quantity });
    }
    if (l.bulkDiscount > 0) {
      out.push({ label: `Bulk discount (≥${BULK_DISCOUNT_THRESHOLD} pcs · −₱${BULK_DISCOUNT_PER_ITEM}/pc)`, amount: -l.bulkDiscount });
    }
  }
  if (est.rushFee > 0) out.push({ label: `Rush fee (₱${RUSH_FEE_PER_ITEM}/item × ${est.totalItems})`, amount: est.rushFee });
  if (est.manualAdjustment !== 0) out.push({ label: est.manualAdjustmentLabel || 'Adjustment', amount: est.manualAdjustment });
  return out;
}
