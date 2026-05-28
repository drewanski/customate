/**
 * Seeds the operator team:
 *
 *   manager@customate.com           / manager123  → admin (= Production Manager / owner)
 *   production.staff@customate.com  / staff123    → production_staff (floor worker)
 *
 * The role 'production_manager' is intentionally NOT used — the business
 * owner / Production Manager IS the admin role. Older accounts that were
 * seeded with role: 'production_manager' get auto-migrated to 'admin' so
 * existing operators don't lose access when the schema collapses.
 *
 * Idempotent: re-running just ensures the records exist with the right
 * role. Existing accounts keep their password.
 *
 * Run from the backend directory:  node seed/productionStaffSeed.js
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const SEEDS = [
  {
    name: 'Production Manager',
    email: 'manager@customate.com',
    password: 'manager123',
    role: 'admin',
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

    // Migration: any leftover production_manager users from the
    // previous schema are promoted to admin so they keep their access.
    const migrated = await User.updateMany(
      { role: 'production_manager' },
      { $set: { role: 'admin' } },
    );
    if (migrated.modifiedCount > 0) {
      console.log(`Migrated ${migrated.modifiedCount} production_manager user(s) -> admin`);
    }

    // Rename the legacy "production.manager@" seed (if present) so the
    // newer manager@ account becomes the canonical owner login.
    await User.updateOne(
      { email: 'production.manager@customate.com' },
      { $set: { role: 'admin' } },
    );

    for (const seed of SEEDS) {
      const existing = await User.findOne({ email: seed.email });
      if (existing) {
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
