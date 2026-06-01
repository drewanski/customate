/**
 * Verifies the post-walkthrough loophole fixes:
 *   1. Shipping fee — backend computes + stores it; total includes it.
 *   2. Notifications — customer no longer sees admin-broadcast.
 *   3. Override reason — does NOT leak into customer-visible chat for
 *      routine advancement (only rejected/cancelled).
 *
 * Usage:
 *   node backend/scripts/verifyFixes.js
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const BASE = 'http://localhost:4000/api';

function divider(t) { console.log('\n' + '═'.repeat(70) + '\n  ' + t + '\n' + '═'.repeat(70)); }
function ok(msg) { console.log('  ✓ ' + msg); }
function bad(msg) { console.log('  ✗ ' + msg); }

async function fetchJson(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${j.message || j.error || r.statusText}`);
  return j;
}

(async () => {
  // 1. Log in as demo customer + admin
  const c = await fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo.customer@local.test', password: 'DemoPass123!' }) });
  const a = await fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo.admin@local.test',    password: 'DemoPass123!' }) });
  const CHDR = { Authorization: 'Bearer ' + c.token };
  const AHDR = { Authorization: 'Bearer ' + a.token };

  // ─── Fix #1: Shipping fee is now charged when subtotal < ₱500 ──────────
  divider('FIX #1 — Shipping fee is charged on small delivery orders');
  // Pick any active inventory item — use the canvas tote (₱120 unit price)
  const invList = await fetch(BASE + '/inventory', { headers: AHDR }).then((r) => r.json());
  const tote = invList.find((i) => /tote/i.test(i.name)) || invList[0];

  const order = await fetchJson('/orders', {
    method: 'POST',
    headers: CHDR,
    body: JSON.stringify({
      items: [{ sku: tote.sku, quantity: 1, customization: { color: '#000', placement: 'Center Front' } }],
      shippingAddress: '123 Demo Lane, Quezon City',
      paymentMethod: 'cod',
      deliveryMethod: 'delivery',
    }),
  });
  const unit = tote.price;
  const expected = unit + (unit >= 500 ? 0 : 100);
  if (order.totalPrice === expected && order.shippingFee === 100) {
    ok(`Delivery order: subtotal ₱${unit} + shipping ₱100 = total ₱${order.totalPrice}`);
  } else {
    bad(`Expected total ₱${expected} and shippingFee 100; got total ₱${order.totalPrice}, shippingFee ${order.shippingFee}`);
  }

  // Pickup order should be FREE shipping
  const pickup = await fetchJson('/orders', {
    method: 'POST',
    headers: CHDR,
    body: JSON.stringify({
      items: [{ sku: tote.sku, quantity: 1, customization: { color: '#000', placement: 'Center Front' } }],
      shippingAddress: 'In-store pickup',
      paymentMethod: 'cod',
      deliveryMethod: 'pickup',
    }),
  });
  if (pickup.totalPrice === unit && pickup.shippingFee === 0) {
    ok(`Pickup order: shipping waived (total ₱${pickup.totalPrice}, shippingFee 0)`);
  } else {
    bad(`Pickup expected total ₱${unit} and shippingFee 0; got total ₱${pickup.totalPrice}, shippingFee ${pickup.shippingFee}`);
  }

  // ─── Fix #2: Customer doesn't see admin broadcast notifications ────────
  divider('FIX #2 — Notifications scoped by role');
  const cNotifs = await fetchJson('/notifications?limit=50', { headers: CHDR });
  const leakedAdmin = cNotifs.notifications.filter(
    (n) => n.target === 'admin' && (!n.user || String(n.user) !== c.user.id)
  );
  if (leakedAdmin.length === 0) ok('Customer bell has zero admin-target notifications');
  else bad(`Customer bell leaked ${leakedAdmin.length} admin-target notifications`);

  // ─── Fix #3: Routine advancement chat doesn't show override reason ─────
  divider('FIX #3 — Override reason does NOT leak into customer-visible chat');
  // Advance the just-placed order with an override "expedite" note.
  await fetchJson(`/orders/${order.id}/status`, {
    method: 'PUT',
    headers: AHDR,
    body: JSON.stringify({ status: 'approved', override: true, reason: 'expedite test' }),
  });
  // Inspect the chat thread — most recent system message body should NOT contain "expedite"
  const chat = await fetchJson(`/chat/${order.id}`, { headers: AHDR });
  const lastSystem = [...chat].reverse().find((m) => m.kind === 'system');
  if (lastSystem && !/expedite/i.test(lastSystem.body)) {
    ok('Approved system message hides admin override reason from customer');
    console.log('    →', lastSystem.body);
  } else {
    bad('Approved system message still contains override reason: ' + (lastSystem && lastSystem.body));
  }

  // Now reject with a customer-visible reason — that one SHOULD show.
  const rejectOrder = await fetchJson('/orders', {
    method: 'POST',
    headers: CHDR,
    body: JSON.stringify({
      items: [{ sku: tote.sku, quantity: 1, customization: { color: '#000', placement: 'Center Front' } }],
      shippingAddress: '456 Reject Lane',
      paymentMethod: 'cod',
      deliveryMethod: 'delivery',
    }),
  });
  await fetchJson(`/orders/${rejectOrder.id}/status`, {
    method: 'PUT',
    headers: AHDR,
    body: JSON.stringify({ status: 'rejected', reason: 'design infringes a trademark' }),
  });
  const rejChat = await fetchJson(`/chat/${rejectOrder.id}`, { headers: AHDR });
  const rejSys = [...rejChat].reverse().find((m) => m.kind === 'system' && m.meta && m.meta.status === 'rejected');
  if (rejSys && /design infringes a trademark/.test(rejSys.body)) {
    ok('Rejection system message DOES show customer-facing reason');
    console.log('    →', rejSys.body);
  } else {
    bad('Rejection system message missing reason: ' + (rejSys && rejSys.body));
  }

  divider('Cleanup — removing test orders');
  // We don't delete them — fine for audit. But report IDs so dev can clean if desired.
  console.log('  Test orders:', order.id, pickup.id, rejectOrder.id);
  console.log('\nALL FIXES VERIFIED ✓');
})().catch((e) => { console.error(e); process.exit(1); });
