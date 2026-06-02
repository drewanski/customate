/**
 * pricing.ts — single source of truth for ALL price math.
 *
 * Every screen that displays a price (Cart, Checkout, Customizer, Order
 * Tracking, Quote Builder, Order Detail Drawer, Invoice) calls into this
 * file. Keep in lock-step with backend/utils/pricing.js — both files
 * implement the SAME formulas so the customer's estimate matches what the
 * admin sees when opening the Quote Builder.
 *
 * BUSINESS RULES (set by the shop owner, do not change without sign-off):
 *
 *   DTF Cotton (shirts)
 *     XS/S = ₱230, M = ₱240, L = ₱250, XL = ₱260,
 *     2XL  = ₱270, 3XL = ₱280, 5XL = ₱290
 *
 *   Sublimation on Polyester wearables
 *     Small = ₱140, Freesize (M-L) = ₱170,
 *     Oversize (XL-2XL) = ₱190, Plus Size (3XL) = ₱210
 *
 *   Tote bag = ₱180 fixed (standard print included)
 *   Mug      = ₱120 fixed (mug + box + sticker, sublimation)
 *
 *   Print size add-on
 *     Logo only = ₱65, A4 = ₱85, A3 = ₱130, A2 = ₱150
 *
 *   Bulk discount  = −₱10 per item when quantity of a line ≥ 30
 *   Rush fee       = +₱20 per item across the order (admin can waive/override)
 *
 * Compatibility:
 *   Cotton    → DTF only
 *   Polyester → DTF or Sublimation
 *   Mug       → Sublimation auto
 *   Tote      → standard auto
 */

// ── Types ────────────────────────────────────────────────────────────
export type ProductCategory =
  | 'cotton_shirt'
  | 'polyester_wearable'
  | 'tote'
  | 'mug'
  | 'other';

export type CottonSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | '2XL' | '3XL' | '5XL';
export type PolyesterSize = 'small' | 'freesize' | 'oversize' | 'plus';
export type AnySize = CottonSize | PolyesterSize | string;

export type PrintingMethod = 'dtf' | 'sublimation' | 'standard';
export type PrintSize = 'none' | 'logo' | 'a4' | 'a3' | 'a2';

// ── Lookup tables ────────────────────────────────────────────────────
export const COTTON_PRICE: Record<CottonSize, number> = {
  XS: 230, S: 230, M: 240, L: 250, XL: 260, '2XL': 270, '3XL': 280, '5XL': 290,
};

export const POLYESTER_PRICE: Record<PolyesterSize, number> = {
  small: 140, freesize: 170, oversize: 190, plus: 210,
};

export const FIXED_PRICE: Partial<Record<ProductCategory, number>> = {
  tote: 180,
  mug: 120,
};

export const PRINT_SIZE_FEE: Record<PrintSize, number> = {
  none: 0,
  logo: 65,
  a4: 85,
  a3: 130,
  a2: 150,
};

export const BULK_DISCOUNT_PER_ITEM = 10;
export const BULK_DISCOUNT_THRESHOLD = 30;
export const RUSH_FEE_PER_ITEM = 20;

// Compatibility — what printing methods are available for each (category, fabric).
export function availablePrintingMethods(
  category: ProductCategory,
  fabric?: string,
): PrintingMethod[] {
  if (category === 'mug') return ['sublimation'];
  if (category === 'tote') return ['standard'];
  if (category === 'cotton_shirt') return ['dtf'];  // cotton → DTF only
  if (category === 'polyester_wearable') {
    // Polyester can do both DTF and Sublimation
    return ['dtf', 'sublimation'];
  }
  // Fallback: use fabric explicitly
  const f = String(fabric || '').toLowerCase();
  if (f === 'cotton') return ['dtf'];
  if (f === 'polyester' || f === 'poly') return ['dtf', 'sublimation'];
  return ['dtf'];
}

// ── Helpers ──────────────────────────────────────────────────────────
const PRETTY_SIZE: Record<string, string> = {
  XS: 'XS', S: 'S', M: 'M', L: 'L', XL: 'XL',
  '2XL': '2XL', '3XL': '3XL', '5XL': '5XL',
  small: 'Small', freesize: 'Freesize (M–L)',
  oversize: 'Oversize (XL–2XL)', plus: 'Plus Size (3XL)',
};

