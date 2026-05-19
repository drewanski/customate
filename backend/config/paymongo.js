import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// PayMongo API Configuration
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
export const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY;
export const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

// Create axios instance with auth header
const paymongoApi = axios.create({
  baseURL: PAYMONGO_API_URL,
  headers: {
    'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`,
    'Content-Type': 'application/json'
  }
});

// Available payment methods in PayMongo
export const PAYMENT_METHODS = {
  GCASH: 'gcash',
  MAYA: 'paymaya', // PayMongo uses 'paymaya' for Maya
  CARD: 'card',
  GRABPAY: 'grab_pay',
  BPI: 'bpi',
  BILLEASE: 'billease',
  // Bank transfers via PESONet/InstaPay can be added separately
};

/**
 * Create a payment link (checkout URL) for e-wallets and cards
 * This redirects customer to PayMongo's checkout page
 * Uses raw PayMongo REST API
 */
export async function createPaymentLink({
  amount,           // Amount in cents (e.g., 10000 = ₱100.00)
  description,
  remarks,
  successUrl,
  cancelUrl,
  metadata = {}
}) {
  try {
    const payload = {
      data: {
        attributes: {
          amount: amount,
          description: description || 'Order Payment',
          remarks: remarks || '',
          success_url: successUrl,
          cancel_url: cancelUrl,
          metadata
        }
      }
    };

    const response = await paymongoApi.post('/links', payload);
    const link = response.data.data;

    return {
      id: link.id,
      checkoutUrl: link.attributes.checkout_url,
      referenceNumber: link.attributes.reference_number,
      status: link.attributes.status
    };
  } catch (error) {
    console.error('PayMongo Payment Link Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errors?.[0]?.detail || error.message);
  }
}

/**
 * Create a payment intent for server-side processing
 * Used for embedded checkout or custom payment flows
 * Uses raw PayMongo REST API
 */
export async function createPaymentIntent({
  amount,
  paymentMethod,
  metadata = {}
}) {
  try {
    const payload = {
      data: {
        attributes: {
          amount: amount,
          payment_method_allowed: [paymentMethod],
          payment_method_options: {
            card: { request_three_d_secure: 'any' }
          },
          currency: 'PHP',
          metadata
        }
      }
    };

    const response = await paymongoApi.post('/payment_intents', payload);
    const intent = response.data.data;

    return {
      id: intent.id,
      clientKey: intent.attributes.client_key,
      status: intent.attributes.status,
      amount: intent.attributes.amount
    };
  } catch (error) {
    console.error('PayMongo Payment Intent Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errors?.[0]?.detail || error.message);
  }
}

/**
 * Create a source for e-wallet payments (GCash, Maya)
 * This generates a checkout URL specific to the e-wallet
 * Uses raw PayMongo REST API
 */
export async function createEWalletSource({
  type,           // 'gcash' or 'paymaya'
  amount,
  successUrl,
  cancelUrl,
  billing
}) {
  try {
    const payload = {
      data: {
        attributes: {
          type: type,
          amount: amount,
          currency: 'PHP',
          redirect: {
            success: successUrl,
            failed: cancelUrl
          },
          billing: {
            name: billing?.name || 'Customer',
            email: billing?.email || '',
            phone: billing?.phone || ''
          }
        }
      }
    };

    console.log('Creating PayMongo source with payload:', JSON.stringify(payload, null, 2));

    const response = await paymongoApi.post('/sources', payload);
    const source = response.data.data;

    console.log('PayMongo source created:', {
      id: source.id,
      type: source.attributes.type,
      status: source.attributes.status
    });

    return {
      id: source.id,
      type: source.attributes.type,
      status: source.attributes.status,
      checkoutUrl: source.attributes.redirect.checkout_url,
      amount: source.attributes.amount
    };
  } catch (error) {
    console.error('PayMongo E-Wallet Source Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errors?.[0]?.detail || error.message);
  }
}

/**
 * Retrieve an e-wallet source so we can check whether the customer has
 * actually authorized the payment in the GCash / Maya app.
 *
 * Status transitions: pending → chargeable (authorized) → consumed (charged)
 */
export async function retrieveSource(sourceId) {
  try {
    const response = await paymongoApi.get(`/sources/${sourceId}`);
    return response.data.data;
  } catch (error) {
    console.error('PayMongo Retrieve Source Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errors?.[0]?.detail || error.message);
  }
}

/**
 * Convert a chargeable source into a real payment. After this returns
 * successfully, the source is "consumed" and the payment is "paid".
 *
 * In live mode, the webhook would normally handle this when source.chargeable
 * fires — but in dev (localhost can't receive webhooks) we call this directly
 * from the verify endpoint so the order can be marked paid.
 */
export async function createPaymentFromSource({ sourceId, amount, description }) {
  try {
    const payload = {
      data: {
        attributes: {
          amount,
          currency: 'PHP',
          description: description || 'CustoMate order',
          source: { id: sourceId, type: 'source' },
        },
      },
    };
    const response = await paymongoApi.post('/payments', payload);
    return response.data.data;
  } catch (error) {
    console.error('PayMongo Create Payment Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errors?.[0]?.detail || error.message);
  }
}

/**
 * Retrieve payment status
 * Uses raw PayMongo REST API
 */
export async function retrievePayment(paymentId) {
  try {
    const response = await paymongoApi.get(`/payments/${paymentId}`);
    return response.data.data;
  } catch (error) {
    console.error('PayMongo Retrieve Payment Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errors?.[0]?.detail || error.message);
  }
}

/**
 * Retrieve payment intent status
 * Uses raw PayMongo REST API
 */
export async function retrievePaymentIntent(intentId) {
  try {
    const response = await paymongoApi.get(`/payment_intents/${intentId}`);
    return response.data.data;
  } catch (error) {
    console.error('PayMongo Retrieve Intent Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errors?.[0]?.detail || error.message);
  }
}

/**
 * Verify webhook signature
 *
 * Ensures webhook events are actually from PayMongo. PayMongo signs the RAW
 * request body — the buffer must be passed in unparsed. JSON.stringify(buffer)
 * produces `{"type":"Buffer","data":[…]}`, NOT the original bytes, so this
 * function expects either a Buffer (preferred) or a UTF-8 string.
 *
 * Header format: `t=<timestamp>,te=<test_sig>,li=<live_sig>` (legacy: `v1=`).
 *
 * Uses crypto.timingSafeEqual to prevent timing-based signature guessing.
 */
export function verifyWebhookSignature(payload, signatureHeader, webhookSecret) {
  try {
    if (!signatureHeader || !webhookSecret) return false;

    // Normalize the body to a raw UTF-8 string. Express.raw() gives us a Buffer
    // when registered for the webhook route; fall back gracefully for string.
    const rawBody =
      Buffer.isBuffer(payload) ? payload.toString('utf8') :
      typeof payload === 'string' ? payload :
      JSON.stringify(payload); // last-resort, less reliable

    // PayMongo signature header: comma-separated `key=value` pairs.
    // We accept t= + (te= live test) + (li= live) and the legacy v1= field.
    const parts = String(signatureHeader).split(',').reduce((acc, pair) => {
      const [k, v] = pair.split('=');
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    }, {});

    const timestamp = parts.t;
    // Prefer live signature in production, test signature in dev. Fall back to
    // legacy `v1` field for older webhook configs.
    const expectedKey = process.env.NODE_ENV === 'production' ? 'li' : 'te';
    const signatureHash = parts[expectedKey] || parts.v1 || parts.li || parts.te;

    if (!timestamp || !signatureHash) return false;

    // Reject events older than 5 minutes to block replay attacks.
    const eventAge = Math.floor(Date.now() / 1000) - Number(timestamp);
    if (!Number.isFinite(eventAge) || eventAge > 5 * 60 || eventAge < -60) {
      console.warn('PayMongo webhook rejected: stale timestamp', { eventAge });
      return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Constant-time compare. Both buffers must be equal length or this throws.
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signatureHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (error) {
    console.error('Webhook verification error:', error.message);
    return false;
  }
}

export default paymongoApi;
