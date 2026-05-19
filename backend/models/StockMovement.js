import mongoose from 'mongoose';

/**
 * Immutable audit log of every stock change.
 *
 * Every restock, sale, adjustment, return, damage write or reservation creates
 * exactly ONE StockMovement row. The row records both the delta and the
 * balance AFTER applying it, so the full stock history can be replayed without
 * recomputing aggregates. Movements should be created in the same transaction
 * (or sequential write) as the Inventory.stock update — see
 * routes/stockMovements.js for the canonical pattern.
 *
 * Movements are append-only: no `pre('save')` or update hooks. To "undo" a
 * movement, create a compensating one — never edit history.
 */
const stockMovementSchema = new mongoose.Schema({
  inventory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Inventory',
    required: true,
    index: true,
  },
  // Denormalized for cheap rendering when the inventory row is later deleted
  inventorySku: { type: String, required: true },
  inventoryName: { type: String, required: true },

  /**
   * Movement type drives both the sign convention (restocks add, sales/damage
   * subtract) and the badge color in the UI. Keep this list in sync with the
   * frontend's MOVEMENT_TYPES map.
   */
  type: {
    type: String,
    required: true,
    enum: [
      'restock',     // Inbound from supplier — positive quantity
      'sale',        // Outbound to fulfilled order — negative quantity
      'adjustment',  // Manual correction (count error, recount) — either sign
      'return',      // Customer return inbound — positive quantity
      'damage',      // Damaged/lost stock — negative quantity
      'reservation', // Reserved for pending order — does not change stock, only reservedStock
      'release',     // Released reservation (order cancelled) — does not change stock
      'initial',     // Initial stock when an item is created
    ],
    index: true,
  },

  /**
   * Signed delta applied to inventory.stock. Positive = inbound, negative =
   * outbound. Reservation/release movements record 0 here and use
   * reservationDelta below instead.
   */
  quantity: { type: Number, required: true },
  reservationDelta: { type: Number, default: 0 },

  // Stock counts captured at the moment of write — never recomputed.
  balanceBefore: { type: Number, required: true, min: 0 },
  balanceAfter: { type: Number, required: true, min: 0 },

  // ─── Restock-specific fields ──────────────────────────────────────────
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null },
  // Snapshot of supplier identity at the time of the movement — preserved
  // even if the supplier record is later renamed or soft-deleted.
  supplierSnapshot: {
    name: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
  },
  unitCost: { type: Number, min: 0, default: 0 },     // Per-unit cost in PHP
  totalCost: { type: Number, min: 0, default: 0 },    // quantity * unitCost
  invoiceNumber: { type: String, trim: true, default: '' },
  batchNumber: { type: String, trim: true, default: '' },
  expiryDate: { type: Date, default: null },

  // ─── Audit & context ─────────────────────────────────────────────────
  reason: { type: String, default: '' },              // Free-text required for adjustment/damage
  notes: { type: String, default: '' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String, default: '' },     // Snapshot — admin name at time of action
  performedByRole: { type: String, default: '' },
  relatedOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  createdAt: { type: Date, default: Date.now, index: true },
});

// Most common query: history for one item, newest first
stockMovementSchema.index({ inventory: 1, createdAt: -1 });
// Reports: recent restocks across all items
stockMovementSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model('StockMovement', stockMovementSchema);
