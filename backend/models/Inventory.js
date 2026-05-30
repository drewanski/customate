import mongoose from 'mongoose';

const sizeOptionSchema = new mongoose.Schema({
  code: { type: String, required: true },           // 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL'
  label: { type: String, default: '' },             // 'Small', 'Medium', etc.
  chest: { type: String, default: '' },             // '36-38 in'
  length: { type: String, default: '' },            // '27 in'
  weight: { type: String, default: '' },            // '50-60 kg'
  height: { type: String, default: '' },            // "5'0\"-5'4\""
  priceModifier: { type: Number, default: 0 },      // peso surcharge over base
}, { _id: false });

const colorOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },           // 'Black', 'Navy Blue'
  hex: { type: String, required: true },            // '#000000'
  priceModifier: { type: Number, default: 0 },
}, { _id: false });

const shirtTypeSchema = new mongoose.Schema({
  code: { type: String, required: true },           // 'polo' | 'v-neck' | 'round-neck' | 'oversized'
  label: { type: String, default: '' },
  modelKey: { type: String, default: '' },          // overrides default 3D model when present
  priceModifier: { type: Number, default: 0 },
}, { _id: false });

const inventorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  stock: { type: Number, required: true, min: 0 },
  reservedStock: { type: Number, default: 0, min: 0 }, // Stock reserved by pending orders
  minStock: { type: Number, default: 10, min: 0 }, // Minimum stock threshold for alerts
  price: { type: Number, required: true, min: 0 },
  image: { type: String },
  gltfUrl: { type: String },      // URL to the hosted GLB file for 3D preview
  productKey: { type: String },   // App-side key: 'tshirt' | 'hoodie' | 'cap' | 'mug' | 'tote' | 'jersey' | 'mousepad' | 'handfan'
  description: { type: String },
  isActive: { type: Boolean, default: true },

  // ─── Variants & customization options (panel revision #1–3) ────────────
  // sizes: garment sizes with body measurement guide. Empty array → not size-applicable.
  sizes: { type: [sizeOptionSchema], default: [] },
  // availableColors: optional curated palette for the 3D color picker. If
  // empty, the customizer falls back to a generic palette.
  availableColors: { type: [colorOptionSchema], default: [] },
  // shirtTypes: when this is a shirt-family product (productKey starts with
  // tshirt/jersey/polo/etc), populate this with the variants the customer
  // can pick. Each one can swap the 3D model and modify price.
  shirtTypes: { type: [shirtTypeSchema], default: [] },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

inventorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual: stock status for catalog display (low_stock threshold = minStock).
// Returns 'out_of_stock' | 'low_stock' | 'available' based on (stock - reservedStock).
inventorySchema.virtual('stockStatus').get(function () {
  const available = Math.max(0, (this.stock || 0) - (this.reservedStock || 0));
  if (available <= 0) return 'out_of_stock';
  if (available <= (this.minStock || 0)) return 'low_stock';
  return 'available';
});

inventorySchema.virtual('availableStock').get(function () {
  return Math.max(0, (this.stock || 0) - (this.reservedStock || 0));
});

export default mongoose.model('Inventory', inventorySchema);
