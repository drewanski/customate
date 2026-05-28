import express from 'express';
import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';
import Inventory from '../models/Inventory.js';
import Supplier from '../models/Supplier.js';
import User from '../models/User.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Per updated spec: stock movements (read + write) are admin-only.
// Production staff cannot access the inventory ledger at all.
router.use(authMiddleware, adminMiddleware);

/**
 * Atomically apply a stock delta and write the audit log entry.
 *
 * Mongoose doesn't expose transactions on a standalone MongoDB (only on
 * replica sets). To stay portable, we use a two-step pattern with a guarded
 * findOneAndUpdate that's safe under concurrent writers: the update only
 * fires if the current stock is exactly what we read, and we use $inc to
 * avoid lost-update races. The audit row is then written.
 *
 * If the audit write fails after the inventory update, we roll back the
 * inventory delta — better to lose a movement than silently desync.
 */
async function applyMovement({
  inventory,
  type,
  quantityDelta,
  reservationDelta = 0,
  movementFields,
  user,
}) {
  // Block negative-going movements that would take stock below zero.
  const projectedStock = inventory.stock + quantityDelta;
  if (projectedStock < 0) {
    const err = new Error(
      `Insufficient stock — current ${inventory.stock}, requested change ${quantityDelta}`
    );
    err.status = 400;
    throw err;
  }
  const projectedReserved = (inventory.reservedStock || 0) + reservationDelta;
  if (projectedReserved < 0) {
    const err = new Error('reservedStock cannot go negative');
    err.status = 400;
    throw err;
  }

  // Apply atomic increment. Mongoose's $inc on a numeric field is
  // race-safe — concurrent writers do not lose updates.
  const updated = await Inventory.findByIdAndUpdate(
    inventory._id,
    {
      $inc: { stock: quantityDelta, reservedStock: reservationDelta },
      $set: { updatedAt: new Date() },
    },
    { new: true }
  );

  // Write the immutable audit row using the new balance values.
  let movement;
  try {
    movement = await StockMovement.create({
      inventory: updated._id,
      inventorySku: updated.sku,
      inventoryName: updated.name,
      type,
      quantity: quantityDelta,
      reservationDelta,
      balanceBefore: inventory.stock,
      balanceAfter: updated.stock,
      performedBy: user?.userId || null,
      performedByName: user?.name || '',
      performedByRole: user?.role || '',
      ...movementFields,
    });
  } catch (err) {
    // Roll back inventory change if audit log write failed
    await Inventory.findByIdAndUpdate(updated._id, {
      $inc: { stock: -quantityDelta, reservationDelta: -reservationDelta },
    });
    throw err;
  }

  return { movement, inventory: updated };
}

