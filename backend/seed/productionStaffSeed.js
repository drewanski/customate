/**
 * Seeds two production-team accounts used to demo + verify the role split:
 *
 *   production.manager@customate.com / manager123  → production_manager
 *   production.staff@customate.com   / staff123    → production_staff
 *
 * Idempotent: re-running just ensures the records exist with the right
 * role. Existing accounts are left alone (so passwords aren't silently
 * rotated on every seed).
 *
 * Run from project root:  node backend/seed/productionStaffSeed.js
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const SEEDS = [
  {
    name: 'Production Manager',
    email: 'production.manager@customate.com',
    password: 'manager123',
    role: 'production_manager',
    contactNumber: '+639000000010',
  },
  {
    name: 'Production Staff',
    email: 'production.staff@customate.com',
    password: 'staff123',
    role: 'production_staff',
    contactNumber: '+639000000011',
  },
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    for (const seed of SEEDS) {
      const existing = await User.findOne({ email: seed.email });
      if (existing) {
        // Re-stamp the role in case the schema enum changed and this user
        // was created before production roles existed.
        if (existing.role !== seed.role) {
          existing.role = seed.role;
          await existing.save();
          console.log(`Updated role for ${seed.email} -> ${seed.role}`);
        } else {
          console.log(`User ${seed.email} already exists`);
        }
        continue;
      }
      const hashed = await bcrypt.hash(seed.password, 10);
      await new User({
        name: seed.name,
        email: seed.email,
        password: hashed,
        contactNumber: seed.contactNumber,
        role: seed.role,
        notificationPreference: 'email',
      }).save();
      console.log(`Created ${seed.email} (${seed.role}) - password "${seed.password}"`);
    }

    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

run();
