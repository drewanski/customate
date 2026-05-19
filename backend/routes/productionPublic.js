import express from 'express';

/**
 * Legacy unauthenticated production endpoints — REMOVED for security.
 *
 * Previously: /api/production-public/queue, /schedule, /:id/schedule were
 * exposed without auth as a dev workaround. That left scheduling open to any
 * unauthenticated caller. All endpoints now return HTTP 410 Gone pointing the
 * caller to the authenticated /api/production/* equivalents.
 *
 * Keeping the file mounted instead of fully deleting so old frontend bundles
 * (cached on customer browsers) get a clear error instead of a 404.
 */
const router = express.Router();

router.all('*', (req, res) => {
  res.status(410).json({
    message: 'This endpoint has been removed. Use /api/production/* with admin auth instead.',
    movedTo: req.originalUrl.replace('/production-public', '/production'),
  });
});

export default router;
