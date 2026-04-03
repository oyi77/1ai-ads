import { Router } from 'express';

export function createTrendingRouter(trendingService) {
  const router = Router();

  router.get('/internal', async (req, res) => {
    try {
      const trends = await trendingService.getInternalTrends();
      res.json({ success: true, data: trends });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/external', async (req, res) => {
    try {
      const trends = await trendingService.getExternalTrends();
      res.json({ success: true, data: trends });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}