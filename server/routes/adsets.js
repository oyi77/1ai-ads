import { Router } from 'express';

export function createAdsetsRouter(adsetsRepo) {
  const router = Router();

  // List ad sets
  router.get('/', async (req, res) => {
    try {
      const { campaignId: cid, status, page = 1, limit = 50 } = req.query;
      const result = adsetsRepo.findAll({ campaignId: cid, status, userId: req.user?.id, page: +page, limit: +limit });
      res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get single ad set
  router.get('/:id', async (req, res) => {
    try {
      const adset = adsetsRepo.findById(req.params.id, req.user?.id);
      if (!adset) return res.status(404).json({ success: false, error: 'Ad set not found' });
      res.json({ success: true, data: adset });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create ad set
  router.post('/', async (req, res) => {
    try {
      const { campaignId, name, status, dailyBudget, targeting, optimizationGoal, billingEvent } = req.body;
      if (!campaignId || !name) return res.status(400).json({ success: false, error: 'campaignId and name are required' });
      const adset = adsetsRepo.create({
        campaignId, name, status, dailyBudget,
        targeting: targeting || {},
        optimizationGoal, billingEvent,
        userId: req.user?.id,
      }, req.user?.id);
      res.status(201).json({ success: true, data: adset });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update ad set
  router.put('/:id', async (req, res) => {
    try {
      const adset = adsetsRepo.update(req.params.id, req.body, req.user?.id);
      if (!adset) return res.status(404).json({ success: false, error: 'Ad set not found' });
      res.json({ success: true, data: adset });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete ad set
  router.delete('/:id', async (req, res) => {
    try {
      const ok = adsetsRepo.remove(req.params.id, req.user?.id);
      if (!ok) return res.status(404).json({ success: false, error: 'Ad set not found' });
      res.json({ success: true, data: { id: req.params.id, deleted: true } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
