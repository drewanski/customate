import { apiRequest } from '../api';

/**
 * Create a GCash payment
 * Returns checkout URL that redirects to GCash app/website
 */
export async function createGCashPayment(orderId: string, billing: {
  name?: string;
  email?: string;
  phone?: string;
}) {
  const response = await apiRequest('/paymongo/gcash', {
    method: 'POST',
    body: JSON.stringify({ orderId, billing })
  });
  return response;
}

/**
 * Create a Maya payment
 * Returns checkout URL that redirects to Maya app/website
 */
export async function createMayaPayment(orderId: string, billing: {
  name?: string;
  email?: string;
  phone?: string;
}) {
  const response = await apiRequest('/paymongo/maya', {
    method: 'POST',
    body: JSON.stringify({ orderId, billing })
  });
  return response;
}

/**
 * Create a payment link (supports cards, GrabPay, etc.)
 * Returns checkout URL that redirects to PayMongo's hosted checkout
 */
export async function createPaymentLink(orderId: string) {
  const response = await apiRequest('/paymongo/link', {
    method: 'POST',
    body: JSON.stringify({ orderId })
  });
  return response;
}

/**
 * Get payment status for an order
 */
export async function getPaymongoStatus(orderId: string) {
  const response = await apiRequest(`/paymongo/status/${orderId}`);
  return response;
}

/**
 * Get PayMongo configuration (public key, available methods)
 */
export async function getPaymongoConfig() {
  const response = await apiRequest('/paymongo/config');
  return response;
}

/**
 * Redirect to GCash payment
 * Opens GCash checkout in new window or redirects current window
 */
export function redirectToGCash(checkoutUrl: string) {
  // For mobile, this often opens the GCash app directly
  // For desktop, it shows a QR code to scan with GCash app
  window.location.href = checkoutUrl;
}

/**
 * Redirect to Maya payment
 */
export function redirectToMaya(checkoutUrl: string) {
  window.location.href = checkoutUrl;
}

/**
 * Redirect to PayMongo hosted checkout
 * Supports cards, GrabPay, and other methods
 */
export function redirectToPaymongoCheckout(checkoutUrl: string) {
  window.location.href = checkoutUrl;
}
