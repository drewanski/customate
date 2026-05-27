import express from 'express';
import Design from '../models/Design.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// GET /api/designs — list current user's saved designs (newest first, max 50)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const designs = await Design.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json(designs);
  } catch {
    res.status(500).json({ message: 'Failed to load designs' });
  }
});

// POST /api/designs — save a new design for the current user
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { product, color, size, elements, previewUrl, ts } = req.body;

    // Cap at 50 designs per user — drop the oldest when limit is reached
    const count = await Design.countDocuments({ user: req.user.userId });
    if (count >= 50) {
      const overflow = await Design.find({ user: req.user.userId })
        .sort({ createdAt: 1 })
        .limit(count - 49)
        .select('_id')
        .lean();
      await Design.deleteMany({ _id: { $in: overflow.map((d) => d._id) } });
    }

    const design = await Design.create({
      user:       req.user.userId,
      product:    product    || 'tshirt',
      color:      color      || '#FFFFFF',
      size:       size       || 'M',
      elements:   elements   || [],
      previewUrl: previewUrl || null,
      ts:         ts         || Date.now(),
    });

    res.status(201).json(design);
  } catch {
    res.status(500).json({ message: 'Failed to save design' });
  }
});

// DELETE /api/designs/:id — delete one of the current user's designs
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await Design.findOneAndDelete({
      _id:  req.params.id,
      user: req.user.userId, // users can only delete their own designs
    });
    if (!deleted) return res.status(404).json({ message: 'Design not found' });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ message: 'Failed to delete design' });
  }
});

export default router;
