import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// ─── Configuration with placeholder detection ──────────────────────────────
// .env.example ships placeholder values (`your_cloud_name`, etc). Without
// detecting these, uploads would silently 401 against a fake Cloudinary URL
// — appearing as "Failed to upload" to the user. We treat placeholders as
// "not configured" and gracefully fall back to the original input (data URL
// for base64, a no-op for files) so dev flows work without Cloudinary.
const PLACEHOLDER_VALUES = new Set([
  '',
  'your_cloud_name',
  'your_api_key',
  'your_api_secret',
  'changeme',
  'replaceme',
]);

function looksReal(v) {
  return typeof v === 'string' && v.trim().length > 0 && !PLACEHOLDER_VALUES.has(v.trim());
}

export const isCloudinaryConfigured =
  looksReal(process.env.CLOUDINARY_CLOUD_NAME) &&
  looksReal(process.env.CLOUDINARY_API_KEY) &&
  looksReal(process.env.CLOUDINARY_API_SECRET);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  console.warn('[cloudinary] Skipped configuration — env vars missing or placeholder. Uploads will return data URLs.');
}

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Path to local file OR base64 data URI
 * @param {string} folder - Cloudinary folder name
 * @param {object} options - Additional options
 */
export async function uploadImage(filePath, folder = 'customate', options = {}) {
  // Dev fallback: no Cloudinary → return the original input (data URI) so
  // the studio still gets a usable image reference. The thumbnail URL is
  // the same — the customizer's WebGL texture loader handles either form.
  if (!isCloudinaryConfigured) {
    return {
      publicId: null,
      url: filePath,
      thumbnailUrl: filePath,
      width: 0,
      height: 0,
      format: 'png',
      size: 0,
    };
  }
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `customate/${folder}`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
      transformation: [
        { quality: 'auto:good' }, // Auto-optimize quality
        { fetch_format: 'auto' }  // Auto-select best format
      ],
      ...options
    });

    return {
      publicId: result.public_id,
      url: result.secure_url,
      thumbnailUrl: cloudinary.url(result.public_id, {
        width: 300,
        crop: 'scale',
        quality: 'auto'
      }),
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.bytes
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Failed to upload image: ' + error.message);
  }
}

/**
 * Upload base64 image data
 * Used for design previews or canvas exports
 */
export async function uploadBase64(base64Data, folder = 'designs', filename = null) {
  // Dev fallback — return the data URI unchanged so callers can persist
  // it (smaller PNGs only, ideally) without an external dependency.
  if (!isCloudinaryConfigured) {
    return {
      publicId: null,
      url: base64Data,
      thumbnailUrl: base64Data,
      width: 0,
      height: 0,
    };
  }
  try {
    // Remove data:image/xxx;base64, prefix if present
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const dataUri = `data:image/png;base64,${cleanBase64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `customate/${folder}`,
      public_id: filename || `design_${Date.now()}`,
      resource_type: 'image',
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });

    return {
      publicId: result.public_id,
      url: result.secure_url,
      thumbnailUrl: cloudinary.url(result.public_id, {
        width: 400,
        crop: 'limit',
        quality: 'auto'
      }),
      width: result.width,
      height: result.height
    };
  } catch (error) {
    console.error('Cloudinary base64 upload error:', error);
    throw new Error('Failed to upload image: ' + error.message);
  }
}

/**
 * Delete image from Cloudinary
 */
export async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete image: ' + error.message);
  }
}

/**
 * Generate optimized image URL with transformations
 */
export function getOptimizedUrl(publicId, options = {}) {
  const transformations = [];
  
  if (options.width) transformations.push({ width: options.width, crop: 'limit' });
  if (options.height) transformations.push({ height: options.height, crop: 'limit' });
  if (options.quality) transformations.push({ quality: options.quality });
  
  return cloudinary.url(publicId, {
    transformation: transformations,
    secure: true
  });
}

export default cloudinary;
