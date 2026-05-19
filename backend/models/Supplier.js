import mongoose from 'mongoose';

/**
 * Supplier directory.
 *
 * Stored separately from StockMovement so that suppliers are reusable across
 * many restocks (admin picks from a dropdown instead of retyping contact info).
 * When a movement references a supplier we ALSO snapshot the name/contact
 * onto the movement record itself so historical entries remain accurate even
 * if a supplier is later renamed or deactivated.
 */
const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  contactPerson: { type: String, trim: true, default: '' },
  email: { type: String, trim: true, lowercase: true, default: '' },
  phone: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  website: { type: String, trim: true, default: '' },
  notes: { type: String, default: '' },
  // Soft-delete flag — keeps historical references intact
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

supplierSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

// Compound unique index — no two ACTIVE suppliers can share a name
supplierSchema.index(
  { name: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export default mongoose.model('Supplier', supplierSchema);
