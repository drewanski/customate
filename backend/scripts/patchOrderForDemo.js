/**
 * Quick one-off — sets a rush deadline on an order so the demo can show
 * the auto-fill of due-date + priority in the Schedule modal. Not for
 * production use; just for the live walkthrough.
 *
 * Usage:
 *   node backend/scripts/patchOrderForDemo.js <orderId>
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import mongoose from 'mongoose';
import Order from '../models/Order.js';

const orderId = process.argv[2];
if (!orderId) { console.error('usage: patchOrderForDemo.js <orderId>'); process.exit(1); }

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  // 5 days from now → triggers the "priority" urgency tier
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 5);
  const res = await Order.findByIdAndUpdate(
    orderId,
    {
      $set: {
        requestedDeliveryDate: deadline,
        urgencyTier: 'priority',
        productionPriority: 'urgent',
        rushFeeAmount: 96,
      },
    },
    { new: true }
  );
  if (!res) { console.error('order not found'); process.exit(1); }
  console.log('patched order', res._id.toString());
  console.log('  requestedDeliveryDate:', res.requestedDeliveryDate.toISOString());
  console.log('  urgencyTier:', res.urgencyTier);
  console.log('  productionPriority:', res.productionPriority);
  console.log('  rushFeeAmount:', res.rushFeeAmount);
  await mongoose.disconnect();
})().catch((err) => { console.error(err); process.exit(1); });
