import { Router } from 'express';

export function createBulkRouter(bulkOps) {
  const router = Router();

  // Bulk create ads from template + variants
  router.post('/create-ads', async (req, res) => {
    try {
      const { accountId, template, variants } = req.body;
      if (!accountId || !template || !variants?.length) {
        return res.status(400).json({ success: false, error: 'accountId, template, and variants[] are required' });
      }
      const result = await bulkOps.bulkCreateAds(accountId, { template, variants });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bulk pause/resume campaigns
  router.post('/status', async (req, res) => {
    try {
      const { campaignIds, status } = req.body;
      if (!campaignIds?.length || !status) {
        return res.status(400).json({ success: false, error: 'campaignIds[] and status are required' });
      }
      const result = await bulkOps.bulkUpdateStatus(campaignIds, status);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bulk scale budgets
  router.post('/scale-budget', async (req, res) => {
    try {
      const { campaignIds, action, value } = req.body;
      if (!campaignIds?.length || !action || value === undefined) {
        return res.status(400).json({ success: false, error: 'campaignIds[], action, and value are required' });
      }
      const result = await bulkOps.bulkScaleBudget(campaignIds, { action, value });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Clone campaign to another account
  router.post('/clone', async (req, res) => {
    try {
      const { sourceCampaignId, targetAccountId, rename } = req.body;
      if (!sourceCampaignId || !targetAccountId) {
        return res.status(400).json({ success: false, error: 'sourceCampaignId and targetAccountId are required' });
      }
      const result = await bulkOps.cloneCampaign(sourceCampaignId, targetAccountId, { rename });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get operation progress
  router.get('/progress/:operationId', async (req, res) => {
    try {
      const op = bulkOps.getOperation(req.params.operationId);
      if (!op) {
        return res.status(404).json({ success: false, error: 'Operation not found' });
      }
      res.json({ success: true, data: op });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
