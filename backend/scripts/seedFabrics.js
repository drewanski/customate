/**
 * Seeds a sensible fabric set onto every wearable inventory item that
 * doesn't already have one populated. "Wearable" = anything whose
 * productKey starts with tshirt/jersey/hoodie/polo OR whose category is
 * 'apparel'. Idempotent — re-running just refreshes the standard set
 * for items that still have an empty fabrics[] array.
 *
 * Usage:
 *   node backend/scripts/seedFabrics.js
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import mongoose from 'mongoose';
import Inventory from '../models/Inventory.js';

// Catalogue of fabric presets. Each entry maps to a `material` key the 3D
// customizer uses to pick a roughness / weave / sheen profile. Price
// modifier is in pesos OVER the product's base price.
const FABRICS = [
  {
    code: 'cotton',
    label: 'Cotton',
    description: 'Soft, breathable, everyday wear.',
    material: 'cotton',
    priceModifier: 0,
  },
  {
    code: 'cotton-poly',
    label: 'Cotton-Poly Blend',
    description: 'Cotton comfort with poly durability.',
    material: 'cotton-poly',
    priceModifier: 30,
  },
  {
    code: 'poly',
    label: 'Polyester',
    description: 'Lightweight, wrinkle-resistant.',
    material: 'poly',
    priceModifier: 20,
  },
  {
    code: 'drifit',
    label: 'Dri-Fit',
    description: 'Moisture-wicking athletic mesh.',
    material: 'drifit',
    priceModifier: 60,
  },
  {
    code: 'linen',
    label: 'Linen',
    description: 'Visible weave, premium feel.',
    material: 'linen',
    priceModifier: 80,
  },
  {
    code: 'jersey',
    label: 'Jersey Knit',
    description: 'Stretchy, sport-friendly weave.',
    material: 'jersey',
    priceModifier: 45,
  },
  {
    code: 'silk',
    label: 'Silk Touch',
    description: 'Smooth, soft sheen.',
    material: 'silk',
    priceModifier: 120,
  },
];

// Per-product trimming so we don't show e.g. "Dri-Fit silk" on a regular tee
// or "Linen" on a jersey. The defaults below are reasonable for our seed
// catalogue; admins can override per-item in the inventory editor later.
function fabricsFor(item) {
  const key = String(item.productKey || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  if (key.startsWith('jersey') || /jersey/i.test(item.name)) {
    return FABRICS.filter((f) => ['poly', 'drifit', 'jersey', 'cotton-poly'].includes(f.code));
  }
  if (key.startsWith('hoodie') || /hoodie/i.test(item.name)) {
    return FABRICS.filter((f) => ['cotton', 'cotton-poly', 'poly'].includes(f.code));
  }
  if (key.startsWith('polo') || /polo/i.test(item.name)) {
    return FABRICS.filter((f) => ['cotton', 'cotton-poly', 'poly', 'drifit'].includes(f.code));
  }
  if (key.startsWith('tshirt') || /shirt|tee/i.test(item.name) || cat === 'apparel') {
    return FABRICS.filter((f) => ['cotton', 'cotton-poly', 'poly', 'drifit', 'linen', 'silk'].includes(f.code));
  }
  return [];
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[seedFabrics] connected');

  // Find every active item that *could* support fabrics — apparel category
  // OR any productKey resembling a garment.
  const items = await Inventory.find({
    isActive: true,
    $or: [
      { category: /apparel/i },
      { productKey: /tshirt|jersey|hoodie|polo|shirt/i },
      { name: /shirt|jersey|hoodie|tee|polo/i },
    ],
  });

  console.log(`[seedFabrics] found ${items.length} wearable items`);
  for (const item of items) {
    const next = fabricsFor(item);
    if (!next.length) {
      console.log(`  – ${item.sku} (${item.name}) — no preset, skipping`);
      continue;
    }
    // Don't overwrite an admin-edited list.
    if (item.fabrics && item.fabrics.length) {
      console.log(`  · ${item.sku} (${item.name}) — already has ${item.fabrics.length} fabrics, skipping`);
      continue;
    }
    item.fabrics = next;
    await item.save();
    console.log(`  ✓ ${item.sku} (${item.name}) ← ${next.map((f) => f.label).join(', ')}`);
  }

  await mongoose.disconnect();
  console.log('[seedFabrics] done');
})().catch((err) => { console.error(err); process.exit(1); });
