import { Router } from 'express';
import { MetaAdsAPI } from '../services/meta/index.js';
import { BulkOperations } from '../services/bulk-operations.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';

// Build an owner-scoped BulkOperations instance for the authenticated user.
// Throws a 403-style error when the user has no bound Meta token.
async function ownerBulkOps(repos, userId) {
  // Canonical per-user Meta token resolution — rejects demo/placeholder tokens.
  const token = await resolveOwnerPlatformToken('meta', userId, repos);
  if (!token) {
    throw new Error('not authorized');
  }
  const ownerMeta = MetaAdsAPI.withToken(token);
  return new BulkOperations(ownerMeta, repos.campaignsRepo, repos.adsRepo, userId);
}

export function createBulkRouter(bulkOps, repos) {
  const router = Router();

  // Bulk create ads from template + variants
  router.post('/create-ads', async (req, res) => {
    try {
      const { accountId, template, variants } = req.body;
      if (!accountId || !template || !variants?.length) {
        return res.status(400).json({ success: false, error: 'accountId, template, and variants[] are required' });
      }
      if (!(await repos.campaignsRepo?.ownsAccount?.(accountId, req.user.id))) {
        return res.status(403).json({ success: false, error: 'not authorized' });
      }
      const ops = await ownerBulkOps(repos, req.user.id);
      const result = await ops.bulkCreateAds(accountId, { template, variants }, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const code = err.message === 'not authorized' ? 403 : 500;
      res.status(code).json({ success: false, error: err.message });
    }
  });

  // Bulk pause/resume campaigns
  router.post('/status', async (req, res) => {
    try {
      const { campaignIds, status } = req.body;
      if (!campaignIds?.length || !status) {
        return res.status(400).json({ success: false, error: 'campaignIds[] and status are required' });
      }
      const campaigns = await Promise.all(
        campaignIds.map((id) => repos.campaignsRepo?.findById?.(id, req.user.id))
      );
      if (campaigns.some((c) => !c)) {
        return res.status(403).json({ success: false, error: 'not authorized' });
      }
      const ops = await ownerBulkOps(repos, req.user.id);
      const result = await ops.bulkUpdateStatus(campaignIds, status, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const code = err.message === 'not authorized' ? 403 : 500;
      res.status(code).json({ success: false, error: err.message });
    }
  });

  // Bulk scale budgets
  router.post('/scale-budget', async (req, res) => {
    try {
      const { campaignIds, action, value } = req.body;
      if (!campaignIds?.length || !action || value === undefined) {
        return res.status(400).json({ success: false, error: 'campaignIds[], action, and value are required' });
      }
      const campaigns = await Promise.all(
        campaignIds.map((id) => repos.campaignsRepo?.findById?.(id, req.user.id))
      );
      if (campaigns.some((c) => !c)) {
        return res.status(403).json({ success: false, error: 'not authorized' });
      }
      const ops = await ownerBulkOps(repos, req.user.id);
      const result = await ops.bulkScaleBudget(campaignIds, { action, value }, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const code = err.message === 'not authorized' ? 403 : 500;
      res.status(code).json({ success: false, error: err.message });
    }
  });

  // Clone campaign to another account
  router.post('/clone', async (req, res) => {
    try {
      const { sourceCampaignId, targetAccountId, rename } = req.body;
      if (!sourceCampaignId || !targetAccountId) {
        return res.status(400).json({ success: false, error: 'sourceCampaignId and targetAccountId are required' });
      }
      if (!(await repos.campaignsRepo?.findById?.(sourceCampaignId, req.user.id))) {
        return res.status(404).json({ success: false, error: 'source campaign not found' });
      }
      if (!(await repos.campaignsRepo?.ownsAccount?.(targetAccountId, req.user.id))) {
        return res.status(403).json({ success: false, error: 'not authorized' });
      }
      const ops = await ownerBulkOps(repos, req.user.id);
      const result = await ops.cloneCampaign(sourceCampaignId, targetAccountId, { rename }, req.user.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const code = err.message === 'not authorized' ? 403 : 500;
      res.status(code).json({ success: false, error: err.message });
    }
  });

  // Get operation progress (system singleton tracking)
  router.get('/progress/:operationId', async (req, res) => {
    try {
      const op = bulkOps.getOperation(req.params.operationId);
      if (!op) {
        return res.status(404).json({ success: false, error: 'Operation not found' });
      }
      // Multi-tenant: reject cross-user progress/result disclosure.
      if (op.userId && op.userId !== req.user.id) {
        return res.status(404).json({ success: false, error: 'Operation not found' });
      }
      res.json({ success: true, data: op });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
