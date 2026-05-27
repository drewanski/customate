/**
 * pushNotification.js
 * Sends Expo push notifications via the Expo Push API (free tier).
 * No Firebase/APNs server keys needed — Expo handles the bridge.
 * Node 18+ fetch is used (no extra dependency).
 */

import User from '../models/User.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a specific MongoDB userId.
 * Looks up their expoPushToken and hits the Expo Push API.
 * Always non-blocking — never throws, so callers can fire-and-forget.
 *
 * @param {string|ObjectId} userId  - MongoDB user _id
 * @param {{ title, body, data? }} payload
 */
export async function sendPushToUser(userId, { title, body, data = {} }) {
  try {
    const user = await User.findById(userId).select('expoPushToken').lean();
    const token = user?.expoPushToken;

    // Validate token format — Expo tokens start with ExponentPushToken[ or ExpoPushToken[
    if (!token || (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken['))) {
      return;
    }

    const message = {
      to:       token,
      sound:    'default',
      title,
      body,
      data:     { ...data, _sent: Date.now() },
      priority: 'high',
      channelId: 'orders', // Android notification channel
    };

    const res = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: {
        'Accept':           'application/json',
        'Accept-Encoding':  'gzip, deflate',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await res.json().catch(() => ({}));

    if (result?.data?.status === 'error') {
      console.error('[push] Expo error for token', token.slice(0, 30), ':', result.data.message);
      // If token is invalid (unregistered device), clear it so we stop sending
      if (result.data.details?.error === 'DeviceNotRegistered') {
        await User.findByIdAndUpdate(userId, { expoPushToken: null }).catch(() => {});
      }
    }
  } catch (err) {
    // Never crash the caller
    console.error('[push] sendPushToUser failed:', err.message);
  }
}

// ─── Order status → notification copy ────────────────────────────────────────
const STATUS_PUSH = {
  approved:      { title: '✅ Order Confirmed!',          body: 'Your order has been approved and is being prepared.' },
  in_production: { title: '🏭 In Production',             body: 'Your custom order is now being produced.' },
  ready:         { title: '📦 Ready to Ship!',            body: 'Your order is packed and ready for delivery.' },
  shipped:       { title: '🚚 Your Order is on Its Way!', body: 'Your order has been shipped. Check the app for updates.' },
  delivered:     { title: '🎉 Order Delivered!',          body: 'Your order has arrived. Enjoy your purchase!' },
  cancelled:     { title: '❌ Order Cancelled',           body: 'Your order has been cancelled. Contact us if this was unexpected.' },
  rejected:      { title: '❌ Order Rejected',            body: 'Your order was rejected. Please contact support for help.' },
  refunded:      { title: '💸 Refund Issued',             body: 'Your refund has been processed. It may take a few days to appear.' },
};

/**
 * Returns { title, body } for a given order status, or null if no push needed.
 */
export function getPushContentForStatus(status) {
  return STATUS_PUSH[status] ?? null;
}
