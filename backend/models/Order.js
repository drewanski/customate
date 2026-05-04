import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [
    {
      sku: { type: String, required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
      customization: {
        size: { type: String },
        color: { type: String },
        placement: { type: String },
        text: { type: String },
        font: { type: String },
        image: { type: String }
      }
    }
  ],
  totalQty: { type: Number, required: true, min: 1 },
  totalPrice: { type: Number, required: true, min: 0 },
  isBulk: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['pending', 'approved', 'in_production', 'ready', 'completed', 'shipped', 'delivered', 'cancelled', 'rejected'],
    default: 'pending'
  },
  paymentMethod: { type: String, enum: ['cod', 'gcash', 'paymaya', 'bank'], default: 'cod' },
  paymentStatus: { type: String, enum: ['pending', 'awaiting_payment', 'partial', 'paid', 'failed'], default: 'pending' },
  paidAmount: { type: Number, default: 0, min: 0 },
  requiredPayment: { type: Number, default: 0, min: 0 },
  shippingAddress: { type: String, required: true },
  contactPhone: { type: String },
  notes: { type: String },
  paymentDetails: {
    referenceNumber: { type: String },
    phoneNumber: { type: String },
    timestamp: { type: Date },
    paymongoPaymentId: { type: String },
    paymongoSourceId: { type: String },
    paymongoLinkId: { type: String },
    paidAt: { type: Date }
  },
  // PayMongo tracking fields
  paymongoSourceId: { type: String },
  paymongoPaymentId: { type: String },
  paymongoLinkId: { type: String }
}, { timestamps: true });

export default mongoose.model('Order', orderSchema);
