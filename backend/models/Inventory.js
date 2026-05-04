import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  stock: { type: Number, required: true, min: 0 },
  reservedStock: { type: Number, default: 0, min: 0 }, // Stock reserved by pending orders
  minStock: { type: Number, default: 10, min: 0 }, // Minimum stock threshold for alerts
  price: { type: Number, required: true, min: 0 },
  image: { type: String },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

inventorySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('Inventory', inventorySchema);
