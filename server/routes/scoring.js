import { Router } from 'express';

export function createScoringRouter(creativeScorer) {
  const router = Router();

  router.post('/score', async (req, res) => {
    try {
      const { hook, body, cta, imageUrl, platform } = req.body;
      const data = await creativeScorer.scoreCreative({ hook, body, cta, imageUrl, platform });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/history', async (req, res) => {
    try {
      const { product, platform, hookStyle } = req.body;
      const data = await creativeScorer.scoreByHistory({ product, platform, hookStyle });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
