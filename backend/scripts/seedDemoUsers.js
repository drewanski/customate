/*
 * scripts/seedDemoUsers.js
 *
 * Creates / refreshes demo accounts used by the live preview walkthrough.
 * Idempotent — re-running just resets the password and role.
 *
 * Usage:
 *   node backend/scripts/seedDemoUsers.js
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const ACCOUNTS = [
  { name: 'Demo Customer',  email: 'demo.customer@local.test', password: 'DemoPass123!', role: 'customer' },
  { name: 'Demo Admin',     email: 'demo.admin@local.test',    password: 'DemoPass123!', role: 'admin'    },
  { name: 'Demo Staff',     email: 'demo.staff@local.test',    password: 'DemoPass123!', role: 'production_staff' },
];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[seedDemoUsers] connected');
  for (const a of ACCOUNTS) {
    const hash = await bcrypt.hash(a.password, 10);
    const res = await User.findOneAndUpdate(
      { email: a.email },
      { $set: { name: a.name, email: a.email, password: hash, role: a.role, status: 'active', emailVerified: true } },
      { upsert: true, new: true }
    );
    console.log(`[seedDemoUsers] upserted ${res.role} ${res.email}`);
  }
  await mongoose.disconnect();
  console.log('[seedDemoUsers] done');
})().catch((err) => { console.error(err); process.exit(1); });
