import express from 'express';
import Product from '../models/Product.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

function toProductDto(p) {
  return {
    id: p._id,
    name: p.name,
    description: p.description,
    category: p.category,
    basePrice: typeof p.basePrice === 'number' ? p.basePrice : p.price,
    price: p.price,
    image: p.image,
    inventory: p.inventory,
    sizes: p.sizes || [],
    colors: p.colors || [],
    materials: p.materials || [],
    templates: p.templates || []
  };
}

// Get all products
router.get('/', async (req, res) => {
  const products = await Product.find();
  res.json(products.map(toProductDto));
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(toProductDto(product));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create product (admin only)
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, category, price, basePrice, image, inventory, sizes, colors, materials, templates } = req.body;
    const product = new Product({
      name,
      description,
      category,
      price: typeof basePrice === 'number' ? basePrice : price,
      image,
      inventory,
      sizes,
      colors,
      materials,
      templates
    });
    await product.save();
    res.status(201).json(toProductDto(product));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update product (admin only)
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const update = { ...req.body };
    if (typeof update.basePrice === 'number' && typeof update.price !== 'number') update.price = update.basePrice;
    const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(toProductDto(product));
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete product (admin only)
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
