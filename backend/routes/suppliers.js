import express from 'express';
import Supplier from '../models/Supplier.js';
import StockMovement from '../models/StockMovement.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// All supplier routes are admin-only — suppliers contain contact info that
// shouldn't be exposed to customers.
router.use(authMiddleware, adminMiddleware);

/**
 * GET /api/suppliers
 * Optional ?includeInactive=true returns soft-deleted suppliers too.
 */
router.get('/', async (req, res) => {
  try {
    const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
    const suppliers = await Supplier.find(filter).sort({ name: 1 });

    // Enrich each supplier with quick stats (total restocked qty + cost)
    // so the directory shows usefulness at a glance. Aggregating in one
    // pipeline is cheaper than N+1 lookups.
    const stats = await StockMovement.aggregate([
      { $match: { type: 'restock', supplier: { $ne: null } } },
      {
        $group: {
          _id: '$supplier',
          totalRestocked: { $sum: '$quantity' },
          totalSpent: { $sum: '$totalCost' },
          movements: { $sum: 1 },
          lastRestock: { $max: '$createdAt' },
        },
      },
    ]);
    const statsBySupplier = Object.fromEntries(stats.map((s) => [String(s._id), s]));

    const enriched = suppliers.map((s) => {
      const stat = statsBySupplier[String(s._id)] || {};
      return {
        ...s.toObject(),
        totalRestocked: stat.totalRestocked || 0,
        totalSpent: stat.totalSpent || 0,
        movements: stat.movements || 0,
        lastRestock: stat.lastRestock || null,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('GET /suppliers error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, contactPerson, email, phone, address, website, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }
    const supplier = new Supplier({
      name: name.trim(),
      contactPerson: (contactPerson || '').trim(),
      email: (email || '').trim().toLowerCase(),
      phone: (phone || '').trim(),
      address: (address || '').trim(),
      website: (website || '').trim(),
      notes: notes || '',
      createdBy: req.user.userId,
    });
    await supplier.save();
    res.status(201).json(supplier);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'A supplier with this name already exists' });
    }
    console.error('POST /suppliers error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const allowed = ['name', 'contactPerson', 'email', 'phone', 'address', 'website', 'notes', 'isActive'];
    const update = {};
    for (const key of allowed) {
      if (key in req.body) update[key] = req.body[key];
    }
    if ('name' in update) update.name = String(update.name || '').trim();
    if ('email' in update) update.email = String(update.email || '').trim().toLowerCase();
    update.updatedAt = new Date();

    const supplier = await Supplier.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'A supplier with this name already exists' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * DELETE — soft-deletes by default to preserve historical references in stock
 * movements. Pass ?hard=true to permanently delete (refuses if any movements
 * reference this supplier).
 */
router.delete('/:id', async (req, res) => {
  try {
    if (req.query.hard === 'true') {
      const refCount = await StockMovement.countDocuments({ supplier: req.params.id });
      if (refCount > 0) {
        return res.status(400).json({
          message: `Cannot hard-delete — ${refCount} stock movements reference this supplier. Soft-delete instead.`,
        });
      }
      await Supplier.findByIdAndDelete(req.params.id);
      return res.json({ message: 'Supplier permanently deleted' });
    }
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );
    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier archived', supplier });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
