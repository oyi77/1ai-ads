import { Router } from 'express';

export function createAnalyticsRouter(campaignsRepo) {
  const router = Router();

  router.get('/dashboard', (req, res) => {
    const metrics = campaignsRepo.getDashboardMetrics();
    res.json({ success: true, data: metrics });
  });

  router.get('/campaigns', (req, res) => {
    const { platform } = req.query;
    const result = campaignsRepo.findAll({ platform });
    res.json({ success: true, ...result });
  });

  return router;
}
