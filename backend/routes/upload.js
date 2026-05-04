import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { uploadImage, uploadBase64 } from '../config/cloudinary.js';

const router = express.Router();

// Configure multer for memory storage (we'll upload to Cloudinary)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, WebP, SVG) are allowed'), false);
    }
  }
});

/**
 * Upload design image (for customization)
 * POST /api/upload/design
 */
router.post('/design', authMiddleware, upload.single('design'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Convert buffer to base64 for Cloudinary
    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    const result = await uploadImage(dataUri, 'designs', {
      public_id: `design_${req.user.userId}_${Date.now()}`
    });

    res.json({
      message: 'Design uploaded successfully',
      image: {
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        publicId: result.publicId,
        width: result.width,
        height: result.height
      }
    });
  } catch (error) {
    console.error('Design upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload design' });
  }
});

/**
 * Upload base64 image (for canvas exports or previews)
 * POST /api/upload/base64
 */
router.post('/base64', authMiddleware, async (req, res) => {
  try {
    const { imageData, folder = 'designs' } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ message: 'No image data provided' });
    }

    const result = await uploadBase64(
      imageData, 
      folder, 
      `design_${req.user.userId}_${Date.now()}`
    );

    res.json({
      message: 'Image uploaded successfully',
      image: {
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        publicId: result.publicId,
        width: result.width,
        height: result.height
      }
    });
  } catch (error) {
    console.error('Base64 upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload image' });
  }
});

/**
 * Upload product image (admin only)
 * POST /api/upload/product
 */
router.post('/product', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    // Check if admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    const result = await uploadImage(dataUri, 'products', {
      public_id: `product_${Date.now()}`
    });

    res.json({
      message: 'Product image uploaded successfully',
      image: {
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        publicId: result.publicId
      }
    });
  } catch (error) {
    console.error('Product upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload product image' });
  }
});

/**
 * Upload profile avatar
 * POST /api/upload/avatar
 */
router.post('/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    const result = await uploadImage(dataUri, 'avatars', {
      public_id: `avatar_${req.user.userId}`,
      transformation: [
        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
        { quality: 'auto:good' }
      ]
    });

    res.json({
      message: 'Avatar uploaded successfully',
      avatar: {
        url: result.url,
        thumbnailUrl: result.thumbnailUrl,
        publicId: result.publicId
      }
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload avatar' });
  }
});

export default router;
