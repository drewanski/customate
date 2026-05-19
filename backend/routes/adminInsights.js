import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import {
  summarizeOrder,
  suggestRestocks,
  forecastProduction,
} from '../services/adminInsights.js';
import { getHealth as getLlmHealth, purgeCache as purgeLlmCache } from '../services/llm.js';

const router = express.Router();
router.use(authMiddleware, adminMiddleware);

/**
 * GET /api/admin-insights/order/:orderId/summary
 * Returns AI-generated brief + risk score + suggested action for one order.
 */
router.get('/order/:orderId/summary', async (req, res) => {
  try {
    const out = await summarizeOrder(req.params.orderId);
    res.json(out);
  } catch (err) {
    console.error('order summary error:', err.message);
    res.status(err.message === 'Order not found' ? 404 : 500).json({
      message: err.message || 'Failed to generate summary',
    });
  }
});

/**
 * GET /api/admin-insights/restock-suggestions
 * Returns items that need reordering with predicted stockout dates and
 * suggested quantities.
 */
router.get('/restock-suggestions', async (req, res) => {
  try {
    const out = await suggestRestocks();
    res.json(out);
  } catch (err) {
    console.error('restock suggestions error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to compute restocks' });
  }
});

/**
 * GET /api/admin-insights/production-forecast
 * Next-7-days production load forecast with bottleneck detection.
 */
router.get('/production-forecast', async (req, res) => {
  try {
    const out = await forecastProduction();
    res.json(out);
  } catch (err) {
    console.error('production forecast error:', err.message);
    res.status(500).json({ message: err.message || 'Failed to forecast production' });
  }
});

/**
 * GET /api/admin-insights/ai-health
 * Reports which LLM providers (Ollama, Gemini) are configured + reachable,
 * cache hit rate, and per-provider call counts since the server started.
 */
router.get('/ai-health', async (req, res) => {
  try {
    res.json(await getLlmHealth());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Health check failed' });
  }
});

/**
 * POST /api/admin-insights/ai-cache/purge
 * Clear the persistent AI cache. Useful when prompts/system messages change.
 */
router.post('/ai-cache/purge', async (req, res) => {
  try {
    res.json(await purgeLlmCache());
  } catch (err) {
    res.status(500).json({ message: err.message || 'Purge failed' });
  }
});

export default router;
