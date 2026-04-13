import { Router } from 'express';

export function createAnalyticsRouter(campaignsRepo) {
  const router = Router();

  router.get('/dashboard', (req, res) => {
    const metrics = campaignsRepo.getDashboardMetrics();
    res.json({ success: true, data: metrics });
  });

  router.get('/by-platform', (req, res) => {
    const data = campaignsRepo.getMetricsByPlatform();
    res.json({ success: true, data });
  });

  router.get('/top-campaigns', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const data = campaignsRepo.getTopCampaigns(limit);
    res.json({ success: true, data });
  });

  router.get('/campaigns', (req, res) => {
    const { platform } = req.query;
    const result = campaignsRepo.findAll({ platform });
    res.json({ success: true, ...result });
  });

  return router;
}
