/**
 * pricingVerify.js — sanity test of the pricing engine against the rate card.
 *
 * Asserts that every price rule the business owner specified produces the
 * exact expected number. Run after any pricing change to catch regressions.
 *
 * Usage:  node backend/scripts/pricingVerify.js
 */
import { estimateOrderTotal, estimateUnitPrice, getBaseUnitPrice } from '../utils/pricing.js';

let fails = 0;
function eq(label, got, want) {
  const ok = got === want;
  console.log(`  ${ok ? '✓' : '✗'} ${label}  →  ${got}${ok ? '' : `   (expected ${want})`}`);
  if (!ok) fails++;
}

console.log('\n── DTF Cotton size table ──────────────────────────────────────────');
for (const [size, want] of [['XS',230],['S',230],['M',240],['L',250],['XL',260],['2XL',270],['3XL',280],['5XL',290]]) {
  const r = getBaseUnitPrice({ customization: { productCategory: 'cotton_shirt', size } });
  eq(`Cotton ${size}`, r.price, want);
}

console.log('\n── Sublimation Polyester size table ───────────────────────────────');
for (const [size, want] of [['small',140],['freesize',170],['oversize',190],['plus',210]]) {
  const r = getBaseUnitPrice({ customization: { productCategory: 'polyester_wearable', size } });
  eq(`Polyester ${size}`, r.price, want);
}

console.log('\n── Fixed-price items ──────────────────────────────────────────────');
eq('Tote bag', getBaseUnitPrice({ customization: { productCategory: 'tote' } }).price, 180);
eq('Mug',      getBaseUnitPrice({ customization: { productCategory: 'mug' } }).price,  120);

console.log('\n── Print-size add-ons (cotton M) ──────────────────────────────────');
for (const [ps, want] of [['logo',65],['a4',85],['a3',130],['a2',150]]) {
  const u = estimateUnitPrice({ customization: { productCategory: 'cotton_shirt', size: 'M', printSize: ps } });
  eq(`+${ps.toUpperCase()}`, u.printSizeFee, want);
  eq(`Cotton M + ${ps.toUpperCase()} unit`, u.unit, 240 + want);
}

console.log('\n── Bulk discount (−₱10/pc at ≥30) ─────────────────────────────────');
const e29 = estimateOrderTotal([{ quantity: 29, customization: { productCategory: 'cotton_shirt', size: 'L', printSize: 'logo' } }]);
eq('qty 29: no bulk discount',  e29.bulkDiscountTotal, 0);
const e30 = estimateOrderTotal([{ quantity: 30, customization: { productCategory: 'cotton_shirt', size: 'L', printSize: 'logo' } }]);
eq('qty 30: bulk = ₱300',        e30.bulkDiscountTotal, 300);
const e50 = estimateOrderTotal([{ quantity: 50, customization: { productCategory: 'cotton_shirt', size: 'L', printSize: 'logo' } }]);
eq('qty 50: bulk = ₱500',        e50.bulkDiscountTotal, 500);

console.log('\n── Rush fee (+₱20/item) ───────────────────────────────────────────');
const eRush = estimateOrderTotal([{ quantity: 5, customization: { productCategory: 'cotton_shirt', size: 'M', printSize: 'logo' } }], { rush: true });
eq('5 items rush fee',           eRush.rushFee, 100);
const eRushOverride = estimateOrderTotal([{ quantity: 5, customization: { productCategory: 'cotton_shirt', size: 'M', printSize: 'logo' } }], { rush: true, rushOverride: 0 });
eq('admin waives rush',          eRushOverride.rushFee, 0);

console.log('\n── Full order example (the mockup scenario) ───────────────────────');
const eFull = estimateOrderTotal([{ quantity: 3, customization: { productCategory: 'cotton_shirt', size: 'L', printSize: 'a3' } }], { rush: true });
//   base 250 + A3 130 = 380 / pc
//   gross 380 × 3 = 1,140  ·  no bulk  ·  rush 20 × 3 = 60  →  total 1,200
eq('unit price (Cotton L + A3)', eFull.lines[0].unit.unit, 380);
eq('gross',                       eFull.itemsGross, 1140);
eq('rush',                        eFull.rushFee, 60);
eq('total',                       eFull.total, 1200);

console.log('\n── Bulk + Rush + Print size combined ──────────────────────────────');
//   Polyester Freesize 170 + A4 85 = 255 / pc · 40 pcs
//   gross 255 × 40 = 10,200
//   bulk 40 × 10 = 400 → net 9,800
//   rush 40 × 20 = 800
//   total = 10,600
const eComplex = estimateOrderTotal([{ quantity: 40, customization: { productCategory: 'polyester_wearable', size: 'freesize', printSize: 'a4' } }], { rush: true });
eq('40× Poly Freesize + A4 unit', eComplex.lines[0].unit.unit, 255);
eq('gross',                        eComplex.itemsGross, 10200);
eq('bulk discount',                eComplex.bulkDiscountTotal, 400);
eq('rush',                         eComplex.rushFee, 800);
eq('total',                        eComplex.total, 10600);

console.log('\n' + (fails === 0 ? '═'.repeat(72) + '\n  ✅ ALL PRICING RULES MATCH THE RATE CARD.\n' + '═'.repeat(72) : `\n✗ ${fails} FAILURE(S)`));
process.exit(fails === 0 ? 0 : 1);
