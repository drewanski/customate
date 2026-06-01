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
        shirtType: { type: String },
        // Chosen fabric code (e.g. 'cotton', 'drifit'). Looked up against
        // the product's fabrics[] at order-create so production gets the
        // exact spec and the customer pays the right priceModifier.
        fabric: { type: String },
        fabricLabel: { type: String },
        placement: { type: String },
        text: { type: String },
        font: { type: String },
        image: { type: String },
        printAreas: { type: Number, default: 1, min: 1 },
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

  // ─── Workflow version ─────────────────────────────────────────────────
  // 'classic'   — legacy single-payment flow used by orders placed before
  //               the quotation overhaul. Existing orders keep working.
  // 'quotation' — new flow: customer submits a request, admin sends a
  //               quotation in chat, customer accepts + pays 50%
  //               downpayment, production runs, customer pays the 50%
  //               balance, order is released. See VALID_TRANSITIONS and
  //               checkTransitionPrecondition for the gates.
  workflowVersion: { type: String, enum: ['classic', 'quotation'], default: 'classic', index: true },

  status: {
    type: String,
    enum: [
      // Quotation workflow (new orders default here once they're submitted as quotation)
      'quote_requested',   // customer submitted a request, no quote yet
      'quoted',            // admin sent a quote, awaiting customer accept
      'accepted',          // customer accepted, awaiting downpayment proof
      'downpayment_paid',  // admin verified the 50% downpayment
      // Shared with classic flow from here on
      'pending',           // classic flow only: created with payment-on-checkout
      'approved',
      'in_production',
      'ready',
      'out_for_delivery',
      'for_pickup',
      'completed',
      // Legacy
      'shipped', 'delivered',
      // Terminal
      'cancelled', 'rejected', 'refunded',
    ],
    default: 'pending'
  },

  // ─── Quotation (filled by admin during the quote phase) ────────────────
  // lineItems[] is what the customer sees on the Quote Card in chat. Admin
  // can pre-fill from the cart and edit freely, or type a single override
  // line + total. Total is the source of truth — the lineItems sum SHOULD
  // equal it but the admin always wins (one Manual Override line absorbs
  // any difference and is audited).
  quotation: {
    lineItems: [
      {
        label: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
      },
    ],
    total: { type: Number, default: 0, min: 0 },
    downpaymentAmount: { type: Number, default: 0, min: 0 },  // 50% of total
    balanceAmount: { type: Number, default: 0, min: 0 },      // 50% of total
    sentAt: { type: Date, default: null },
    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
    declinedAt: { type: Date, default: null },
    declinedReason: { type: String, default: '' },
    // Each revision archived so the audit trail shows negotiations.
    revisions: [
      {
        sentAt: { type: Date },
        sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        total: { type: Number },
        lineItems: [{ label: String, amount: Number }],
      },
    ],
  },

  // ─── Quotation payments (two-stage: downpayment + balance) ──────────
  // Each stage has the same shape: amount, method, proof images uploaded
  // by the customer (GCash/bank screenshots), admin verification, and an
  // optional reject path that asks the customer to re-upload.
  payments: {
    downpayment: {
      amount: { type: Number, default: 0, min: 0 },
      method: { type: String, default: '' },          // 'gcash', 'paymaya', 'bank', 'paymongo', 'cash'
      reference: { type: String, default: '' },       // GCash ref #, bank txn id, etc.
      proofUrls: { type: [String], default: [] },     // Customer-uploaded screenshots
      submittedAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: '' },
    },
    balance: {
      amount: { type: Number, default: 0, min: 0 },
      method: { type: String, default: '' },
      reference: { type: String, default: '' },
      proofUrls: { type: [String], default: [] },
      submittedAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      rejectedAt: { type: Date, default: null },
      rejectionReason: { type: String, default: '' },
    },
  },
  // Refund tracking — kept as separate fields so a refunded order still
  // shows its terminal status (cancelled/completed/etc) and full amount.
  refundedAmount: { type: Number, default: 0, min: 0 },
  refundedAt: { type: Date },
  refundReason: { type: String, default: '' },

  // Required when admin rejects/cancels (panel revision #12). Stored so the
  // customer sees a clear explanation in their order history + notification.
  rejectionReason: { type: String, default: '' },
  cancellationReason: { type: String, default: '' },
  cancelledAt: { type: Date },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Delivery method (panel revision #11). Drives the post-Ready pipeline:
  //   delivery → out_for_delivery → completed
  //   pickup   → for_pickup       → completed
  deliveryMethod: { type: String, enum: ['delivery', 'pickup'], default: 'delivery' },
  completedAt: { type: Date },

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
  // Shipping fee frozen at placement (peso). Already included in totalPrice.
  // Pickup orders are always 0; delivery orders apply the threshold rule
  // (free over ₱500, ₱100 otherwise). Computed server-side so the customer
  // can't manipulate it client-side.
  shippingFee: { type: Number, default: 0, min: 0 },
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
  // Quotation orders have no payment method at submit time — the customer
  // pays via the chat-uploaded proof flow after the quote is accepted.
  // Allow empty string + add later proof-flow methods to the enum.
  paymentMethod: { type: String, enum: ['', 'cod', 'gcash', 'paymaya', 'bank', 'cash'], default: 'cod' },
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

  // ─── Courier handoff (3rd-party delivery) ─────────────────────────────
  // CustoMate doesn't run its own fleet — orders ship via Lalamove, LBC,
  // Grab, J&T, etc. Admin fills this in right before flipping the order
  // to out_for_delivery; the saved values appear on the customer's
  // tracking page AND get auto-posted into the chat thread as a system
  // message so the customer can copy the tracking number from chat.
  courier: {
    name: { type: String, default: '' },                // 'Lalamove', 'LBC', 'Grab', 'J&T', 'Other'
    trackingNumber: { type: String, default: '' },
    trackingUrl: { type: String, default: '' },         // Optional deep-link
    contactPhone: { type: String, default: '' },        // Rider/driver phone if provided
    notes: { type: String, default: '' },               // Free-form (e.g. "rider arriving 3-5pm")
    handedOffAt: { type: Date },
    handedOffBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
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

  // Whether real stock has already been deducted from inventory. We flip
  // this true the first time an order moves to `approved` (or skips straight
  // to shipped) so subsequent status transitions don't double-deduct. Stays
  // true even after the order completes — set back to false only on a
  // return-restock event.
  inventoryConsumed: { type: Boolean, default: false, index: true },
  inventoryConsumedAt: { type: Date, default: null },

  // ─── Quality Control (staff-uploaded finished-product photo) ─────────
  // The full lifecycle:
  //   1. Staff finishes the work, clicks "Submit for QC", uploads a photo
  //      of the finished product. qcStatus → 'pending', qcPhoto stored.
  //   2. Admin reviews. Approves → order status flips to 'ready',
  //      qcStatus='approved', qcApprovedBy/At stamped. Rejects → bounces
  //      to 'in_production' with qcRejectionReason and qcStatus='rejected'.
  //   3. The previous qcPhoto stays for audit; staff uploads a new one
  //      to retry, which overwrites it.
  qcStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none',
    index: true,
  },
  qcPhoto: { type: String, default: '' },           // hosted URL OR dataURL
  qcPhotoUploadedAt: { type: Date, default: null },
  qcPhotoUploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  qcApprovedAt: { type: Date, default: null },
  qcApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  qcRejectedAt: { type: Date, default: null },
  qcRejectionReason: { type: String, default: '' },

  // ─── Blocker tracking ───────────────────────────────────────────────
  // Staff can flag a task as blocked when they can't continue (out of
  // material, machine down, design unclear, etc). Auto-bumps priority
  // to 'urgent' so the admin sees it at the top of the queue. Admin
  // clears the blocker by calling /clear-blocker which restores the
  // previous priority and lets work resume.
  blockerStatus: {
    type: String,
    enum: ['none', 'active', 'cleared'],
    default: 'none',
    index: true,
  },
  blockerReason: {
    type: String,
    enum: [
      'none',
      'material_out_of_stock',
      'machine_issue',
      'design_unclear',
      'customer_change_requested',
      'damaged_during_production',
      'other',
    ],
    default: 'none',
  },
  blockerNote: { type: String, default: '' },
  blockedAt: { type: Date, default: null },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Snapshot of the priority right before the blocker bumped it to urgent,
  // so we can restore it on clear.
  preBlockerPriority: { type: String, default: '' },

  // ─── Production time tracking ───────────────────────────────────────
  // productionLastStartedAt is set every time the status becomes
  // 'in_production'. productionTimeMinutes accumulates the elapsed time
  // each time the status leaves 'in_production' (forward or backward —
  // even blockers stop the clock so paused time doesn't pollute the metric).
  productionLastStartedAt: { type: Date, default: null },
  productionTimeMinutes: { type: Number, default: 0 },
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

// Order statuses where the customer can no longer self-cancel (panel #10).
// The lock kicks in at in_production and stays on for every later stage —
// we don't want a customer killing an order the staff is actively working on.
export const CUSTOMER_CANCEL_LOCKED_STATUSES = [
  'in_production',
  'ready',
  'out_for_delivery',
  'for_pickup',
  'completed',
  'shipped',
  'delivered',
  'refunded',
  'cancelled',
  'rejected',
];

// Pipeline that runs AFTER the production-floor stages complete. Determined
// by deliveryMethod chosen at checkout:
//   delivery → ready → out_for_delivery → completed
//   pickup   → ready → for_pickup       → completed
export const POST_PRODUCTION_PIPELINE = {
  delivery: ['ready', 'out_for_delivery', 'completed'],
  pickup: ['ready', 'for_pickup', 'completed'],
};

/**
 * Canonical status state-machine.
 *
 * Each key is a starting status; the array lists every status a transition
 * from there is legally allowed to reach. Anything not in the array is a
 * 400 at the API layer — so admin can no longer skip pending→completed,
 * un-cancel an order, or reopen a refund.
 *
 * Cancelled / rejected / refunded are terminal — explicit reopen would have
 * to go through a dedicated route that re-validates inventory + payment.
 */
export const VALID_TRANSITIONS = {
  // ── Quotation workflow ───────────────────────────────────────────────
  // quote_requested → quoted    : admin sends the quotation
  // quoted          → accepted  : customer accepts the quote (or re-quote)
  // quoted          → quote_requested : admin revises (sends a new quote)
  // accepted        → downpayment_paid: admin verifies the 50% deposit
  // downpayment_paid→ approved  : admin approves now that money is in
  quote_requested:  ['quoted', 'cancelled', 'rejected'],
  quoted:           ['accepted', 'quote_requested', 'cancelled', 'rejected'],
  accepted:         ['downpayment_paid', 'quoted', 'cancelled'],
  downpayment_paid: ['approved', 'cancelled'],
  // ── Classic workflow (legacy single-payment) ─────────────────────────
  pending:          ['approved', 'cancelled', 'rejected'],
  // ── Shared from approved onwards ─────────────────────────────────────
  approved:         ['in_production', 'cancelled'],
  in_production:    ['ready', 'cancelled'],
  ready:            ['out_for_delivery', 'for_pickup', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  for_pickup:       ['completed', 'cancelled'],
  // Legacy statuses kept routable for orders placed before the new pipeline.
  shipped:          ['completed', 'delivered', 'cancelled'],
  delivered:        ['completed', 'refunded'],
  // Terminal — no further transitions.
  completed:        ['refunded'],
  cancelled:        [],
  rejected:         [],
  refunded:         [],
};

/**
 * Pre-condition table per (from, to) edge.
 *
 * Each entry returns either `{ ok: true }` or `{ ok: false, code, message }`.
 * The route layer runs the matching check before mutating the document.
 *
 * Keeping this DECLARATIVE (vs scattered if-statements across the routes)
 * means the same rules apply to single PUT, bulk-status, the production
 * /advance path, and any future channel that flips status.
 */
export function checkTransitionPrecondition(order, to, { reason, override } = {}) {
  const from = order.status;

  // Reason is required for cancel/reject everywhere.
  if ((to === 'cancelled' || to === 'rejected') && !(reason && String(reason).trim())) {
    return { ok: false, code: 'REASON_REQUIRED', message: `A reason is required to ${to === 'rejected' ? 'reject' : 'cancel'} this order.` };
  }

  // pending → approved : payment must be settled (or COD)
  if (from === 'pending' && to === 'approved') {
    const paid = order.paymentStatus === 'paid' || order.paymentMethod === 'cod';
    if (!paid) {
      return { ok: false, code: 'PAYMENT_NOT_SETTLED', message: 'Cannot approve — payment is still awaiting. Confirm payment before approving.' };
    }
  }

  // ── Quotation flow gates ─────────────────────────────────────────────
  // quote_requested → quoted : a quotation total must exist
  if (from === 'quote_requested' && to === 'quoted') {
    const total = order.quotation && Number(order.quotation.total) > 0;
    if (!total) {
      return { ok: false, code: 'NO_QUOTE_TOTAL', message: 'Enter a quotation total before sending the quote to the customer.' };
    }
  }
  // quoted → accepted : only the customer can accept (route enforces this);
  //   precondition layer just requires the quote to have been sent.
  if (from === 'quoted' && to === 'accepted') {
    if (!order.quotation || !order.quotation.sentAt) {
      return { ok: false, code: 'QUOTE_NOT_SENT', message: 'No quotation has been sent yet.' };
    }
  }
  // accepted → downpayment_paid : downpayment must be verified by admin
  if (from === 'accepted' && to === 'downpayment_paid') {
    const v = order.payments && order.payments.downpayment && order.payments.downpayment.verifiedAt;
    if (!v && !override) {
      return { ok: false, code: 'DOWNPAYMENT_NOT_VERIFIED', message: 'Downpayment has not been verified yet.' };
    }
  }
  // downpayment_paid → approved : trivial pass-through, gives admin one
  //   explicit click to take ownership of approval.
  // (No precondition beyond the standard transition allowlist.)

  // ── Balance gate for quotation orders only ───────────────────────────
  // ready → out_for_delivery / for_pickup REQUIRES balance.verifiedAt
  // on quotation-flow orders. No override path — this is the hard
  // "no release without final payment" rule the workflow spec requires.
  if (
    order.workflowVersion === 'quotation'
    && from === 'ready'
    && (to === 'out_for_delivery' || to === 'for_pickup')
  ) {
    const bv = order.payments && order.payments.balance && order.payments.balance.verifiedAt;
    if (!bv) {
      return { ok: false, code: 'BALANCE_NOT_VERIFIED', message: 'Final balance payment has not been verified. Verify the customer\'s balance payment before releasing the order.' };
    }
  }
  // out_for_delivery / for_pickup → completed REQUIRES balance verified too
  // (defence-in-depth in case someone bypassed the previous gate).
  if (
    order.workflowVersion === 'quotation'
    && (from === 'out_for_delivery' || from === 'for_pickup')
    && to === 'completed'
  ) {
    const bv = order.payments && order.payments.balance && order.payments.balance.verifiedAt;
    if (!bv) {
      return { ok: false, code: 'BALANCE_NOT_VERIFIED', message: 'Cannot complete — balance payment has not been verified.' };
    }
  }

  // approved → in_production : an owner must exist OR override note
  if (from === 'approved' && to === 'in_production' && !order.assignedTo && !override) {
    return { ok: false, code: 'NO_ASSIGNEE', message: 'Assign this order to a production staff member before starting production.' };
  }

  // approved/in_production → ready : QC must have passed (or explicit override)
  if (to === 'ready' && from === 'in_production') {
    if (order.qcStatus !== 'approved' && !override) {
      return { ok: false, code: 'QC_NOT_APPROVED', message: 'Quality check must be approved first. Use the QC review panel or pass override=true with an admin note.' };
    }
  }

  // ready → out_for_delivery : delivery-method must match the customer's
  // choice. No QC re-check here — reaching `ready` already required QC
  // approval (the in_production → ready gate), so re-asking would either
  // be a no-op (the order has qcStatus=approved already) or force a
  // double-override for legitimate emergency-release scenarios.
  if (from === 'ready' && to === 'out_for_delivery') {
    if (order.deliveryMethod === 'pickup') {
      return { ok: false, code: 'DELIVERY_METHOD_MISMATCH', message: 'This is a pickup order — use "Ready for pickup" instead of "Out for delivery".' };
    }
  }

  // ready → for_pickup : same — delivery-method match only.
  if (from === 'ready' && to === 'for_pickup') {
    if (order.deliveryMethod === 'delivery') {
      return { ok: false, code: 'DELIVERY_METHOD_MISMATCH', message: 'This is a delivery order — use "Out for delivery" instead of "Ready for pickup".' };
    }
  }

  // Active blocker should never advance forward
  if (order.blockerStatus === 'active' && to !== 'cancelled' && to !== 'rejected') {
    return { ok: false, code: 'BLOCKER_ACTIVE', message: 'This order has an active blocker. Clear the blocker before advancing the status.' };
  }

  return { ok: true };
}

/**
 * Atomically attempt a status transition. Uses findOneAndUpdate with a status
 * filter so that two simultaneous flips can't both win — the loser sees null
 * and the route returns 409. Inventory + audit logging happen AFTER this
 * succeeds so they only run once.
 *
 * Note: caller still has to do the inventory side-effects + audit + chat —
 * this helper only guarantees the status flip is single-winner.
 */
export async function atomicallyTransitionStatus(Model, orderId, fromStatus, toStatus, extraSet = {}) {
  return Model.findOneAndUpdate(
    { _id: orderId, status: fromStatus },
    { $set: { status: toStatus, ...extraSet } },
    { new: true },
  );
}

export default mongoose.model('Order', orderSchema);
