import express from 'express';
import SystemConfig from '../models/SystemConfig.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * GET /api/system/config
 * Read the current operational config. Admin only — these settings
 * control automation behaviour and shouldn't be visible to staff.
 */
router.get('/config', adminMiddleware, async (req, res) => {
  try {
    const cfg = await SystemConfig.getOrCreate();
    res.json({
      autoAssignEnabled: !!cfg.autoAssignEnabled,
      dailyDigestEnabled: !!cfg.dailyDigestEnabled,
      dailyDigestHour: cfg.dailyDigestHour ?? 18,
      lastUpdatedAt: cfg.lastUpdatedAt,
    });
  } catch (err) {
    console.error('GET /system/config error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * PUT /api/system/config
 * Body: any subset of { autoAssignEnabled, dailyDigestEnabled, dailyDigestHour }
 */
router.put('/config', adminMiddleware, async (req, res) => {
  try {
    const cfg = await SystemConfig.getOrCreate();
    if (typeof req.body.autoAssignEnabled === 'boolean') {
      cfg.autoAssignEnabled = req.body.autoAssignEnabled;
    }
    if (typeof req.body.dailyDigestEnabled === 'boolean') {
      cfg.dailyDigestEnabled = req.body.dailyDigestEnabled;
    }
    if (Number.isFinite(req.body.dailyDigestHour)) {
      const h = Math.round(req.body.dailyDigestHour);
      if (h >= 0 && h <= 23) cfg.dailyDigestHour = h;
    }
    cfg.lastUpdatedAt = new Date();
    cfg.lastUpdatedBy = req.user.userId;
    await cfg.save();
    res.json({
      autoAssignEnabled: cfg.autoAssignEnabled,
      dailyDigestEnabled: cfg.dailyDigestEnabled,
      dailyDigestHour: cfg.dailyDigestHour,
      lastUpdatedAt: cfg.lastUpdatedAt,
    });
  } catch (err) {
    console.error('PUT /system/config error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
