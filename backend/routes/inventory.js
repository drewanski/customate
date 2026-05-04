import express from 'express';
import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

console.log('Inventory routes module loaded');

const router = express.Router();

// Public: Get all active inventory (no auth required)
router.get('/public', async (req, res) => {
  try {
    console.log('GET /inventory/public called');
    const inventory = await Inventory.find({ isActive: true }).sort({ createdAt: -1 });
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

// Update inventory (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, sku, category, stock, price, image, description, isActive } = req.body;
    const inventory = await Inventory.findByIdAndUpdate(
      req.params.id,
      { name, sku, category, stock, price, image, description, isActive },
      { new: true, runValidators: true }
    );
    if (!inventory) return res.status(404).json({ message: 'Inventory not found' });
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create inventory record (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, sku, category, stock, price, image, description, isActive } = req.body;
    const inv = new Inventory({
      name, sku, category, stock, price, image, description, isActive
    });
    await inv.save();
    res.status(201).json(inv);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'SKU already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
