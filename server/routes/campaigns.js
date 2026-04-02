import { Router } from 'express';

export function createCampaignsRouter(orchestrator, metaApi, creativeStudio, campaignsRepo) {
  const router = Router();

  // Create full campaign (AI creative → campaign → adset → creative → ad)
  router.post('/create', async (req, res) => {
    const { accountId, pageId, product, target, keunggulan, objective, targeting, dailyBudget, landingUrl } = req.body;

    if (!accountId || !product || !dailyBudget) {
      return res.status(400).json({ success: false, error: 'accountId, product, and dailyBudget are required' });
    }

    try {
      const result = await orchestrator.createFullCampaign({
        accountId, pageId, product, target, keunggulan,
        objective: objective || 'OUTCOME_TRAFFIC',
        targeting, dailyBudget: parseFloat(dailyBudget),
        landingUrl,
      });

      // Save to local DB
      if (result.campaignId) {
        campaignsRepo.upsert({
          platform: 'meta',
          campaign_id: result.campaignId,
          name: `${product} - ${objective || 'TRAFFIC'}`,
          status: 'paused',
          budget: parseFloat(dailyBudget),
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
        });
      }

      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Activate a paused campaign
  router.post('/:id/activate', async (req, res) => {
    try {
      await orchestrator.activateCampaign(req.params.id);
      res.json({ success: true, data: { id: req.params.id, status: 'ACTIVE' } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Pause a running campaign
  router.post('/:id/pause', async (req, res) => {
    try {
      await orchestrator.pauseCampaign(req.params.id);
      res.json({ success: true, data: { id: req.params.id, status: 'PAUSED' } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update campaign budget
  router.put('/:id/budget', async (req, res) => {
    const { dailyBudget } = req.body;
    if (!dailyBudget) return res.status(400).json({ success: false, error: 'dailyBudget is required' });

    try {
      await orchestrator.scaleBudget(req.params.id, parseFloat(dailyBudget));
      res.json({ success: true, data: { id: req.params.id, dailyBudget: parseFloat(dailyBudget) } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get campaign detail with insights
  router.get('/:id', async (req, res) => {
    try {
      const insights = await metaApi.getCampaignInsights(req.params.id);
      res.json({ success: true, data: { id: req.params.id, insights } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Generate AI creative package (without creating campaign)
  router.post('/creative', async (req, res) => {
    const { product, target, keunggulan, platform, format } = req.body;
    if (!product) return res.status(400).json({ success: false, error: 'product is required' });

    try {
      const result = await creativeStudio.generateAdPackage(
        product, target || '', keunggulan || '', platform || 'meta', format || 'single_image'
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Search targeting interests
  router.get('/targeting/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, error: 'q is required' });

    try {
      const options = await metaApi.getTargetingOptions(q);
      res.json({ success: true, data: options });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // List Facebook pages (needed for ad creative)
  router.get('/pages', async (req, res) => {
    try {
      const pages = await metaApi.getPages();
      res.json({ success: true, data: pages });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
