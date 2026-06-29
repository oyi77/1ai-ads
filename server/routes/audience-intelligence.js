import { Router } from 'express';

export function createAudienceIntelligenceRouter(audienceIntelligence) {
  const router = Router();

  router.get('/insights', async (req, res) => {
    try {
      const interests = req.query.interests ? req.query.interests.split(',') : [];
      if (!interests.length) return res.json({ success: true, data: [] });
      const data = await audienceIntelligence.getAudienceInsights(interests, { country: req.query.country });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/lookalike', async (req, res) => {
    try {
      const { accountId, sourceAudienceId, country, ratio } = req.body;
      if (!accountId || !sourceAudienceId) return res.status(400).json({ success: false, error: 'accountId and sourceAudienceId required' });
      const data = await audienceIntelligence.buildLookalikeAudience(accountId, { sourceAudienceId, country, ratio });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/overlap', async (req, res) => {
    try {
      const adsetIds = req.query.adsetIds ? req.query.adsetIds.split(',') : [];
      if (adsetIds.length < 2) return res.status(400).json({ success: false, error: 'At least 2 adsetIds required' });
      const data = await audienceIntelligence.detectOverlap(req.query.accountId, adsetIds);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/suggest', async (req, res) => {
    try {
      const data = await audienceIntelligence.suggestInterests(req.query.product, req.query.target, {
        existingInterests: req.query.existing ? req.query.existing.split(',') : [],
      });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
