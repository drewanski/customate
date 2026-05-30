/**
 * End-to-end audit script — exercises the real HTTP routes so I can see what
 * actually happens, not just trust that the build compiles.
 *
 * Steps:
 *   1. Seed an admin, a customer, and an Inventory item (skipping the email
 *      OTP gate that blocks /auth/register in dev).
 *   2. Place an order via POST /api/orders as the customer.
 *   3. Inspect ChatMessage docs — expect the welcome system message.
 *   4. Drive the order through the pipeline:
 *        pending → approved → in_production → ready
 *        → out_for_delivery → completed
 *      …and report what system messages appeared at each step.
 *   5. Try the cancel-paid loophole (should 409).
 *   6. Try the delivery-method mismatch loophole (should 400).
 *   7. Test /chat/threads for the admin and customer.
 *
 * Run from repo root:
 *   node backend/scripts/auditPipeline.js
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:4000/api';

function divider(t) { console.log('\n' + '═'.repeat(70) + '\n  ' + t + '\n' + '═'.repeat(70)); }
function ok(msg) { console.log('  ✓ ' + msg); }
function fail(msg) { console.log('  ✗ ' + msg); }
function info(msg) { console.log('  · ' + msg); }

async function fetchJson(path, opts = {}, token = null) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  ok('Connected to Mongo');

  const User = (await import('../models/User.js')).default;
  const Inventory = (await import('../models/Inventory.js')).default;
  const ChatMessage = (await import('../models/ChatMessage.js')).default;
  const Order = (await import('../models/Order.js')).default;
  const Notification = (await import('../models/Notification.js')).default;

  divider('Step 1 — Seed users + inventory');
  const customerEmail = 'pipeline.customer@audit.local';
  const adminEmail    = 'pipeline.admin@audit.local';

  await User.deleteMany({ email: { $in: [customerEmail, adminEmail] } });
  const passwordHash = await bcrypt.hash('AuditTest123!', 10);
  const customer = await User.create({ name: 'Pipeline Customer', email: customerEmail, password: passwordHash, role: 'customer', status: 'active' });
  const admin    = await User.create({ name: 'Pipeline Admin',    email: adminEmail,    password: passwordHash, role: 'admin',    status: 'active' });
  ok(`Customer ${customer._id} + admin ${admin._id} created`);

  let inv = await Inventory.findOne({ sku: 'AUD-SHIRT-0001' });
  if (!inv) {
    inv = await Inventory.create({
      name: 'Audit Test Shirt', sku: 'AUD-SHIRT-0001', category: 'Apparel',
      stock: 100, price: 350, isActive: true,
      sizes: [{ code: 'M', label: 'Medium', chest: '38-40 in' }],
      availableColors: [{ name: 'Black', hex: '#000000' }],
    });
  }
  ok(`Inventory ${inv.sku} ready (stock=${inv.stock})`);

  // Clean up previous test orders for these users
  await Order.deleteMany({ customer: customer._id });
  await ChatMessage.deleteMany({});
  await Notification.deleteMany({ user: customer._id });

  divider('Step 2 — Log in as customer + admin');
  const customerLogin = await fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: customerEmail, password: 'AuditTest123!' }) });
  const adminLogin    = await fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: adminEmail,    password: 'AuditTest123!' }) });
  if (customerLogin.status !== 200) return fail('Customer login failed: ' + JSON.stringify(customerLogin));
  if (adminLogin.status !== 200)    return fail('Admin login failed: '    + JSON.stringify(adminLogin));
  const customerToken = customerLogin.body.token;
  const adminToken    = adminLogin.body.token;
  ok('Both tokens obtained');

  divider('Step 3 — Place order (delivery + COD)');
  const orderResp = await fetchJson('/orders', {
    method: 'POST',
    body: JSON.stringify({
      items: [{ sku: inv.sku, quantity: 2, customization: { size: 'M', color: 'Black', isCustomized: false } }],
      shippingAddress: '123 Test St, Manila',
      contactPhone: '09171234567',
      paymentMethod: 'cod',
      deliveryMethod: 'delivery',
    }),
  }, customerToken);
  if (orderResp.status !== 201) return fail('Order create failed: ' + JSON.stringify(orderResp));
  const order = orderResp.body;
  ok(`Order created: id=${order.id} status=${order.status} deliveryMethod=${order.deliveryMethod}`);

  // Allow async work (createPostSystemMessage, etc.) to finish
  await new Promise(r => setTimeout(r, 300));

  divider('Step 4 — Inspect chat thread after creation');
  const chat0 = await ChatMessage.find({ order: order.id }).sort({ createdAt: 1 }).lean();
  info(`Messages in thread: ${chat0.length}`);
  chat0.forEach(m => console.log(`    [${m.kind}/${m.fromRole}] ${m.body}`));
  if (chat0.some(m => m.kind === 'system' && /Welcome/i.test(m.body))) ok('Welcome system message posted at creation');
  else fail('Missing welcome system message');

  // Track expected number of system messages for each step
  let lastSeen = chat0.length;
  async function transitionAndInspect(label, fn) {
    info(`→ ${label}`);
    const r = await fn();
    await new Promise(res => setTimeout(res, 300));
    const msgs = await ChatMessage.find({ order: order.id }).sort({ createdAt: 1 }).lean();
    const fresh = msgs.slice(lastSeen);
    if (fresh.length === 0) fail(`No new chat message after ${label}`);
    fresh.forEach(m => console.log(`    NEW [${m.kind}/${m.fromRole}] ${m.body}`));
    lastSeen = msgs.length;
    return r;
  }

  divider('Step 5 — Walk the pipeline pending → completed');
  await transitionAndInspect('approve', () => fetchJson(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) }, adminToken));
  await transitionAndInspect('in_production', () => fetchJson(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'in_production' }) }, adminToken));
  await transitionAndInspect('ready', () => fetchJson(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'ready' }) }, adminToken));
  await transitionAndInspect('out_for_delivery', () => fetchJson(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'out_for_delivery' }) }, adminToken));
  await transitionAndInspect('completed', () => fetchJson(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'completed' }) }, adminToken));

  divider('Step 6 — Loophole guards');
  // (a) Delivery-method mismatch — should 400
  const mismatch = await fetchJson(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'for_pickup' }) }, adminToken);
  if (mismatch.status === 400) ok(`Delivery-method guard works (400): "${mismatch.body.message}"`);
  else fail(`Delivery-method guard failed: ${JSON.stringify(mismatch)}`);

  // (b) Customer-cancel on a paid order — use a FRESH pending order so the
  // production-status lock doesn't fire first.
  const order2Resp = await fetchJson('/orders', { method: 'POST', body: JSON.stringify({ items: [{ sku: inv.sku, quantity: 1, customization: {} }], shippingAddress: '1 X', paymentMethod: 'cod', deliveryMethod: 'delivery' }) }, customerToken);
  if (order2Resp.status === 201) {
    await Order.updateOne({ _id: order2Resp.body.id }, { paymentStatus: 'paid', paidAmount: order2Resp.body.totalPrice });
    const paidCancel = await fetchJson(`/orders/${order2Resp.body.id}/customer-cancel`, { method: 'POST', body: JSON.stringify({ reason: 'just testing' }) }, customerToken);
    if (paidCancel.status === 409 && paidCancel.body.paidLocked) ok('Paid-cancel lock works (409 paidLocked)');
    else fail(`Paid-cancel lock failed: ${JSON.stringify(paidCancel)}`);
  } else fail('Could not create second order for paid-cancel test');

  // (c) Reason required for reject
  const noReason = await fetchJson(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) }, adminToken);
  if (noReason.status === 400) ok(`Reason-required guard works (400): "${noReason.body.message}"`);
  else fail(`Reason-required guard failed: ${JSON.stringify(noReason)}`);

  divider('Step 7 — Test /chat/threads endpoint');
  const threads = await fetchJson('/chat/threads', {}, adminToken);
  if (threads.status === 200 && Array.isArray(threads.body)) {
    ok(`/chat/threads returned ${threads.body.length} thread(s) for admin`);
    threads.body.forEach(t => console.log(`    #${t.orderRef} status=${t.status} unread=${t.unread} last="${t.lastBody?.slice(0, 60)}…"`));
  } else fail(`/chat/threads failed: ${JSON.stringify(threads)}`);

  divider('Step 8 — Final chat-thread dump');
  const finalChat = await ChatMessage.find({ order: order.id }).sort({ createdAt: 1 }).lean();
  console.log(`  Total messages: ${finalChat.length}`);
  finalChat.forEach((m, i) => console.log(`    ${i + 1}. [${m.kind}/${m.fromRole}] ${m.body}`));

  divider('Step 9 — Notification fan-out for the customer');
  const customerNotifs = await Notification.find({ user: customer._id }).sort({ createdAt: 1 }).lean();
  console.log(`  Customer received ${customerNotifs.length} notifications:`);
  customerNotifs.forEach(n => console.log(`    [${n.type}] ${n.title}`));

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
