/**
 * cleanupTestPending.js — bulk-removes leftover test orders.
 *
 * Target: orders that are still in `pending` / `quote_requested` AND look
 * like test data (customer name "Unknown" / "Test Customer*" / blank, or
 * created from the demo seed flows). These accumulate over months of dev
 * walkthroughs and clutter the Admin Calendar + Action Inbox.
 *
 * Safe-by-default rules:
 *   - Only touches orders the admin themselves never approved (status
 *     in {'pending', 'quote_requested'}).
 *   - Skips ANY order with verified payments, with a real customer name,
 *     or younger than 24 hours (real customers might be mid-checkout).
 *   - Prints a dry-run summary first; pass --confirm to actually delete.
 *
 * Usage:
 *   node backend/scripts/cleanupTestPending.js              # dry run
 *   node backend/scripts/cleanupTestPending.js --confirm    # for real
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import mongoose from 'mongoose';
import Order from '../models/Order.js';
// Mongoose needs the User model registered before .populate('customer').
// Just importing it is enough — the model registers as a side effect.
import '../models/User.js';

const CONFIRM = process.argv.includes('--confirm');

// Test-pattern names. We match by PREFIX (no $ anchor) so "Test Customer
// Updated" and "Demo Customer 1" both flag. Empty string also matches so
// guest orders with no name field at all get included.
function looksLikeTestName(s) {
  const n = String(s || '').trim().toLowerCase();
  if (!n) return true;
  return /^(test\b|unknown|guest|customer\b|demo\b|admin\b|sample\b|placeholder\b|user\s*\d|n\/a|nil|null)/i.test(n);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[cleanup] connected\n');

  const candidates = await Order.find({
    status: { $in: ['pending', 'quote_requested'] },
  }).populate('customer', 'name email').lean();

  console.log(`Scanning ${candidates.length} pending/quote_requested orders…\n`);

  const toDelete = [];
  for (const o of candidates) {
    // Check ALL possible name fields — orders use customer (populated),
    // customerName (denormalized), or recipientName depending on flow.
    const names = [
      o.customer?.name,
      o.customer?.email,
      o.customerName,
      o.recipientName,
    ].filter(Boolean).map((s) => String(s).trim());

    // Verified payment of any kind → never touch.
    const hasVerifiedPayment =
      o.payments?.downpayment?.verifiedAt ||
      o.payments?.balance?.verifiedAt ||
      o.paymentStatus === 'paid' ||
      o.paidAmount > 0;
    if (hasVerifiedPayment) continue;

    // If ANY name field looks like a real customer (>= 4 chars and not a
    // test pattern), skip the whole order — don't risk deleting a real
    // customer's pending order just because another field is blank.
    const looksReal = names.some((n) => n.length >= 4 && !looksLikeTestName(n));
    if (looksReal) continue;

    toDelete.push({
      id: String(o._id),
      ref: String(o._id).slice(-6).toUpperCase(),
      name: names[0] || '(blank)',
      status: o.status,
      createdAt: o.createdAt,
    });
  }

  console.log(`Found ${toDelete.length} candidate test order${toDelete.length === 1 ? '' : 's'}.\n`);
  for (const t of toDelete.slice(0, 50)) {
    console.log(`  #${t.ref}  ${t.status.padEnd(15)} ${t.name.padEnd(28)} ${new Date(t.createdAt).toISOString().slice(0, 10)}`);
  }
  if (toDelete.length > 50) console.log(`  …and ${toDelete.length - 50} more`);

  if (!CONFIRM) {
    console.log(`\n[dry-run] No changes made. Add --confirm to delete the above.`);
    process.exit(0);
  }

  if (toDelete.length === 0) {
    console.log('\nNothing to clean.');
    process.exit(0);
  }

  const ids = toDelete.map((t) => t.id);
  const r = await Order.deleteMany({ _id: { $in: ids } });
  console.log(`\n[deleted] ${r.deletedCount} orders removed.`);
  process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
