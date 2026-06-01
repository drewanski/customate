/**
 * courierMockup.js — end-to-end demo for the courier handoff feature.
 *
 * Walks through:
 *   1. demo.customer places a delivery order
 *   2. admin drives it pending → approved → in_production → ready
 *   3. admin assigns Lalamove + tracking number via the courier endpoint
 *   4. prints the resulting customer-visible touchpoints:
 *        - chat thread (system message customer sees)
 *        - bell notifications (Order placed + courier-assigned ring)
 *        - order.courier subdoc as exposed by the API
 *        - direct URL the customer would use
 *
 * Re-runnable; each run creates a fresh order so the demo is reproducible.
 *
 * Usage:
 *   node backend/scripts/courierMockup.js
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const BASE = 'http://localhost:4000/api';

const line = (t) => console.log('\n' + '─'.repeat(72) + '\n  ' + t + '\n' + '─'.repeat(72));
const ok = (m) => console.log('  ✓ ' + m);

async function fetchJson(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text }; }
  if (!r.ok) throw new Error(`${r.status} ${j.message || j.error || text}`);
  return j;
}

(async () => {
  // Customer + admin logins are independent — fire them in parallel.
  const [c, a] = await Promise.all([
    fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo.customer@local.test', password: 'DemoPass123!' }) }),
    fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo.admin@local.test',    password: 'DemoPass123!' }) }),
  ]);
  const CHDR = { Authorization: 'Bearer ' + c.token };
  const AHDR = { Authorization: 'Bearer ' + a.token };

  line('STEP 1 · Customer places a delivery order (₱120 Canvas Tote)');
  const inv = await fetch(BASE + '/inventory', { headers: AHDR }).then((r) => r.json());
  const tote = (Array.isArray(inv) ? inv : inv.items || []).find((i) => /tote/i.test(i.name));
  const order = await fetchJson('/orders', {
    method: 'POST',
    headers: CHDR,
    body: JSON.stringify({
      items: [{ sku: tote.sku, quantity: 1, customization: { color: '#000', size: 'M', placement: 'Center Front' } }],
      shippingAddress: '742 Demo Avenue, Brgy Real, Quezon City',
      contactPhone: '0917 555 9090',
      paymentMethod: 'cod',
      deliveryMethod: 'delivery',
    }),
  });
  ok(`Order created: ${order.id} (#${String(order.id).slice(-6).toUpperCase()})`);
  ok(`Total: ₱${order.totalPrice}  ·  Delivery: ${order.deliveryMethod}  ·  Status: ${order.status}`);

  line('STEP 2 · Admin walks the order pending → approved → in_production → ready');
  for (const to of ['approved', 'in_production', 'ready']) {
    await fetchJson(`/orders/${order.id}/status`, {
      method: 'PUT',
      headers: AHDR,
      body: JSON.stringify({ status: to, override: true }),
    });
    ok(`status → ${to}`);
  }

  line('STEP 3 · Admin assigns Lalamove + tracking number');
  const courierRes = await fetchJson(`/orders/${order.id}/courier`, {
    method: 'POST',
    headers: AHDR,
    body: JSON.stringify({
      name: 'Lalamove',
      trackingNumber: 'LM-2026-44811',
      trackingUrl: 'https://lalamove.ph/track/LM-2026-44811',
      contactPhone: '0917 555 0199',
      notes: 'Rider arriving 3-5pm — buzzer at gate 2',
    }),
  });
  ok(`Saved: ${courierRes.courier.name} — ${courierRes.courier.trackingNumber}`);

  line('CUSTOMER TOUCHPOINT #1 · The chat thread the customer sees');
  const chat = await fetchJson(`/chat/${order.id}`, { headers: CHDR });
  for (const m of chat) {
    const k = (m.kind || '?').padEnd(6);
    const role = (m.fromRole || m.from?.role || '').padEnd(8);
    const body = m.body.replace(/\n/g, ' ').slice(0, 96);
    console.log(`   [${k}] ${role} ${body}`);
  }

  line('CUSTOMER TOUCHPOINT #2 · Bell notifications the customer sees');
  const notifs = await fetchJson('/notifications?limit=4', { headers: CHDR });
  console.log('   unread:', notifs.unreadCount);
  for (const n of notifs.notifications) {
    console.log(`   • [${n.type}] ${n.title} — ${n.message}`);
  }

  line('CUSTOMER TOUCHPOINT #3 · order.courier as the tracking page reads it');
  const fresh = await fetchJson(`/orders/${order.id}`, { headers: CHDR });
  console.log(JSON.stringify(fresh.courier, null, 2));

  line('TRY IT IN THE BROWSER');
  console.log(`   Customer tracking page:`);
  console.log(`   http://localhost:5173/order-tracking/${order.id}`);
  console.log();
  console.log(`   Admin drawer for the same order:`);
  console.log(`   http://localhost:5173/admin/orders?id=${order.id}`);
})().catch((e) => { console.error('\nERROR:', e.message); process.exit(1); });
