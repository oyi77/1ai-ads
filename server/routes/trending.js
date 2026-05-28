import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

export function createTrendingRouter(trendingService) {
  const router = Router();

  router.get('/internal', requireAuth, async (_req, res) => {
    try {
      const trends = await trendingService.getInternalTrends();
      res.json({ success: true, data: trends });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/external', requireAuth, async (req, res) => {
    try {
      const { industry, region, source = 'api' } = req.query;
      const trends = await trendingService.getExternalTrends(industry, region);
      res.json({ success: true, data: trends, source });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/all', requireAuth, async (req, res) => {
    try {
      const { industry, region, source = 'api' } = req.query;
      const trends = await trendingService.getAllTrends(industry, region);
      res.json({ success: true, data: trends, source });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}