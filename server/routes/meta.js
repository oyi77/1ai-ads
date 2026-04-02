import { Router } from 'express';

export function createMetaRouter(metaApi, campaignsRepo) {
  const router = Router();

  // List all ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const accounts = await metaApi.getAdAccounts();
      res.json({ success: true, data: accounts });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get campaigns for an account
  router.get('/accounts/:accountId/campaigns', async (req, res) => {
    try {
      const campaigns = await metaApi.getCampaigns(req.params.accountId);
      res.json({ success: true, data: campaigns });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get insights for an account
  router.get('/accounts/:accountId/insights', async (req, res) => {
    try {
      const insights = await metaApi.getAccountInsights(req.params.accountId, {
        datePreset: req.query.date_preset || 'last_30d',
      });
      res.json({ success: true, data: insights });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get ads for an account (with creatives)
  router.get('/accounts/:accountId/ads', async (req, res) => {
    try {
      const ads = await metaApi.getAds(req.params.accountId);
      res.json({ success: true, data: ads });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sync all accounts + campaigns + insights to local DB
  router.post('/sync', async (req, res) => {
    try {
      const results = await metaApi.syncAllAccounts();
      let totalSynced = 0;

      for (const result of results) {
        if (!result.campaigns) continue;

        for (const camp of result.campaigns) {
          // Get per-campaign insights
          let campInsights = null;
          try {
            campInsights = await metaApi.getCampaignInsights(camp.id);
          } catch {}

          campaignsRepo.upsert({
            platform: 'meta',
            campaign_id: camp.id,
            name: camp.name,
            status: camp.status,
            budget: camp.dailyBudget || camp.lifetimeBudget,
            spend: campInsights?.spend || 0,
            revenue: 0,
            impressions: campInsights?.impressions || 0,
            clicks: campInsights?.clicks || 0,
            conversions: campInsights?.conversions || campInsights?.linkClicks || 0,
            roas: 0,
          });
          totalSynced++;
        }
      }

      res.json({
        success: true,
        data: {
          accounts: results.length,
          campaignsSynced: totalSynced,
          syncedAt: new Date().toISOString(),
          details: results.map(r => ({
            account: r.account.name,
            campaigns: r.campaigns?.length || 0,
            error: r.error || null,
          })),
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Search competitor pages
  router.get('/search-pages', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, error: 'q is required' });
    try {
      const pages = await metaApi.searchPages(q);
      res.json({ success: true, data: pages });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Spy on competitor page ads
  router.get('/page-ads/:pageId', async (req, res) => {
    try {
      const result = await metaApi.getPageAds(req.params.pageId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
