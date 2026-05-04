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
 * Ensures webhook events are actually from PayMongo
 */
export function verifyWebhookSignature(payload, signatureHeader, webhookSecret) {
  try {
    // PayMongo uses t=<timestamp>,v1=<signature> format
    const elements = signatureHeader.split(',');
    const signatureHash = elements.find(el => el.startsWith('v1='))?.replace('v1=', '');
    const timestamp = elements.find(el => el.startsWith('t='))?.replace('t=', '');
    
    if (!signatureHash || !timestamp) {
      return false;
    }

    // Create expected signature
    const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    return signatureHash === expectedSignature;
  } catch (error) {
    console.error('Webhook verification error:', error);
    return false;
  }
}

export default paymongoApi;
