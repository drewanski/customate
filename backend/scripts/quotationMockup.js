/**
 * quotationMockup.js — end-to-end test for the NEW quotation workflow.
 *
 * Drives the complete flow:
 *   1. Customer submits order request  →  status=quote_requested
 *   2. Admin sends a quote              →  status=quoted
 *   3. Customer accepts the quote       →  status=accepted
 *   4. Customer uploads downpayment proof
 *   5. Admin verifies downpayment       →  status=downpayment_paid
 *   6. Admin approves                   →  status=approved
 *   7. Admin advances to in_production (override) then ready (override)
 *   8. Customer uploads balance proof
 *   9. Admin tries to release WITHOUT verifying balance — should be REJECTED
 *  10. Admin verifies balance
 *  11. Admin releases (out_for_delivery)
 *  12. Admin completes
 *
 * Verifies every hard gate works. Idempotent — fresh order each run.
 *
 * Usage:
 *   node backend/scripts/quotationMockup.js
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const BASE = 'http://localhost:4000/api';
const line = (t) => console.log('\n' + '─'.repeat(72) + '\n  ' + t + '\n' + '─'.repeat(72));
const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => console.log('  ✗ ' + m);

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

async function fetchExpectFail(path, opts, expectedSubstring) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = { _raw: text }; }
  if (r.ok) throw new Error(`Expected failure but got 200 — ${text}`);
  if (expectedSubstring && !text.toLowerCase().includes(expectedSubstring.toLowerCase())) {
    throw new Error(`Failure didn't mention "${expectedSubstring}". Got: ${text}`);
  }
  return j;
}

// Tiny 1×1 transparent PNG as a base64 data URL — stands in for a real
// payment screenshot. Cloudinary upload will be skipped in dev (returns the
// data URL unchanged) so the order ends up with this URL on payments[type].
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

(async () => {
  const [c, a] = await Promise.all([
    fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo.customer@local.test', password: 'DemoPass123!' }) }),
    fetchJson('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo.admin@local.test',    password: 'DemoPass123!' }) }),
  ]);
  const CHDR = { Authorization: 'Bearer ' + c.token };
  const AHDR = { Authorization: 'Bearer ' + a.token };

  line('STEP 1 · Customer submits an order request');
  const inv = await fetch(BASE + '/inventory', { headers: AHDR }).then((r) => r.json());
  const tee = (Array.isArray(inv) ? inv : inv.items || []).find((i) => /shirt|tee|tote/i.test(i.name));
  if (!tee) throw new Error('No shirt/tee/tote SKU in inventory — seed inventory first.');
  const order = await fetchJson('/orders', {
    method: 'POST',
    headers: CHDR,
    body: JSON.stringify({
      items: [{
        sku: tee.sku,
        quantity: 3,
        customization: {
          color: 'white',
          size: 'M',
          placement: 'Center Front',
          fabric: 'cotton',
          text: 'Hello World',
        },
      }],
      shippingAddress: '742 Demo Avenue, Brgy Real, Quezon City',
      contactPhone: '0917 555 9090',
      deliveryMethod: 'delivery',
    }),
  });
  ok(`Order created: ${order.id}  ·  status=${order.status}  ·  workflowVersion=${order.workflowVersion}`);
  if (order.status !== 'quote_requested') throw new Error(`Expected quote_requested, got ${order.status}`);
  if (order.workflowVersion !== 'quotation') throw new Error(`Expected quotation, got ${order.workflowVersion}`);
  ok(`Status + workflow correct.`);

  line('STEP 2 · Admin sends a quotation (₱2,500 total, 50% downpayment)');
  const quoteRes = await fetchJson(`/orders/${order.id}/quotation`, {
    method: 'POST',
    headers: AHDR,
    body: JSON.stringify({
      lineItems: [
        { label: 'Cotton tee ×3 (white, base ₱240 each)', amount: 720 },
        { label: 'Front print (medium)',                  amount: 210 },
        { label: 'Setup + materials',                     amount: 1570 },
      ],
      total: 2500,
      downpaymentPct: 50,
    }),
  });
  ok(`Quote sent — status=${quoteRes.order.status}  ·  total=₱${quoteRes.order.quotation.total}  ·  DP=₱${quoteRes.order.quotation.downpaymentAmount}  ·  Bal=₱${quoteRes.order.quotation.balanceAmount}`);

  line('STEP 3 · Customer accepts the quote');
  const acceptRes = await fetchJson(`/orders/${order.id}/quotation/accept`, { method: 'POST', headers: CHDR });
  ok(`Quote accepted — status=${acceptRes.order.status}`);

  line('GATE TEST · Admin tries to approve before downpayment verified — should fail');
  await fetchExpectFail(`/orders/${order.id}/status`, {
    method: 'PUT',
    headers: AHDR,
    body: JSON.stringify({ status: 'approved' }),
  }, 'transition');
  ok('Approval correctly blocked while at accepted (transition not allowed).');

  line('STEP 4 · Customer uploads downpayment proof');
  const dpRes = await fetchJson(`/orders/${order.id}/payment-proof`, {
    method: 'POST',
    headers: CHDR,
    body: JSON.stringify({
      type: 'downpayment',
      method: 'gcash',
      reference: 'GC-DEMO-001-DP',
      proofUrls: [PIXEL],
    }),
  });
  ok(`Downpayment proof uploaded — submittedAt=${dpRes.order.payments.downpayment.submittedAt ? 'yes' : 'no'}  ·  ${dpRes.order.payments.downpayment.proofUrls.length} image(s)`);

  line('STEP 5 · Admin verifies downpayment');
  const verifyDp = await fetchJson(`/orders/${order.id}/payments/downpayment/verify`, { method: 'POST', headers: AHDR });
  ok(`Downpayment verified — status=${verifyDp.order.status}  ·  paidAmount=₱${verifyDp.order.paidAmount}  ·  paymentStatus=${verifyDp.order.paymentStatus}`);
  if (verifyDp.order.status !== 'downpayment_paid') throw new Error(`Expected downpayment_paid, got ${verifyDp.order.status}`);

  line('STEP 6 · Admin approves the order');
  const approveRes = await fetchJson(`/orders/${order.id}/status`, {
    method: 'PUT',
    headers: AHDR,
    body: JSON.stringify({ status: 'approved' }),
  });
  ok(`Status → ${approveRes.status || approveRes.order?.status}`);

  line('STEP 7 · Admin runs production (in_production → ready, with override for assignee/QC)');
  for (const to of ['in_production', 'ready']) {
    const r = await fetchJson(`/orders/${order.id}/status`, {
      method: 'PUT',
      headers: AHDR,
      body: JSON.stringify({ status: to, override: true }),
    });
    ok(`Status → ${to}`);
  }

  line('GATE TEST · Admin tries to release WITHOUT verifying balance — should fail');
  await fetchExpectFail(`/orders/${order.id}/status`, {
    method: 'PUT',
    headers: AHDR,
    body: JSON.stringify({ status: 'out_for_delivery', override: true }),
  }, 'balance');
  ok('Release correctly blocked — balance not yet verified.');

  line('STEP 8 · Customer uploads balance payment proof');
  const balRes = await fetchJson(`/orders/${order.id}/payment-proof`, {
    method: 'POST',
    headers: CHDR,
    body: JSON.stringify({
      type: 'balance',
      method: 'gcash',
      reference: 'GC-DEMO-001-BAL',
      proofUrls: [PIXEL],
    }),
  });
  ok(`Balance proof uploaded — ${balRes.order.payments.balance.proofUrls.length} image(s)`);

  line('STEP 9 · Admin verifies balance');
  const verifyBal = await fetchJson(`/orders/${order.id}/payments/balance/verify`, { method: 'POST', headers: AHDR });
  ok(`Balance verified — paidAmount=₱${verifyBal.order.paidAmount}  ·  paymentStatus=${verifyBal.order.paymentStatus}`);

  line('STEP 10 · Admin releases the order (out_for_delivery)');
  const releaseRes = await fetchJson(`/orders/${order.id}/status`, {
    method: 'PUT',
    headers: AHDR,
    body: JSON.stringify({ status: 'out_for_delivery' }),
  });
  ok(`Status → ${releaseRes.status || releaseRes.order?.status}`);

  line('STEP 11 · Admin completes the order');
  const completeRes = await fetchJson(`/orders/${order.id}/status`, {
    method: 'PUT',
    headers: AHDR,
    body: JSON.stringify({ status: 'completed' }),
  });
  ok(`Status → ${completeRes.status || completeRes.order?.status}`);

  line('CUSTOMER TOUCHPOINT · Chat thread the customer sees');
  const chat = await fetchJson(`/chat/${order.id}`, { headers: CHDR });
  for (const m of chat) {
    const k = (m.kind || '?').padEnd(6);
    const role = (m.fromRole || '').padEnd(8);
    const tag = m.meta?.type ? `[${m.meta.type}]` : '';
    const body = (m.body || '').replace(/\n/g, ' ').slice(0, 90);
    console.log(`   [${k}] ${role} ${tag} ${body}`);
  }

  line('FINAL STATE · Full order summary');
  const fresh = await fetchJson(`/orders/${order.id}`, { headers: CHDR });
  console.log(`   status:           ${fresh.status}`);
  console.log(`   workflowVersion:  ${fresh.workflowVersion}`);
  console.log(`   total:            ₱${fresh.totalPrice}`);
  console.log(`   paidAmount:       ₱${fresh.paidAmount}`);
  console.log(`   paymentStatus:    ${fresh.paymentStatus}`);
  console.log(`   quotation.total:  ₱${fresh.quotation?.total}`);
  console.log(`   DP verified:      ${fresh.payments?.downpayment?.verifiedAt ? '✓' : '✗'}`);
  console.log(`   Balance verified: ${fresh.payments?.balance?.verifiedAt ? '✓' : '✗'}`);

  console.log('\n' + '═'.repeat(72));
  console.log('  ✅ ALL CHECKS PASSED — quotation workflow end-to-end is healthy.');
  console.log('═'.repeat(72));
  console.log();
  console.log(`  Customer view:   http://localhost:5173/order-tracking/${order.id}`);
  console.log(`  Admin drawer:    http://localhost:5173/admin/orders?id=${order.id}`);
})().catch((e) => { console.error('\n✗ ERROR:', e.message); process.exit(1); });
