// Simple API utility for making requests to the backend
const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` })
  };
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  // Surface rate-limit responses with a friendly, actionable message so
  // rapid clicks don't fail silently. Components catching the throw can
  // toast `err.message` directly.
  if (res.status === 429) {
    let payload = {};
    try { payload = await res.json(); } catch { /* non-json */ }
    const err = new Error(payload.error || payload.message || 'Too many requests — please slow down and try again in a moment.');
    err.code = 'RATE_LIMITED';
    err.status = 429;
    throw err;
  }
  if (!res.ok) {
    let payload = {};
    try { payload = await res.json(); } catch { /* non-json */ }
    throw new Error(payload.message || payload.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function login(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function register(name, email, password, contactNumber, role = 'customer', notificationPreference = 'email') {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, contactNumber, role, notificationPreference })
  });
}

/**
 * Google sign-in.
 *
 * Two-step flow for FIRST-TIME accounts:
 *   1. Call with just the credential. If the email is already in our DB,
 *      returns { token, user } and you log in.
 *      If it's a brand-new email, the backend returns HTTP 403 with
 *      `{ status: 'needs_otp', email, name }` — you should send an email
 *      OTP (sendOtp), prompt the user to enter the code, verify it
 *      (verifyOtp), then re-call this with `confirmCreate: true`.
 *
 * `apiRequest` already throws on non-OK responses. To distinguish the
 * needs_otp signal from generic errors, we read the body manually here.
 */
export async function googleSignIn(credential, { confirmCreate = false } = {}) {
  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
  const res = await fetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, confirmCreate })
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 403 && body.status === 'needs_otp') {
    // Caller should handle this as a flow signal, not an error
    const err = new Error(body.message || 'Email verification required');
    err.code = 'NEEDS_OTP';
    err.email = body.email;
    err.suggestedName = body.name;
    err.suggestedAvatar = body.avatar;
    throw err;
  }
  if (!res.ok) throw new Error(body.message || 'Google sign-in failed');
  return body;
}

export async function sendOtp(email) {
  return apiRequest('/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function verifyOtp(email, code) {
  return apiRequest('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code })
  });
}

export async function sendPhoneOtp(contactNumber) {
  return apiRequest('/auth/phone-otp/send', {
    method: 'POST',
    body: JSON.stringify({ contactNumber })
  });
}

export async function verifyPhoneOtp(contactNumber, code) {
  return apiRequest('/auth/phone-otp/verify', {
    method: 'POST',
    body: JSON.stringify({ contactNumber, code })
  });
}

export async function guestLogin(name) {
  return apiRequest('/auth/guest', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
}

export async function getProfile() {
  return apiRequest('/users/me');
}

export async function updateProfile(data) {
  return apiRequest('/users/me', {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

// Customer Dashboard API functions
export async function getMyOrders() {
  return apiRequest('/orders/my');
}

export async function getOrderById(orderId) {
  return apiRequest(`/orders/${orderId}`);
}

export async function getCustomerStats() {
  try {
    const orders = await getMyOrders();
    const stats = {
      totalOrders: orders.length,
      totalSpent: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      pendingOrders: orders.filter(o => o.status === 'pending' || o.status === 'processing').length,
      completedOrders: orders.filter(o => o.status === 'completed' || o.status === 'delivered').length,
      cancelledOrders: orders.filter(o => o.status === 'cancelled').length,
      averageOrderValue: orders.length > 0 ? orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0) / orders.length : 0,
      lastOrderDate: orders.length > 0 ? new Date(Math.max(...orders.map(o => new Date(o.createdAt)))) : null,
      recentOrders: orders.slice(0, 5),
      bulkOrders: orders.filter(o => o.isBulk).length
    };
    return stats;
  } catch (error) {
    console.error('Error calculating customer stats:', error);
    throw error;
  }
}

// ─── Inventory: suppliers ─────────────────────────────────────────────────
export async function getSuppliers({ includeInactive = false } = {}) {
  const qs = includeInactive ? '?includeInactive=true' : '';
  return apiRequest(`/suppliers${qs}`);
}
export async function createSupplier(data) {
  return apiRequest('/suppliers', { method: 'POST', body: JSON.stringify(data) });
}
export async function updateSupplier(id, data) {
  return apiRequest(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}
export async function deleteSupplier(id, hard = false) {
  const qs = hard ? '?hard=true' : '';
  return apiRequest(`/suppliers/${id}${qs}`, { method: 'DELETE' });
}

// ─── Inventory: stock movements (audit log) ───────────────────────────────
export async function getStockMovements({ inventoryId, type, supplierId, from, to, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (inventoryId) params.set('inventoryId', inventoryId);
  if (type) params.set('type', type);
  if (supplierId) params.set('supplierId', supplierId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`/stock-movements${qs}`);
}

export async function getMovementSummary(inventoryId) {
  return apiRequest(`/stock-movements/summary/${inventoryId}`);
}

export async function getInventoryDashboard() {
  return apiRequest('/stock-movements/dashboard/summary');
}

export async function restockItem(payload) {
  // payload: { inventoryId, quantity, supplierId?, supplierAdHoc?, unitCost?, invoiceNumber?, batchNumber?, expiryDate?, notes? }
  return apiRequest('/stock-movements/restock', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function adjustStock(payload) {
  // payload: { inventoryId, delta (signed), reason, notes? }
  return apiRequest('/stock-movements/adjust', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function recordDamage(payload) {
  // payload: { inventoryId, quantity (positive), reason, notes? }
  return apiRequest('/stock-movements/damage', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Admin Users ──────────────────────────────────────────────────────────
export async function getUsersList() {
  return apiRequest('/users');
}
export async function getUserStats() {
  return apiRequest('/users/stats/summary');
}
export async function getUserActivity(userId) {
  return apiRequest(`/users/${userId}/activity`);
}
export async function updateUserAdmin(userId, payload) {
  // payload: { role?, status?, name?, reason? }
  return apiRequest(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
export async function bulkUpdateUsers(userIds, updates) {
  return apiRequest('/users/bulk/update', {
    method: 'PUT',
    body: JSON.stringify({ userIds, updates }),
  });
}
export async function addUserNote(userId, note) {
  return apiRequest(`/users/${userId}/note`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}
export async function getUserHistory(userId) {
  return apiRequest(`/users/${userId}/history`);
}
export async function downloadUsersCsv(filter = {}) {
  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
  const params = new URLSearchParams();
  if (filter.role && filter.role !== 'all') params.set('role', filter.role);
  if (filter.status && filter.status !== 'all') params.set('status', filter.status);
  const url = `${API_URL}/users/export/csv${params.toString() ? '?' + params.toString() : ''}`;
  const token = localStorage.getItem('token');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// ─── Coupons ──────────────────────────────────────────────────────────────
export async function validateCouponCode(code, cartItems) {
  return apiRequest('/coupons/validate', {
    method: 'POST',
    body: JSON.stringify({ code, cartItems }),
  });
}
export async function getCoupons() {
  return apiRequest('/coupons');
}
export async function getCouponStats() {
  return apiRequest('/coupons/stats/summary');
}
export async function getCoupon(id) {
  return apiRequest(`/coupons/${id}`);
}
export async function createCoupon(payload) {
  return apiRequest('/coupons', { method: 'POST', body: JSON.stringify(payload) });
}
export async function updateCoupon(id, payload) {
  return apiRequest(`/coupons/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export async function deactivateCoupon(id) {
  return apiRequest(`/coupons/${id}`, { method: 'DELETE' });
}
export async function getCouponRedemptions(id) {
  return apiRequest(`/coupons/${id}/redemptions`);
}
export async function downloadCouponsCsv() {
  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}/coupons/export/csv`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `coupons-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// ─── Admin Insights (AI) ──────────────────────────────────────────────────
