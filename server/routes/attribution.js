import { Router } from 'express';

export function createAttributionRouter(attributionService, attributionRepo) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ service: 'attribution', endpoints: ['GET /dashboard', 'GET /matches', 'POST /sync'] });
  });

  router.get('/dashboard', async (req, res) => {
    const { campaign_id } = req.query;
    res.json(await attributionService.getAttributionDashboard(campaign_id || null));
  });

  router.get('/matches', (req, res) => {
    const { campaign_id, limit } = req.query;
    const matches = campaign_id
      ? attributionRepo.getByCampaignId(campaign_id, { limit: Number(limit) || 50 })
      : attributionRepo.getRecent({ limit: Number(limit) || 50 });
    res.json({ matches, total: matches.length });
  });

  router.post('/sync', async (req, res) => {
    res.json(await attributionService.processNewOrders(req.body || {}));
  });

  router.post('/multi-touch', async (req, res) => {
    try {
      const { touchpoints, model } = req.body;
      if (!touchpoints?.length) return res.status(400).json({ success: false, error: 'touchpoints required' });
      const data = attributionService.calculateAttribution(touchpoints, model);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/compare-models', async (req, res) => {
    try {
      const { touchpoints } = req.body;
      if (!touchpoints?.length) return res.status(400).json({ success: false, error: 'touchpoints required' });
      const models = ['first_touch', 'last_touch', 'linear', 'time_decay', 'position_based'];
      const data = models.map(model => attributionService.calculateAttribution(touchpoints, model));
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
