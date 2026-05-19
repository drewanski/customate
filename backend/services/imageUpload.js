/**
 * Image upload service — thin wrapper around config/cloudinary.js.
 *
 * Order create uses this to offload base64 design previews → CDN URLs.
 * Delegates to the canonical config so we keep ONE place that knows the
 * Cloudinary credentials + placeholder detection. If Cloudinary isn't
 * configured, returns the input unchanged so dev flows still work.
 */

import {
  uploadBase64 as cloudinaryUploadBase64,
  isCloudinaryConfigured as configured,
} from '../config/cloudinary.js';

export function isCloudinaryConfigured() {
  return configured;
}

export async function uploadImage(input, { folder = 'designs/orders' } = {}) {
  if (!input || typeof input !== 'string') return null;
  if (!configured) return input;
  try {
    const result = await cloudinaryUploadBase64(input, folder);
    return result.url;
  } catch (err) {
    console.error('[imageUpload] upload failed:', err.message);
    return input; // fall back rather than break the order
  }
}