const PRETTY_PRINT_SIZE: Record<PrintSize, string> = {
  none: 'No print',
  logo: 'Logo only',
  a4: 'A4',
  a3: 'A3',
  a2: 'A2',
};

const PRETTY_METHOD: Record<PrintingMethod, string> = {
  dtf: 'DTF Printing',
  sublimation: 'Sublimation Printing',
  standard: 'Standard Print',
};

const PRETTY_CATEGORY: Record<ProductCategory, string> = {
  cotton_shirt: 'Cotton Shirt',
  polyester_wearable: 'Polyester Wearable',
  tote: 'Tote Bag',
  mug: 'Mug',
  other: 'Item',
};

export function getCategoryLabel(c: ProductCategory) { return PRETTY_CATEGORY[c] || c; }
export function getSizeLabel(s: string)              { return PRETTY_SIZE[s] || s; }
export function getPrintSizeLabel(p: PrintSize)      { return PRETTY_PRINT_SIZE[p] || p; }
export function getMethodLabel(m: PrintingMethod)    { return PRETTY_METHOD[m] || m; }

// ── Item shape ───────────────────────────────────────────────────────
export interface ItemCustomization {
  productCategory?: ProductCategory | string;
  size?: AnySize;
  fabric?: string;
  fabricLabel?: string;
  printingMethod?: PrintingMethod | string;
  printSize?: PrintSize | string;
  color?: string;
  // legacy / supplementary
  text?: string;
  image?: string;
  decals?: any[];
  rush?: boolean;
}

export interface ItemLike {
  sku?: string;
  name?: string;
  quantity?: number;
  customization?: ItemCustomization;
}

// ── Base unit price ─────────────────────────────────────────────────
/**
 * Returns the BASE price for one piece of this item (NOT including print
 * size fee). Resolves from (category, size). Falls back gracefully for
 * unknown combos so the engine never crashes on bad input.
 */
export function getBaseUnitPrice(item: ItemLike): { price: number; label: string } {
  const c = item.customization || {};
  const cat = (c.productCategory || inferCategoryFromName(item.name)) as ProductCategory;

  // Tote + Mug are flat-priced.
  if (cat === 'tote') return { price: FIXED_PRICE.tote || 180, label: 'Tote Bag (standard)' };
  if (cat === 'mug')  return { price: FIXED_PRICE.mug  || 120, label: 'Mug + box + sticker' };

  if (cat === 'cotton_shirt') {
    const k = normalizeCottonSize(c.size);
    return { price: COTTON_PRICE[k], label: `Cotton shirt · ${PRETTY_SIZE[k]}` };
  }

  if (cat === 'polyester_wearable') {
    const k = normalizePolyesterSize(c.size);
    return { price: POLYESTER_PRICE[k], label: `Polyester · ${PRETTY_SIZE[k]}` };
  }

  // Unknown category — assume cotton M as a safe fallback.
  return { price: 240, label: 'Item · M' };
}

function normalizeCottonSize(s: any): CottonSize {
  const t = String(s || '').toUpperCase().replace(/\s+/g, '');
  if (t === 'XS') return 'XS';
  if (t === 'S')  return 'S';
  if (t === 'M')  return 'M';
  if (t === 'L')  return 'L';
  if (t === 'XL') return 'XL';
  if (t === '2XL' || t === 'XXL')   return '2XL';
  if (t === '3XL' || t === 'XXXL')  return '3XL';
  if (t === '5XL' || t === 'XXXXXL') return '5XL';
  return 'M';
}

function normalizePolyesterSize(s: any): PolyesterSize {
  const t = String(s || '').toLowerCase();
  if (t === 'small' || t === 's')                          return 'small';
  if (t === 'oversize' || t === 'xl' || t === '2xl')       return 'oversize';
  if (t === 'plus' || t === '3xl')                         return 'plus';
  return 'freesize';
}

/**
 * Best-effort category inference from a product name when the explicit
 * `customization.productCategory` is missing. Keeps legacy orders working.
 */
