import mongoose from 'mongoose';

/**
 * AbandonedCart — server-side snapshot of an active cart so we can email
 * the customer if they leave without completing checkout.
 *
 * Lifecycle:
 *   - Created/updated by the frontend periodically (debounced) while items
 *     are in the cart. We dedupe on (customer) — one active row per user.
 *   - Recovered: customer eventually places an order with these SKUs →
 *     status flips to 'recovered' so we stop emailing them.
 *   - Notified: the sweeper sends a recovery email after 60 min of
 *     inactivity, then 24h, then 72h. Each send updates `notifiedAt`
 *     and bumps `notifyStage` so we don't double-send.
 */
const abandonedCartSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    customerEmail: { type: String, default: '' },
    customerName: { type: String, default: '' },
    items: [
      {
        sku: String,
        name: String,
        quantity: Number,
        unitPrice: Number,
        customization: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    subtotal: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['active', 'recovered', 'expired'],
      default: 'active',
      index: true,
    },
    notifyStage: { type: Number, default: 0 }, // 0 = none, 1 = 1h, 2 = 24h, 3 = 72h
    lastNotifiedAt: { type: Date },
    recoveredAt: { type: Date },
    recoveredOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: true },
);

abandonedCartSchema.index({ status: 1, updatedAt: 1, notifyStage: 1 });

export default mongoose.model('AbandonedCart', abandonedCartSchema);
