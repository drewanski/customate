import mongoose from 'mongoose';

/**
 * Order-scoped chat message (panel revision #14).
 *
 * Messages always live under an order so context is preserved. Either side
 * (customer / admin / staff) can write; readBy[] is appended to when the
 * other side fetches the thread.
 */
const chatMessageSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  // `kind: 'user'`  — a real person typed it (customer/admin/staff).
  // `kind: 'system'` — auto-generated event (status change, QC, blocker, etc).
  //   System messages are stored in the same thread so the conversation IS
  //   the journey, not just a sidebar of dry status badges.
  kind: { type: String, enum: ['user', 'system'], default: 'user', index: true },
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for system messages
  fromRole: { type: String, enum: ['customer', 'admin', 'staff', 'system'], required: true },
  fromName: { type: String, default: '' }, // snapshot for fast render
  body: { type: String, required: true, maxlength: 2000 },
  // Used for system messages: { status, reason } so the UI can colour-code +
  // optionally show an action button (e.g., "Rate this product" after completed).
  meta: { type: mongoose.Schema.Types.Mixed, default: null },
  readBy: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // user ids that have read it
}, { timestamps: true });

chatMessageSchema.index({ order: 1, createdAt: 1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
