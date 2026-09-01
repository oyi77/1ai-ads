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
      // Snapshots store campaign_id = the Meta ad_account_id (act_xxx), NOT the
      // internal platform_accounts UUID — pass the real account id so
      // findByAccountId matches stored rows.
      const metaAccountId = active.credentials?.ad_account_id || active.ad_account_id || active.id;
      const result = await fatigueDetector.detectFatigue(metaAccountId, { ownerId: userId });
      res.json({ success: true, data: result });
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