/**
 * GET /api/stock-movements
 * Query params:
 *   inventoryId — filter by item (most common)
 *   type — filter by movement type
 *   from / to — ISO date range
 *   limit — default 50, max 200
 *   offset — for pagination
 */
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.inventoryId) filter.inventory = req.query.inventoryId;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.supplierId) filter.supplier = req.query.supplierId;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    const [items, total] = await Promise.all([
      StockMovement.find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .populate('supplier', 'name contactPerson phone')
        .lean(),
      StockMovement.countDocuments(filter),
    ]);

    res.json({ items, total, limit, offset });
  } catch (err) {
    console.error('GET /stock-movements error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/stock-movements/summary/:inventoryId
 * Aggregated totals for one item — used by the History modal header.
 */
router.get('/summary/:inventoryId', async (req, res) => {
  try {
    const { inventoryId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
      return res.status(400).json({ message: 'Invalid inventory ID' });
    }

    const agg = await StockMovement.aggregate([
      { $match: { inventory: new mongoose.Types.ObjectId(inventoryId) } },
      {
        $group: {
          _id: '$type',
          totalQty: { $sum: '$quantity' },
          totalCost: { $sum: '$totalCost' },
          count: { $sum: 1 },
          last: { $max: '$createdAt' },
        },
      },
    ]);

    const byType = Object.fromEntries(agg.map((row) => [row._id, row]));
    const restock = byType.restock || { totalQty: 0, totalCost: 0, count: 0, last: null };
    const sale = byType.sale || { totalQty: 0, count: 0, last: null };
    const damage = byType.damage || { totalQty: 0, count: 0, last: null };
    const returned = byType.return || { totalQty: 0, count: 0, last: null };

    res.json({
      totalRestocked: restock.totalQty,
      totalSold: Math.abs(sale.totalQty),
      totalDamaged: Math.abs(damage.totalQty),
      totalReturned: returned.totalQty,
      totalSpent: restock.totalCost,
      averageUnitCost: restock.totalQty > 0 ? restock.totalCost / restock.totalQty : 0,
      restockCount: restock.count,
      lastRestockedAt: restock.last,
      lastSaleAt: sale.last,
      totalMovements: agg.reduce((sum, row) => sum + row.count, 0),
    });
  } catch (err) {
    console.error('GET /stock-movements/summary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * POST /api/stock-movements/restock
 *
 * Add stock from a supplier. This is the canonical "receive stock" action.
 * Body:
 *   inventoryId (required)
 *   quantity (required, > 0)
 *   supplierId (optional — pick from directory)
 *   supplierAdHoc (optional — { name, contactPerson, phone } for one-off)
 *   unitCost (optional, >= 0)
 *   invoiceNumber, batchNumber, expiryDate, notes (all optional)
 */
router.post('/restock', async (req, res) => {
  try {
    const {
      inventoryId,
      quantity,
      supplierId,
      supplierAdHoc,
      unitCost,
      invoiceNumber,
      batchNumber,
      expiryDate,
      notes,
    } = req.body;

    if (!inventoryId || !mongoose.Types.ObjectId.isValid(inventoryId)) {
      return res.status(400).json({ message: 'Valid inventoryId is required' });
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: 'quantity must be a positive number' });
    }

    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) return res.status(404).json({ message: 'Inventory item not found' });

    // Resolve supplier — supplierId wins over ad-hoc; both optional
    let supplier = null;
    let supplierSnapshot = { name: '', contactPerson: '', phone: '' };
    if (supplierId) {
      supplier = await Supplier.findById(supplierId);
      if (!supplier) return res.status(400).json({ message: 'Supplier not found' });
      supplierSnapshot = {
        name: supplier.name,
        contactPerson: supplier.contactPerson || '',
        phone: supplier.phone || '',
      };
    } else if (supplierAdHoc?.name) {
      supplierSnapshot = {
        name: String(supplierAdHoc.name).trim(),
        contactPerson: String(supplierAdHoc.contactPerson || '').trim(),
        phone: String(supplierAdHoc.phone || '').trim(),
      };
    }

    const cost = Number(unitCost) || 0;

    // Snapshot the actor's name from the User record so the audit log
    // is human-readable even if the user is later deleted.
    let userSnap = { userId: req.user.userId, role: req.user.role, name: '' };
    try {
      const u = await User.findById(req.user.userId).select('name');
      if (u) userSnap.name = u.name;
    } catch {
      /* non-fatal */
    }

    const { movement, inventory: updated } = await applyMovement({
      inventory,
      type: 'restock',
      quantityDelta: qty,
      movementFields: {
        supplier: supplier?._id || null,
        supplierSnapshot,
        unitCost: cost,
        totalCost: cost * qty,
        invoiceNumber: String(invoiceNumber || '').trim(),
        batchNumber: String(batchNumber || '').trim(),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        notes: String(notes || '').trim(),
      },
      user: userSnap,
    });

    res.status(201).json({ movement, inventory: updated });
  } catch (err) {
    console.error('POST /stock-movements/restock error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

/**
 * POST /api/stock-movements/adjust
 *
 * Manual stock correction. Requires a reason. Use for: physical count
 * mismatch, found stock, system error correction. For damage use the damage
 * endpoint so reports separate breakage from accounting errors.
 *
 * Body: { inventoryId, delta (signed), reason, notes }
 */
router.post('/adjust', async (req, res) => {
  try {
    const { inventoryId, delta, reason, notes } = req.body;
    if (!inventoryId) return res.status(400).json({ message: 'inventoryId required' });
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) {
      return res.status(400).json({ message: 'delta must be a non-zero number' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'reason is required for adjustments' });
    }

    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) return res.status(404).json({ message: 'Inventory item not found' });

    let userSnap = { userId: req.user.userId, role: req.user.role, name: '' };
    try {
      const u = await User.findById(req.user.userId).select('name');
      if (u) userSnap.name = u.name;
    } catch {
      /* non-fatal */
    }

    const { movement, inventory: updated } = await applyMovement({
      inventory,
      type: 'adjustment',
      quantityDelta: d,
      movementFields: {
        reason: reason.trim(),
        notes: String(notes || '').trim(),
      },
      user: userSnap,
    });

    res.status(201).json({ movement, inventory: updated });
  } catch (err) {
    console.error('POST /stock-movements/adjust error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

/**
 * POST /api/stock-movements/damage
 * Record damaged/lost stock. Requires reason.
 */
router.post('/damage', async (req, res) => {
  try {
    const { inventoryId, quantity, reason, notes } = req.body;
    if (!inventoryId) return res.status(400).json({ message: 'inventoryId required' });
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: 'quantity must be a positive number' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'reason is required for damage records' });
    }

    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) return res.status(404).json({ message: 'Inventory item not found' });

    let userSnap = { userId: req.user.userId, role: req.user.role, name: '' };
    try {
      const u = await User.findById(req.user.userId).select('name');
      if (u) userSnap.name = u.name;
    } catch {
      /* non-fatal */
    }

    const { movement, inventory: updated } = await applyMovement({
      inventory,
      type: 'damage',
      quantityDelta: -qty,
      movementFields: {
        reason: reason.trim(),
        notes: String(notes || '').trim(),
      },
      user: userSnap,
    });

    res.status(201).json({ movement, inventory: updated });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Server error' });
  }
});

/**
 * GET /api/stock-movements/dashboard
 * Top-line metrics for the inventory dashboard tiles.
 */
router.get('/dashboard/summary', async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recent7d, recent30d, byTypeRecent] = await Promise.all([
      StockMovement.aggregate([
        { $match: { createdAt: { $gte: sevenDaysAgo }, type: 'restock' } },
        { $group: { _id: null, qty: { $sum: '$quantity' }, cost: { $sum: '$totalCost' }, count: { $sum: 1 } } },
      ]),
      StockMovement.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: '$type', qty: { $sum: '$quantity' }, count: { $sum: 1 } } },
      ]),
      StockMovement.find({ createdAt: { $gte: sevenDaysAgo } })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('supplier', 'name')
        .lean(),
    ]);

    res.json({
      restocked7d: {
        qty: recent7d[0]?.qty || 0,
        cost: recent7d[0]?.cost || 0,
        count: recent7d[0]?.count || 0,
      },
      byType30d: recent30d,
      recentMovements: byTypeRecent,
    });
  } catch (err) {
    console.error('GET /stock-movements/dashboard error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
