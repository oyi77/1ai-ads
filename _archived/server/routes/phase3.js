import { Router } from 'express';

// ── Image Generation Router ──────────────────────────────────

export function createImageGenRouter(imageGenerator) {
  const router = Router();

  router.post('/generate', async (req, res) => {
    try {
      const { product, style, platform, dimensions } = req.body;
      if (!product) {
        return res.status(400).json({ success: false, error: 'product is required' });
      }
      const result = await imageGenerator.generateAdImage({ product, style, platform, dimensions });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/variants', async (req, res) => {
    try {
      const { product, count, styles, platform } = req.body;
      if (!product) {
        return res.status(400).json({ success: false, error: 'product is required' });
      }
      const result = await imageGenerator.generateVariants({ product, count, styles, platform });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

// ── Audience Intelligence Router ─────────────────────────────

export function createAudienceIntelligenceRouter(audienceIntel) {
  const router = Router();

  router.get('/insights', async (req, res) => {
    try {
      const interests = req.query.interests
        ? req.query.interests.split(',').map(s => s.trim())
        : req.body.interests;
      const { country } = req.query;
      if (!interests?.length) {
        return res.status(400).json({ success: false, error: 'interests parameter is required' });
      }
      const result = await audienceIntel.getAudienceInsights(interests, { country });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/lookalike', async (req, res) => {
    try {
      const { accountId, sourceAudienceId, country, ratio } = req.body;
      if (!accountId || !sourceAudienceId) {
        return res.status(400).json({ success: false, error: 'accountId and sourceAudienceId are required' });
      }
      const result = await audienceIntel.buildLookalikeAudience(accountId, { sourceAudienceId, country, ratio });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/overlap', async (req, res) => {
    try {
      const { accountId, adsetIds } = req.body;
      if (!accountId || !adsetIds?.length) {
        return res.status(400).json({ success: false, error: 'accountId and adsetIds[] are required' });
      }
      const result = await audienceIntel.detectOverlap(accountId, adsetIds);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/suggest', async (req, res) => {
    try {
      const { product, target, existingInterests } = req.body;
      if (!product) {
        return res.status(400).json({ success: false, error: 'product is required' });
      }
      const result = await audienceIntel.suggestInterests(product, target, { existingInterests });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

// ── Creative Scorer Router ───────────────────────────────────

export function createCreativeScorerRouter(creativeScorer) {
  const router = Router();

  router.post('/score', async (req, res) => {
    try {
      const { hook, body, cta, imageUrl, platform } = req.body;
      const result = await creativeScorer.scoreCreative({ hook, body, cta, imageUrl, platform });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/score-history', async (req, res) => {
    try {
      const { product, platform, hookStyle } = req.body;
      const result = await creativeScorer.scoreByHistory({ product, platform, hookStyle });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/train', async (req, res) => {
    try {
      const { epochs, learningRate } = req.body;
      const result = await creativeScorer.trainFromHistory({ epochs, learningRate });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