function inferCategoryFromName(name?: string): ProductCategory {
  const n = String(name || '').toLowerCase();
  if (/\bmug\b/.test(n))                          return 'mug';
  if (/tote|bag/.test(n))                         return 'tote';
  if (/jersey|polyester|drifit|dri-fit/.test(n))  return 'polyester_wearable';
  if (/shirt|tee|t-shirt|cotton/.test(n))         return 'cotton_shirt';
  return 'cotton_shirt';
}

// ── Detailed per-unit estimate ──────────────────────────────────────
export interface UnitEstimate {
  category: ProductCategory;
  categoryLabel: string;
  base: number;
  baseLabel: string;
  printSize: PrintSize;
  printSizeLabel: string;
  printSizeFee: number;
  printingMethod: PrintingMethod;
  printingMethodLabel: string;
  unit: number;
}

export function estimateUnitPrice(item: ItemLike): UnitEstimate {
  const c = item.customization || {};
  const cat = (c.productCategory || inferCategoryFromName(item.name)) as ProductCategory;
  const { price: base, label: baseLabel } = getBaseUnitPrice(item);

  const ps = String(c.printSize || 'logo').toLowerCase() as PrintSize;
  const printSize: PrintSize = (['none', 'logo', 'a4', 'a3', 'a2'] as PrintSize[]).includes(ps) ? ps : 'logo';
  const printSizeFee = PRINT_SIZE_FEE[printSize] || 0;

  // Default printing method — first allowed for this category/fabric.
  const allowed = availablePrintingMethods(cat, c.fabric);
  let method: PrintingMethod = (c.printingMethod as PrintingMethod) || allowed[0];
  if (!allowed.includes(method)) method = allowed[0];

  return {
    category: cat,
    categoryLabel: PRETTY_CATEGORY[cat],
    base,
    baseLabel,
    printSize,
    printSizeLabel: PRETTY_PRINT_SIZE[printSize],
    printSizeFee,
    printingMethod: method,
    printingMethodLabel: PRETTY_METHOD[method],
    unit: base + printSizeFee,
  };
}

// ── Order-level estimate ────────────────────────────────────────────
export interface OrderEstimateOptions {
  rush?: boolean;
  /** If admin manually adjusted/waived the rush fee, pass the override
      amount (in pesos). Set to 0 to fully waive. */
  rushOverride?: number;
  /** Manual adjustment (admin's "extras" line) — added at the very end. */
  manualAdjustment?: number;
  manualAdjustmentLabel?: string;
}

export interface OrderLineEstimate {
  sku?: string;
  name?: string;
  quantity: number;
  unit: UnitEstimate;
  /** unit.unit × quantity, BEFORE bulk discount. */
  gross: number;
  /** Total bulk discount on this line (peso, positive value). */
  bulkDiscount: number;
  /** Net line total after bulk discount. */
  net: number;
}

export interface OrderEstimate {
  lines: OrderLineEstimate[];
  totalItems: number;
  /** Sum of line.gross. */
  itemsGross: number;
  /** Sum of line.bulkDiscount (positive). */
  bulkDiscountTotal: number;
  /** itemsGross − bulkDiscountTotal. */
  itemsNet: number;
  rushFee: number;
  rushApplied: boolean;
  manualAdjustment: number;
  manualAdjustmentLabel: string;
  total: number;
}

