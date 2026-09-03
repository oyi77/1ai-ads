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
      const accounts = await platformAccountsRepo.findAllActiveByUserAndPlatform(userId, 'meta');
      if (!accounts || accounts.length === 0) return res.json({ success: true, data: [] });
      // Run fatigue detection across ALL of the user's active Meta accounts and aggregate results.
      const results = [];
      for (const acct of accounts) {
        const metaAccountId = acct.credentials?.ad_account_id || acct.ad_account_id || acct.id;
        const result = await fatigueDetector.detectFatigue(metaAccountId, { ownerId: userId });
        if (Array.isArray(result)) results.push(...result);
        else if (result) results.push(result);
      }
      res.json({ success: true, data: results });
    } catch {
      res.json({ success: true, data: [] });
    }
  });

  // Trigger manual snapshot for an account
  router.get('/snapshot/:accountId', async (req, res) => {
    try {
      if (!platformAccountsRepo) return res.json({ success: true, data: [] });
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const acct = platformAccountsRepo.findById(req.params.accountId);
      if (!acct || acct.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const result = await fatigueDetector.snapshotCreatives(req.params.accountId, { ownerId: userId });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Run fatigue detection for an account
  router.get('/detect/:accountId', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const acct = platformAccountsRepo.findById(req.params.accountId);
      if (!acct || acct.user_id !== userId) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
      }
      const { lookbackDays, frequencyThreshold, ctrDropPercent } = req.query;
      const result = await fatigueDetector.detectFatigue(req.params.accountId, {
        ownerId: userId,
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
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const result = await fatigueDetector.getHistory(req.params.adId, { ownerId: userId });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
