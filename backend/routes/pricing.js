import express from 'express';
import Inventory from '../models/Inventory.js';

const router = express.Router();

// Rush-order configuration (panel revision #7). Frozen here so the
// admin-notify side and the customer breakdown agree on the same value.
export const RUSH_CONFIG = {
  feePerItem: 75,   // peso surcharge per item
  flatFee: 100,     // fixed bump regardless of quantity
  leadTimeDays: 2,  // promise for rush orders (vs ~5 standard)
};

// Complexity surcharge: more print areas = more setup work.
function complexitySurcharge({ printAreas = 1, hasText = false, hasImage = false }) {
  let s = 0;
  if (printAreas > 1) s += (printAreas - 1) * 40;
  if (hasText && hasImage) s += 20; // mixed-media setup
  return s;
}

function lookupModifier(arr, key, field = 'code') {
  if (!Array.isArray(arr) || !key) return 0;
  const found = arr.find((x) => (x[field] || '').toLowerCase() === String(key).toLowerCase());
  return found ? Number(found.priceModifier || 0) : 0;
}

/**
 * POST /pricing/quote
 * Body: {
 *   items: [{
 *     productId, quantity, customization: { size, color, shirtType, printAreas, text, image }
 *   }],
 *   rush?: boolean,
 *   couponCode?: string,    // (not applied here — checkout still owns coupon logic)
 * }
 *
 * Response: { lines: [...], subtotal, rushFee, total, leadTimeDays, anyOutOfStock }
 */
router.post('/quote', async (req, res) => {
  try {
    const { items = [], rush = false } = req.body || {};
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'items array required' });
    }

    const ids = [...new Set(items.map((i) => i.productId).filter(Boolean))];
    const inventoryDocs = await Inventory.find({ _id: { $in: ids } });
    const byId = new Map(inventoryDocs.map((p) => [String(p._id), p]));

    const lines = [];
    let subtotal = 0;
    let anyOutOfStock = false;

    for (const it of items) {
      const prod = byId.get(String(it.productId));
      const c = it.customization || {};
      const qty = Math.max(1, Number(it.quantity) || 1);
      if (!prod) {
        lines.push({
          productId: it.productId,
          quantity: qty,
          error: 'product_not_found',
        });
        continue;
      }
      const available = Math.max(0, (prod.stock || 0) - (prod.reservedStock || 0));
      const outOfStock = available < qty;
      if (outOfStock) anyOutOfStock = true;

      const base = Number(prod.price) || 0;
      const sizeMod = lookupModifier(prod.sizes, c.size);
      const colorMod = lookupModifier(prod.availableColors, c.color, 'hex')
                       || lookupModifier(prod.availableColors, c.color, 'name');
      const typeMod = lookupModifier(prod.shirtTypes, c.shirtType);
      const complexity = complexitySurcharge({
        printAreas: c.printAreas,
        hasText: !!c.text,
        hasImage: !!c.image,
      });
      const unitPrice = base + sizeMod + colorMod + typeMod + complexity;
      const lineTotal = unitPrice * qty;
      subtotal += lineTotal;

      lines.push({
        productId: prod._id,
        name: prod.name,
        sku: prod.sku,
        quantity: qty,
        basePrice: base,
        sizeMod,
        colorMod,
        typeMod,
        complexitySurcharge: complexity,
        unitPrice,
        lineTotal,
        availableStock: available,
        outOfStock,
        stockStatus: outOfStock ? 'out_of_stock' : (available <= (prod.minStock || 0) ? 'low_stock' : 'available'),
      });
    }

    const totalQty = lines.reduce((s, l) => s + (l.quantity || 0), 0);
    const rushFee = rush ? (RUSH_CONFIG.flatFee + RUSH_CONFIG.feePerItem * totalQty) : 0;
    const total = subtotal + rushFee;
    const leadTimeDays = rush ? RUSH_CONFIG.leadTimeDays : 5;

    res.json({ lines, subtotal, rushFee, total, leadTimeDays, anyOutOfStock, rush });
  } catch (err) {
    console.error('POST /pricing/quote error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