export async function aiOrderSummary(orderId) {
  return apiRequest(`/admin-insights/order/${orderId}/summary`);
}
export async function aiRestockSuggestions() {
  return apiRequest('/admin-insights/restock-suggestions');
}
export async function aiProductionForecast() {
  return apiRequest('/admin-insights/production-forecast');
}
export async function aiHealth() {
  return apiRequest('/admin-insights/ai-health');
}
export async function aiPurgeCache() {
  return apiRequest('/admin-insights/ai-cache/purge', { method: 'POST' });
}

// ─── Admin Orders ─────────────────────────────────────────────────────────
export async function getOrderStats() {
  return apiRequest('/orders/stats/summary');
}
export async function updateOrderStatus(orderId, status, opts = {}) {
  return apiRequest(`/orders/${orderId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, reason: opts.reason, note: opts.note }),
  });
}
export async function bulkUpdateOrderStatus(orderIds, status, reason) {
  return apiRequest('/orders/bulk-status', {
    method: 'POST',
    body: JSON.stringify({ orderIds, status, reason }),
  });
}
export async function refundOrder(orderId, payload) {
  // payload: { amount, reason, note? }
  return apiRequest(`/orders/${orderId}/refund`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export async function addOrderNote(orderId, note) {
  return apiRequest(`/orders/${orderId}/note`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}
export async function getOrderHistory(orderId) {
  return apiRequest(`/orders/${orderId}/history`);
}

/**
 * Save courier handoff info on an order (admin only). Triggers an audit
 * log entry, a system chat message visible to the customer, and a bell
 * notification.
 *
 * Body:
 *   { name, trackingNumber, trackingUrl?, contactPhone?, notes? }
 */
export async function setOrderCourier(orderId, payload) {
  return apiRequest(`/orders/${orderId}/courier`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export function getOrderExportUrl({ status, from, to } = {}) {
  const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  // CSV export is auth-protected — the helper returns the URL; the caller
  // uses fetch() so we can attach the Authorization header, then triggers a
  // download via a blob URL.
  return `${API_URL}/orders/export/csv${params.toString() ? '?' + params.toString() : ''}`;
}
export async function downloadOrderCsv(filter = {}) {
  const url = getOrderExportUrl(filter);
  const token = localStorage.getItem('token');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

// ─── AI Design Assistant ──────────────────────────────────────────────────
export async function aiGetUsage() {
  return apiRequest('/ai-design/usage');
}
export async function aiGetHistory(limit = 12) {
  return apiRequest(`/ai-design/history?limit=${limit}`);
}
export async function aiSuggestPrompts(category = 'general', count = 6) {
  return apiRequest('/ai-design/suggest', {
    method: 'POST',
    body: JSON.stringify({ category, count }),
  });
}
export async function aiEnhancePrompt(prompt) {
  return apiRequest('/ai-design/enhance', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}
export async function aiGenerateDecal(prompt, style = 'minimalist') {
  return apiRequest('/ai-design/decal', {
    method: 'POST',
    body: JSON.stringify({ prompt, style }),
  });
}
export async function aiRemoveBackground(image) {
  return apiRequest('/ai-design/remove-bg', {
    method: 'POST',
    body: JSON.stringify({ image }),
  });
}
export async function aiGenerateVariations({ image, prompt, style, count = 3 }) {
  return apiRequest('/ai-design/variations', {
    method: 'POST',
    body: JSON.stringify({ image, prompt, style, count }),
  });
}
export async function aiCritiqueDesign({ image, productName, designContext }) {
  return apiRequest('/ai-design/critique', {
    method: 'POST',
    body: JSON.stringify({ image, productName, designContext }),
  });
}
export async function aiListMockupScenes(productType) {
  return apiRequest(`/ai-design/mockup/scenes?productType=${encodeURIComponent(productType || 'shirt')}`);
}
export async function aiGenerateMockup({ designImage, productType, productName, scene, bodySize, customDescription }) {
  return apiRequest('/ai-design/mockup', {
    method: 'POST',
    body: JSON.stringify({ designImage, productType, productName, scene, bodySize, customDescription }),
  });
}

// ─── Production scheduling ────────────────────────────────────────────────
export async function getProductionQueue() {
  return apiRequest('/production/queue');
}
export async function getProductionSchedule({ from, to, date } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`/production/schedule${qs}`);
}
export async function getProductionActive() {
  return apiRequest('/production/active');
}
// Staff Task Board — only tasks assigned to the calling user, grouped by
// kanban column (todo / in_progress / done).
export async function getMyTasks() {
  return apiRequest('/production/my-tasks');
}
// QC photo submission (staff). photoDataUrl is a 'data:image/...' string.
export async function submitQcPhoto(orderId, photoDataUrl, note = '') {
  return apiRequest(`/production/${orderId}/qc-photo`, {
    method: 'POST',
    body: JSON.stringify({ photo: photoDataUrl, note }),
  });
}
// QC review (admin)
export async function approveQc(orderId) {
  return apiRequest(`/production/${orderId}/qc-approve`, { method: 'POST' });
}
export async function rejectQc(orderId, reason) {
  return apiRequest(`/production/${orderId}/qc-reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
// Blocker (staff + admin)
export async function flagBlocker(orderId, reason, note = '') {
  return apiRequest(`/production/${orderId}/flag-blocker`, {
    method: 'POST',
    body: JSON.stringify({ reason, note }),
  });
}
export async function clearBlocker(orderId, payload = {}) {
  return apiRequest(`/production/${orderId}/clear-blocker`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
// Admin dashboards for QC + blockers
export async function getQcPending() { return apiRequest('/production/qc-pending'); }
export async function getActiveBlockers() { return apiRequest('/production/blockers'); }
// System config (admin)
export async function getSystemConfig() { return apiRequest('/system/config'); }
export async function updateSystemConfig(payload) {
  return apiRequest('/system/config', { method: 'PUT', body: JSON.stringify(payload) });
}
export async function getProductionStats() {
  return apiRequest('/production/stats');
}
export async function getProductionTeam() {
  return apiRequest('/production/team');
}
export async function scheduleProductionOrder(orderId, payload) {
  return apiRequest(`/production/${orderId}/schedule`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
export async function bulkScheduleOrders(payload) {
  // payload: { orderIds: [...], productionDate, productionPriority? }
  return apiRequest('/production/schedule/bulk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export async function advanceProductionStage(orderId, payload = {}) {
  return apiRequest(`/production/${orderId}/advance`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export async function addProductionNote(orderId, note) {
  return apiRequest(`/production/${orderId}/note`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  });
}
export async function getProductionHistory(orderId) {
  return apiRequest(`/production/${orderId}/history`);
}
export async function getProductionCapacity() {
  return apiRequest('/production/capacity');
}
export async function updateProductionCapacity(payload) {
  return apiRequest('/production/capacity', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getCustomerActivity() {
  try {
    const orders = await getMyOrders();
    const activities = orders.map(order => ({
      id: order.id,
      type: 'order',
      title: `Order ${order.id.slice(-6)}`,
      description: `Order ${order.status} - ₱${(order.totalPrice || 0).toFixed(2)}`,
      status: order.status,
      date: order.createdAt,
      orderId: order.id,
      amount: order.totalPrice
    })).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return activities.slice(0, 10); // Return last 10 activities
  } catch (error) {
    console.error('Error fetching customer activity:', error);
    throw error;
  }
}

// ─── Delivery / urgency ──────────────────────────────────────────────────
export async function getDeliveryTiers() {
  return apiRequest('/orders/delivery/tiers');
}
export async function quoteDelivery(requestedDeliveryDate, subtotal) {
  return apiRequest('/orders/delivery/quote', {
    method: 'POST',
    body: JSON.stringify({ requestedDeliveryDate, subtotal }),
  });
}
export async function getDeliveryAvailability(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', new Date(from).toISOString());
  if (to) params.set('to', new Date(to).toISOString());
  return apiRequest(`/orders/delivery/availability?${params.toString()}`);
}
export async function getDeliveryCalendar(from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', new Date(from).toISOString());
  if (to) params.set('to', new Date(to).toISOString());
  return apiRequest(`/orders/delivery/calendar?${params.toString()}`);
}
export async function getPriorityQueue() {
  return apiRequest('/orders/queue/priority');
}

// ─── Reviews ──────────────────────────────────────────────────────────────
export async function getProductReviews(sku) {
  return apiRequest(`/reviews/product/${encodeURIComponent(sku)}`);
}
export async function getReviewEligibility(sku) {
  return apiRequest(`/reviews/eligibility/${encodeURIComponent(sku)}`);
}
export async function getMyReviews() {
  return apiRequest('/reviews/mine');
}
export async function submitReview({ sku, rating, title, comment }) {
  return apiRequest('/reviews', {
    method: 'POST',
    body: JSON.stringify({ sku, rating, title, comment }),
  });
}
export async function deleteMyReview(sku) {
  return apiRequest(`/reviews/${encodeURIComponent(sku)}`, { method: 'DELETE' });
}
export async function getAdminReviews(status = 'pending') {
  return apiRequest(`/reviews/admin?status=${status}`);
}
export async function moderateReview(id, decision, note) {
  return apiRequest(`/reviews/admin/${id}/moderate`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
  });
}
export async function getReviewStats() {
  return apiRequest('/reviews/admin/stats');
}

// ─── Abandoned carts ──────────────────────────────────────────────────────
export async function syncAbandonedCart(items, subtotal) {
  return apiRequest('/abandoned-carts/sync', {
    method: 'POST',
    body: JSON.stringify({ items, subtotal }),
  });
}

// ─── Pricing engine (panel revision #6, #7) ───────────────────────────────
export async function getPricingQuote({ items, rush = false }) {
  return apiRequest('/pricing/quote', {
    method: 'POST',
    body: JSON.stringify({ items, rush }),
  });
}

// ─── Returns / damage requests (panel revision #9) ────────────────────────
export async function fileReturn({ orderId, reason, description, photos = [] }) {
  return apiRequest('/returns', {
    method: 'POST',
    body: JSON.stringify({ orderId, reason, description, photos }),
  });
}
export async function getMyReturns() {
  return apiRequest('/returns/mine');
}
export async function listAdminReturns(status) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest(`/returns${qs}`);
}
export async function decideReturn(returnId, decision, adminNote = '') {
  return apiRequest(`/returns/${returnId}/decision`, {
    method: 'PATCH',
    body: JSON.stringify({ decision, adminNote }),
  });
}

// ─── In-app order chat (panel revision #14) ───────────────────────────────
export async function getOrderChat(orderId) {
  return apiRequest(`/chat/${orderId}`);
}
export async function sendOrderChatMessage(orderId, body) {
  return apiRequest(`/chat/${orderId}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}
export async function getChatUnreadCount() {
  return apiRequest('/chat/unread/count');
}

// ─── Customer self-cancel (panel revision #10) ────────────────────────────
export async function customerCancelOrder(orderId, reason) {
  return apiRequest(`/orders/${orderId}/customer-cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// ─── Customer-safe order timeline ─────────────────────────────────────────
export async function getOrderTimeline(orderId) {
  return apiRequest(`/orders/${orderId}/timeline`);
}

// ─── Chat inbox (admin/staff) ─────────────────────────────────────────────
export async function getChatThreads() {
  return apiRequest('/chat/threads');
}

// ─── Quotation workflow ───────────────────────────────────────────────────
// New flow for custom-merch orders. See backend/routes/orders.js quotation
// routes for the full lifecycle. Each helper returns the refreshed order
// so the caller can drop it straight into state.

export async function sendQuotation(orderId, lineItems, total, downpaymentPct = 50) {
  return apiRequest(`/orders/${orderId}/quotation`, {
    method: 'POST',
    body: JSON.stringify({ lineItems, total, downpaymentPct }),
  });
}

export async function acceptQuotation(orderId) {
  return apiRequest(`/orders/${orderId}/quotation/accept`, { method: 'POST' });
}

export async function declineQuotation(orderId, reason) {
  return apiRequest(`/orders/${orderId}/quotation/decline`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function uploadPaymentProof(orderId, type, { method, reference, proofUrls }) {
  return apiRequest(`/orders/${orderId}/payment-proof`, {
    method: 'POST',
    body: JSON.stringify({ type, method, reference, proofUrls }),
  });
}

export async function verifyPayment(orderId, type) {
  return apiRequest(`/orders/${orderId}/payments/${type}/verify`, { method: 'POST' });
}

export async function rejectPayment(orderId, type, reason) {
  return apiRequest(`/orders/${orderId}/payments/${type}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