export function estimateOrderTotal(items: ItemLike[], options: OrderEstimateOptions = {}): OrderEstimate {
  const lines: OrderLineEstimate[] = (items || []).map((it) => {
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

  // Rush fee — auto +₱20/item if customer ticked rush, but admin can override.
  const rushApplied = !!options.rush || (typeof options.rushOverride === 'number' && options.rushOverride > 0);
  let rushFee = options.rush ? totalItems * RUSH_FEE_PER_ITEM : 0;
  if (typeof options.rushOverride === 'number') rushFee = Math.max(0, options.rushOverride);

  const manualAdjustment = Number(options.manualAdjustment) || 0;
  const manualAdjustmentLabel = options.manualAdjustmentLabel || (manualAdjustment ? 'Adjustment' : '');

  const total = Math.max(0, itemsNet + rushFee + manualAdjustment);

  return {
    lines, totalItems,
    itemsGross, bulkDiscountTotal, itemsNet,
    rushFee, rushApplied,
    manualAdjustment, manualAdjustmentLabel,
    total,
  };
}

/**
 * Convert an OrderEstimate into the line-item shape the Quote Builder
 * (and the saved Order.quotation.lineItems[]) expect. This is what the
 * admin sees pre-filled when they open the Quote Builder — the customer's
 * exact configuration translated into an itemized invoice.
 */
export interface QuoteLine { label: string; amount: number; }

export function quotationLinesFromEstimate(est: OrderEstimate): QuoteLine[] {
  const lines: QuoteLine[] = [];
  for (const l of est.lines) {
    // Compact descriptive label — fits the limited width of the chat Quote Card.
    const parts = [l.name || l.unit.categoryLabel];
    if (l.unit.base) parts.push(`× ${l.quantity} @ ₱${l.unit.base}`);
    lines.push({ label: parts.join(' '), amount: l.unit.base * l.quantity });
    if (l.unit.printSizeFee > 0) {
      lines.push({
        label: `${l.unit.printSizeLabel} print · × ${l.quantity}`,
        amount: l.unit.printSizeFee * l.quantity,
      });
    }
    if (l.bulkDiscount > 0) {
      lines.push({
        label: `Bulk discount (≥30 pcs · −₱${BULK_DISCOUNT_PER_ITEM}/pc)`,
        amount: -l.bulkDiscount,
      });
    }
  }
  if (est.rushFee > 0) {
    lines.push({ label: `Rush fee (₱${RUSH_FEE_PER_ITEM}/item × ${est.totalItems})`, amount: est.rushFee });
  }
  if (est.manualAdjustment !== 0) {
    lines.push({ label: est.manualAdjustmentLabel || 'Adjustment', amount: est.manualAdjustment });
  }
  return lines;
}

// Peso formatter shared by every price-displaying surface.
export function formatPeso(n: number): string {
  return `₱${Math.round(n).toLocaleString()}`;
}

export function formatRange(min: number, max: number): string {
  if (Math.round(min) === Math.round(max)) return formatPeso(min);
  return `${formatPeso(min)} – ${formatPeso(max)}`;
}

/**
 * Estimate the price RANGE for a product card on the catalog — the
 * cheapest possible config (smallest size + smallest print) → most
 * expensive (largest size + largest print). Used on the Products page
 * so customers see e.g. "₱295 – ₱440" instead of one misleading number,
 * since DTF cotton and sublimation polyester have very different bands.
 *
 * Pass either the explicit category or the product name (will infer).
 */
export function productPriceRange(opts: {
  category?: ProductCategory | string;
  name?: string;
}): { min: number; max: number; label: string; baseRange?: { min: number; max: number } } {
  const cat = (opts.category as ProductCategory)
    || ({} as any).inferCategory
    || inferCategoryFromName(opts.name);

  // Fixed-price categories
  if (cat === 'tote') return { min: 180, max: 180, label: '₱180' };
  if (cat === 'mug')  return { min: 120, max: 120, label: '₱120' };

  // Wearables — base × size + Logo (cheapest print) → base × largest size + A2
  if (cat === 'cotton_shirt') {
    const baseMin = COTTON_PRICE.XS;
    const baseMax = COTTON_PRICE['5XL'];
    const min = baseMin + PRINT_SIZE_FEE.logo;  // 230 + 65 = 295
    const max = baseMax + PRINT_SIZE_FEE.a2;    // 290 + 150 = 440
    return { min, max, label: formatRange(min, max), baseRange: { min: baseMin, max: baseMax } };
  }
  if (cat === 'polyester_wearable') {
    const baseMin = POLYESTER_PRICE.small;
    const baseMax = POLYESTER_PRICE.plus;
    const min = baseMin + PRINT_SIZE_FEE.logo;  // 140 + 65 = 205
    const max = baseMax + PRINT_SIZE_FEE.a2;    // 210 + 150 = 360
    return { min, max, label: formatRange(min, max), baseRange: { min: baseMin, max: baseMax } };
  }
  // Unknown — fall back to a generic shirt band so the card isn't blank.
  return { min: 295, max: 440, label: '₱295 – ₱440' };
}

