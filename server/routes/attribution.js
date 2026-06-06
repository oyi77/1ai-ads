import { Router } from 'express';

export function createAttributionRouter(attributionService, attributionRepo) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ service: 'attribution', endpoints: ['GET /dashboard', 'GET /matches', 'POST /sync'] });
  });

  router.get('/dashboard', async (req, res) => {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
    res.json(await attributionService.getAttributionDashboard(campaign_id));
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

  return router;
}
