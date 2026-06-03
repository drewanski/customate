import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import '../models/User.js';

await mongoose.connect(process.env.MONGO_URI);
const orders = await Order.find({ status: { $in: ['pending', 'quote_requested'] } })
  .populate('customer', 'name email')
  .lean()
  .sort({ createdAt: -1 });
console.log(`${orders.length} pending/quote_requested orders:\n`);
for (const o of orders) {
  const customerName = o.customer?.name || '(no customer)';
  const recipient = o.recipientName || '(no recipient)';
  const orderCustomerName = o.customerName || '(empty)';
  console.log(`  #${String(o._id).slice(-6).toUpperCase()}  ${o.status.padEnd(15)} customer="${customerName}"  recipient="${recipient}"  customerName="${orderCustomerName}"  date=${new Date(o.createdAt).toISOString().slice(0, 10)}`);
}
process.exit(0);
