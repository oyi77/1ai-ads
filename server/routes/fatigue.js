import { Router } from 'express';

export function createFatigueRouter(fatigueDetector, platformAccountsRepo) {
  const router = Router();

  // Default handler — runs fatigue detection on the requesting user's first active Meta account
  router.get('/', async (req, res) => {
    try {
      if (!platformAccountsRepo) return res.json({ success: true, data: [] });
      const userId = req.user?.id;
      if (!userId) return res.json({ success: true, data: [] });
      // Scope to the requesting user (multi-tenant). Fatigue detector is Meta-centric.
      const active = platformAccountsRepo.getByPlatform(userId, 'meta');
      if (!active) return res.json({ success: true, data: [] });
      const result = await fatigueDetector.detectFatigue(active.id);
      res.json({ success: true, data: result });
    } catch {
      res.json({ success: true, data: [] });
    }
  });

  // Trigger manual snapshot for an account
  router.get('/snapshot/:accountId', async (req, res) => {
    try {
      const result = await fatigueDetector.snapshotCreatives(req.params.accountId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Run fatigue detection for an account
  router.get('/detect/:accountId', async (req, res) => {
    try {
      const { lookbackDays, frequencyThreshold, ctrDropPercent } = req.query;
      const result = await fatigueDetector.detectFatigue(req.params.accountId, {
        lookbackDays: lookbackDays ? parseInt(lookbackDays, 10) : undefined,
        frequencyThreshold: frequencyThreshold ? parseFloat(frequencyThreshold) : undefined,
        ctrDropPercent: ctrDropPercent ? parseFloat(ctrDropPercent) : undefined,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get creative performance history for a specific ad
  router.get('/history/:adId', async (req, res) => {
    try {
      const result = await fatigueDetector.getHistory?.(req.params.adId)
        ?? { message: 'History endpoint requires fatigue detector with getHistory method' };
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
