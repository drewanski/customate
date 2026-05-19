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
        image: { type: String },
        // ─── Design snapshot ────────────────────────────────────────────
        // Set true when the customer went through the 3D studio AND made
        // at least one meaningful change. Plain re-orders / "naked product"
        // checkouts leave this false so production can skip the custom-print
        // step entirely for those line items.
        isCustomized: { type: Boolean, default: false },
        // Data URL (base64 PNG) of the final 3D preview the customer saw.
        // Stored inline because we don't have an object-storage layer wired
        // up — a future enhancement would upload this to Cloudinary and
        // store only the URL. Mongoose handles up to 16 MB / doc which
        // comfortably fits even a high-res 800×600 PNG (~200 KB).
        previewImage: { type: String, default: '' },
        // Serialized design state so production can re-render or re-print
        // the exact same configuration later (Mixed = anything goes).
        designConfig: { type: mongoose.Schema.Types.Mixed, default: null },
      }
    }
  ],
  totalQty: { type: Number, required: true, min: 1 },
  totalPrice: { type: Number, required: true, min: 0 },
  isBulk: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['pending', 'approved', 'in_production', 'ready', 'completed', 'shipped', 'delivered', 'cancelled', 'rejected', 'refunded'],
    default: 'pending'
  },
  // Refund tracking — kept as separate fields so a refunded order still
  // shows its terminal status (cancelled/completed/etc) and full amount.
  refundedAmount: { type: Number, default: 0, min: 0 },
  refundedAt: { type: Date },
  refundReason: { type: String, default: '' },

  // ─── Delivery scheduling & urgency ──────────────────────────────────────
  // The customer's preferred delivery date drives our urgency classification.
  // We freeze the tier + rush fee at order time so future tier-table changes
  // don't retroactively alter this order's price or queue position.
  requestedDeliveryDate: { type: Date, index: true },
  urgencyTier: {
    type: String,
    enum: ['standard', 'express', 'rush', 'priority'],
    default: 'standard',
    index: true,
  },
  // Rush-fee amount frozen at placement (peso). Already included in totalPrice.
  rushFeeAmount: { type: Number, default: 0, min: 0 },
  // Business days between order date and requested delivery — frozen for audit.
  leadTimeDays: { type: Number, default: 0, min: 0 },

  // ─── Coupon / discount snapshot ─────────────────────────────────────────
  // Captured at order placement and frozen. Even if the coupon is later
  // edited or deleted, the order knows exactly what discount was applied
  // and why — for refund handling, customer support, accounting.
  couponCode: { type: String, default: '' },
  couponName: { type: String, default: '' },
  couponType: { type: String, default: '' },
  discountAmount: { type: Number, default: 0, min: 0 },
  subtotalBeforeDiscount: { type: Number, default: 0, min: 0 },
  // Free-form internal admin notes (the audit log holds the timeline; this
  // field holds the "current state" note pinned to the order header).
  adminNote: { type: String, default: '' },
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
  paymongoLinkId: { type: String },
  // ─── Production scheduling ──────────────────────────────────────────────
  // productionDate = when work STARTS. productionDueDate = target finish.
  // productionStage tracks where in the pipeline the order currently sits;
  // see PRODUCTION_STAGES below for the canonical order.
  productionDate: { type: Date },
  productionDueDate: { type: Date },
  productionStartedAt: { type: Date },
  productionCompletedAt: { type: Date },
  // Soft estimate captured at scheduling time, used to auto-fill due date
  estimatedDurationDays: { type: Number, default: 3, min: 0 },
  productionStage: {
    type: String,
    enum: [
      'queued',          // Not yet in production
      'design_review',   // Verifying artwork / customization specs
      'printing',        // Printing decals / sublimation
      'assembly',        // Sewing / assembly
      'quality_check',   // QC pass
      'packing',         // Packing & labelling
      'ready',           // Ready for shipment / pickup
    ],
    default: 'queued',
    index: true,
  },
  productionNotes: { type: String },
  productionPriority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium', index: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Useful indexes for the production queue queries
orderSchema.index({ status: 1, productionDate: 1 });
orderSchema.index({ status: 1, productionStage: 1, productionPriority: -1 });
// Priority queue: urgency tier first, then by requested delivery date.
orderSchema.index({ urgencyTier: 1, requestedDeliveryDate: 1 });
// Admin calendar lookups: by requested delivery date.
orderSchema.index({ requestedDeliveryDate: 1, status: 1 });

/**
 * Canonical stage pipeline. Exported so routes/UI can show the next/previous
 * stage and stay in sync without hardcoding the enum twice.
 */
export const PRODUCTION_STAGES = [
  'queued',
  'design_review',
  'printing',
  'assembly',
  'quality_check',
  'packing',
  'ready',
];

export default mongoose.model('Order', orderSchema);
