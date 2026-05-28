import { Router } from 'express';

export default function createAttributionRouter(attributionService, attributionRepo) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ service: 'attribution', endpoints: ['GET /dashboard', 'GET /matches', 'POST /sync'] });
  });

  router.get('/dashboard', async (req, res) => {
    try {
      const { campaign_id } = req.query;
      if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
      const data = await attributionService.getAttributionDashboard(campaign_id);
      res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/matches', (req, res) => {
    try {
      const { campaign_id, limit } = req.query;
      const matches = campaign_id
        ? attributionRepo.getByCampaignId(campaign_id, { limit: Number(limit) || 50 })
        : attributionRepo.getRecent({ limit: Number(limit) || 50 });
      res.json({ matches, total: matches.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/sync', async (req, res) => {
    try {
      const result = await attributionService.processNewOrders(req.body || {});
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
