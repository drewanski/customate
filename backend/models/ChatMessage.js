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
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  fromRole: { type: String, enum: ['customer', 'admin', 'staff'], required: true },
  fromName: { type: String, default: '' }, // snapshot for fast render
  body: { type: String, required: true, maxlength: 2000 },
  readBy: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // user ids that have read it
}, { timestamps: true });

chatMessageSchema.index({ order: 1, createdAt: 1 });

export default mongoose.model('ChatMessage', chatMessageSchema);
