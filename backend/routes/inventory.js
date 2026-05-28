import express from 'express';
import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import User from '../models/User.js';
import { authMiddleware, adminMiddleware, requireManager, requireProductionStaff } from '../middleware/auth.js';

console.log('Inventory routes module loaded');

const router = express.Router();

// Public: Get all active inventory (no auth required)
// Optional ?search=query — case-insensitive substring match on name, category, description
router.get('/public', async (req, res) => {
  try {
    console.log('GET /inventory/public called');
    const filter = { isActive: true };
    if (req.query.search) {
      const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { category: rx }, { description: rx }];
    }
    const inventory = await Inventory.find(filter).sort({ createdAt: -1 });
    console.log('Found inventory items:', inventory.length);
    res.json(inventory);
  } catch (err) {
    console.error('Error in /inventory/public:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Public: Get single inventory item by ID (no auth required)
router.get('/:id', async (req, res) => {
  console.log('GET /inventory/:id called with id:', req.params.id);
  try {
    const item = await Inventory.findById(req.params.id);
    console.log('Found item:', item);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    console.error('Error in /inventory/:id:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all inventory (admin only)
// Per updated spec: inventory is admin-only. Production staff have no
// reason to browse the catalog — their work-card already lists the SKU
// + size + color for each assigned task.
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  const inventory = await Inventory.find().sort({ createdAt: -1 });
  res.json(inventory);
});

// Delete inventory (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const item = await Inventory.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Update inventory (admin only).
 *
 * Updates metadata only — name, SKU, category, price, image, description,
 * minStock, isActive. Stock changes MUST go through /api/stock-movements/*
 * so they generate an audit row. Any `stock` value posted here is silently
 * ignored and an explanatory header is returned for the client to surface.
 */
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // SKU is intentionally NOT pulled from req.body — it's auto-generated at
    // create time and immutable thereafter (orders + audit logs reference it).
    const { name, category, price, image, description, isActive, minStock } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (category !== undefined) update.category = category;
    if (price !== undefined) update.price = price;
    if (image !== undefined) update.image = image;
    if (description !== undefined) update.description = description;
    if (isActive !== undefined) update.isActive = isActive;
    if (minStock !== undefined) update.minStock = minStock;

    const inventory = await Inventory.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!inventory) return res.status(404).json({ message: 'Inventory not found' });

    if ('stock' in req.body && req.body.stock !== inventory.stock) {
      res.setHeader(
        'X-Inventory-Note',
        'Direct stock edits via PUT are ignored — use /stock-movements/restock or /adjust.'
      );
    }
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Create inventory record (admin only).
 * Creates an "initial" stock movement so the item's history starts cleanly.
 */
/**
 * Generate a unique SKU from category + name.
 *
 * Format: <CAT3>-<NAME4>-<SEQ4>
 *   CAT3   = first 3 letters of category, uppercased (or PRD if blank)
 *   NAME4  = first 4 alphanumeric chars of the name, uppercased
 *   SEQ4   = 4-digit zero-padded auto-increment (per CAT-NAME prefix)
 *
 * Example: ("T-Shirts", "Classic Cotton") → TSH-CLAS-0001
 *
 * The sequence is computed from the highest existing SKU with the same
 * prefix — collision-safe even with concurrent inserts because we retry on
 * the unique-index error (11000) below.
 */
async function generateSku(category, name) {
  const cat = (category || 'PRD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  const nm = (name || 'ITEM')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    .padEnd(4, 'X');
  const prefix = `${cat}-${nm}-`;

  // Find the highest existing sequence for this prefix.
  const last = await Inventory.findOne({ sku: new RegExp(`^${prefix}\\d+$`) })
    .sort({ sku: -1 })
    .select('sku')
    .lean();

  let next = 1;
  if (last?.sku) {
    const m = last.sku.match(/-(\d+)$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, category, stock, price, image, description, isActive, minStock, sku: providedSku } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Product name is required' });
    }

    // Compliance: admins now enter SKU manually. We validate format +
    // uniqueness before accepting; fall back to the auto-generator only
    // when no SKU was provided (legacy or API callers without UI).
    let sku;
    if (providedSku && String(providedSku).trim()) {
      const cleaned = String(providedSku).trim().toUpperCase().replace(/\s+/g, '-');
      if (!/^[A-Z0-9][A-Z0-9-]{1,39}$/.test(cleaned)) {
        return res.status(400).json({
          message: 'SKU must be 2-40 chars: letters, digits, dashes. Must start with letter or digit.',
        });
      }
      const exists = await Inventory.findOne({ sku: cleaned }).select('_id').lean();
      if (exists) {
        return res.status(409).json({ message: `SKU "${cleaned}" already exists. Choose a different code.` });
      }
      sku = cleaned;
    } else {
      sku = await generateSku(category, name);
      let attempt = 0;
      while (attempt < 5) {
        const exists = await Inventory.findOne({ sku }).select('_id').lean();
        if (!exists) break;
        sku = await generateSku(category, name);
        attempt++;
      }
    }

    const initialStock = Number(stock) || 0;
    const inv = new Inventory({
      name,
      sku,
      category,
      stock: initialStock,
      price,
      image,
      description,
      isActive,
      minStock: Number(minStock) || 10,
    });
    await inv.save();

    // Audit-log the initial stock so history is complete from day one
    if (initialStock > 0) {
      let userName = '';
      try {
        const u = await User.findById(req.user.userId).select('name');
        if (u) userName = u.name;
      } catch {
        /* non-fatal */
      }
      await StockMovement.create({
        inventory: inv._id,
        inventorySku: inv.sku,
        inventoryName: inv.name,
        type: 'initial',
        quantity: initialStock,
        balanceBefore: 0,
        balanceAfter: initialStock,
        performedBy: req.user.userId,
        performedByName: userName,
        performedByRole: req.user.role,
        notes: 'Initial stock at item creation',
      });
    }

    res.status(201).json(inv);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'SKU already exists' });
    }
    console.error('POST /inventory error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
