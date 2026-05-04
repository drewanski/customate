import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * Upload image to Cloudinary
 * @param {string} filePath - Path to local file OR base64 data URI
 * @param {string} folder - Cloudinary folder name
 * @param {object} options - Additional options
 */
export async function uploadImage(filePath, folder = 'customate', options = {}) {
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
