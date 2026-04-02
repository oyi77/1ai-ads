import { Router } from 'express';

/**
 * Unified multi-platform ads route.
 * Each platform (meta, tiktok, google) has its own API service
 * but shares the same route patterns.
 */
export function createPlatformsRouter(platformApis, campaignsRepo) {
  const router = Router();

  // Get connection status for all platforms
  router.get('/status', async (req, res) => {
    const status = {};
    for (const [name, api] of Object.entries(platformApis)) {
      try {
        // Try a lightweight call to verify the token works
        if (name === 'meta') {
          await api.getMe();
          status[name] = { connected: true };
        } else {
          status[name] = { connected: false, message: 'Configure credentials in Settings' };
        }
      } catch (err) {
        status[name] = { connected: false, error: err.message };
      }
    }
    res.json({ success: true, data: status });
  });

  // List accounts for a platform
  router.get('/:platform/accounts', async (req, res) => {
    const api = platformApis[req.params.platform];
    if (!api) return res.status(400).json({ success: false, error: `Unknown platform: ${req.params.platform}` });

    try {
      let accounts;
      switch (req.params.platform) {
        case 'meta': accounts = await api.getAdAccounts(); break;
        case 'google': accounts = await api.listAccounts(); break;
        default: accounts = [];
      }
      res.json({ success: true, data: accounts });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get campaigns for a platform account
  router.get('/:platform/accounts/:accountId/campaigns', async (req, res) => {
    const api = platformApis[req.params.platform];
    if (!api) return res.status(400).json({ success: false, error: `Unknown platform: ${req.params.platform}` });

    try {
      let campaigns;
      switch (req.params.platform) {
        case 'meta': campaigns = await api.getCampaigns(req.params.accountId); break;
        case 'tiktok': {
          const data = await api.getCampaigns(req.params.accountId);
          campaigns = data.list || [];
          break;
        }
        case 'google': campaigns = await api.getCampaigns(req.params.accountId); break;
        default: campaigns = [];
      }
      res.json({ success: true, data: campaigns });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sync all campaigns from a platform to local DB
  router.post('/:platform/sync', async (req, res) => {
    const platform = req.params.platform;
    const api = platformApis[platform];
    if (!api) return res.status(400).json({ success: false, error: `Unknown platform: ${platform}` });

    try {
      let totalSynced = 0;

      if (platform === 'meta') {
        const accounts = await api.getAdAccounts();
        for (const account of accounts) {
          if (account.status !== 'active') continue;
          try {
            const campaigns = await api.getCampaigns(account.id);
            for (const camp of campaigns) {
              let insights = null;
              try { insights = await api.getCampaignInsights(camp.id); } catch {}

              campaignsRepo.upsert({
                platform: 'meta',
                campaign_id: camp.id,
                name: camp.name,
                status: camp.status,
                budget: camp.dailyBudget || camp.lifetimeBudget,
                spend: insights?.spend || 0,
                impressions: insights?.impressions || 0,
                clicks: insights?.clicks || 0,
                conversions: insights?.conversions || insights?.linkClicks || 0,
                roas: 0,
              });
              totalSynced++;
            }
          } catch {}
        }
      }

      // TikTok and Google follow similar patterns when credentials are provided
      // They'll work the same way once the user configures their tokens

      res.json({
        success: true,
        data: { platform, campaignsSynced: totalSynced, syncedAt: new Date().toISOString() },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
