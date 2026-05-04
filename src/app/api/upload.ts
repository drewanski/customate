import { apiRequest } from '../api';

/**
 * Upload design image file
 * @param file - Image file (JPG, PNG, GIF, WebP, SVG)
 */
export async function uploadDesign(file: File) {
  const formData = new FormData();
  formData.append('design', file);

  const response = await fetch('http://localhost:4000/api/upload/design', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload design');
  }

  return response.json();
}

/**
 * Upload base64 image data (for canvas exports)
 * @param imageData - Base64 encoded image
 * @param folder - Optional folder name
 */
export async function uploadBase64Image(imageData: string, folder: string = 'designs') {
  const response = await apiRequest('/upload/base64', {
    method: 'POST',
    body: JSON.stringify({ imageData, folder })
  });
  return response;
}

/**
 * Upload product image (admin only)
 * @param file - Image file
 */
export async function uploadProductImage(file: File) {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch('http://localhost:4000/api/upload/product', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload product image');
  }

  return response.json();
}

/**
 * Upload avatar image
 * @param file - Image file
 */
export async function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append('avatar', file);

  const response = await fetch('http://localhost:4000/api/upload/avatar', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload avatar');
  }

  return response.json();
}

/**
 * Validate image file before upload
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Only JPG, PNG, GIF, WebP, and SVG files are allowed' };
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be less than 5MB' };
  }

  return { valid: true };
}
