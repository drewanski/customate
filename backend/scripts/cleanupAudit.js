// One-off cleanup for the auditPipeline.js script. Removes the audit users,
// their orders, and chat messages so the dev DB stays tidy.
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGO_URI);
const User = (await import('../models/User.js')).default;
const Order = (await import('../models/Order.js')).default;
const ChatMessage = (await import('../models/ChatMessage.js')).default;
const Notification = (await import('../models/Notification.js')).default;

const emails = ['pipeline.customer@audit.local', 'pipeline.admin@audit.local'];
const users = await User.find({ email: { $in: emails } }).lean();
const userIds = users.map((u) => u._id);
const orders = await Order.find({ customer: { $in: userIds } }).select('_id').lean();
const orderIds = orders.map((o) => o._id);

const c1 = await ChatMessage.deleteMany({ order: { $in: orderIds } });
const c2 = await Order.deleteMany({ customer: { $in: userIds } });
const c3 = await Notification.deleteMany({ user: { $in: userIds } });
const c4 = await User.deleteMany({ email: { $in: emails } });

console.log(`Removed ${c1.deletedCount} chat msgs, ${c2.deletedCount} orders, ${c3.deletedCount} notifs, ${c4.deletedCount} users`);
await mongoose.disconnect();
