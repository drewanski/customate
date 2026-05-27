/**
 * seedModelUrls.js
 * Stamps every Inventory document with its gltfUrl and productKey so the
 * mobile app can build a { productKey → gltfUrl } lookup.
 *
 * Matching strategy (in order):
 *   1. Exact sku match (e.g. 'TS001')
 *   2. Name substring match (case-insensitive)
 *
 * Run:  node scripts/seedModelUrls.js
 * (from the backend/ directory, with MONGO_URI in .env or as env var)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Inventory from '../models/Inventory.js';

dotenv.config();

const BASE = process.env.MODEL_BASE_URL || 'https://customate-api.onrender.com/models';

// productKey → { glbFilename, skus[], nameKeywords[] }
const PRODUCTS = [
  {
    productKey: 'tshirt',
    gltfUrl:    `${BASE}/tshirt.glb`,
    skus:       ['TS001', 'SKU-CLASSIC-T-SHIRT', 'SKU-CUSTOM-COTTON-T-SHIRT'],
    nameWords:  ['t-shirt', 'tshirt', 'shirt'],
  },
  {
    productKey: 'hoodie',
    gltfUrl:    `${BASE}/hoodie.glb`,
    skus:       ['HD001', 'SKU-HOODIE'],
    nameWords:  ['hoodie'],
  },
  {
    productKey: 'cap',
    gltfUrl:    `${BASE}/cap.glb`,
    skus:       ['CP001', 'SKU-CAP', 'SKU-BASEBALL-CAP'],
    nameWords:  ['cap', 'hat'],
  },
  {
    productKey: 'mug',
    gltfUrl:    `${BASE}/mug.glb`,
    skus:       ['MG001', 'SKU-CERAMIC-COFFEE-MUG', 'SKU-CERAMIC-MUG'],
    nameWords:  ['mug'],
  },
  {
    productKey: 'tote',
    gltfUrl:    `${BASE}/tote.glb`,
    skus:       ['OT001', 'SKU-CANVAS-TOTE-BAG'],
    nameWords:  ['tote', 'canvas bag'],
  },
  {
    productKey: 'jersey',
    gltfUrl:    `${BASE}/jersey.glb`,
    skus:       ['JR001', 'SKU-SPORTS-PERFORMANCE-JERSEY', 'SKU-PREMIUM-SPORTS-JERSEY'],
    nameWords:  ['jersey'],
  },
  {
    productKey: 'mousepad',
    gltfUrl:    `${BASE}/mousepad.glb`,
    skus:       ['MP001', 'SKU-GAMING-MOUSEPAD', 'SKU-MOUSE-PAD'],
    nameWords:  ['mousepad', 'mouse pad'],
  },
  {
    productKey: 'handfan',
    gltfUrl:    `${BASE}/handfan.glb`,
    skus:       ['FF001', 'SKU-FOLDABLE-HAND-FAN', 'SKU-HAND-FAN'],
    nameWords:  ['fan'],
  },
];

async function findDoc(skus, nameWords) {
  // 1. Try any of the known SKUs
  const doc = await Inventory.findOne({ sku: { $in: skus } });
  if (doc) return doc;

  // 2. Fallback: name keyword match
  for (const word of nameWords) {
    const d = await Inventory.findOne({ name: new RegExp(word, 'i') });
    if (d) return d;
  }
  return null;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const p of PRODUCTS) {
    const doc = await findDoc(p.skus, p.nameWords);

    if (!doc) {
      console.log(`⚠️  [${p.productKey}] No inventory doc found (tried skus: ${p.skus.join(', ')})`);
      notFound++;
      continue;
    }

    if (doc.gltfUrl === p.gltfUrl && doc.productKey === p.productKey) {
      console.log(`✓  ${p.productKey.padEnd(10)} already up-to-date (sku: ${doc.sku})`);
      skipped++;
      continue;
    }

    doc.gltfUrl    = p.gltfUrl;
    doc.productKey = p.productKey;
    await doc.save();
    console.log(`✅ ${p.productKey.padEnd(10)} → ${p.gltfUrl}  (sku: ${doc.sku})`);
    updated++;
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`Updated  : ${updated}`);
  console.log(`Skipped  : ${skipped}  (already correct)`);
  console.log(`Not found: ${notFound} (no matching inventory document)`);
  console.log(`────────────────────────────────────────`);

  if (notFound > 0) {
    console.log('\nTip: Run the inventory seed first — node seed/inventorySeed.js');
  }

  await mongoose.disconnect();
  console.log('\n✅ Done.');
}

run().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
