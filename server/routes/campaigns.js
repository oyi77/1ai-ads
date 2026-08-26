import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { MetaAdsAPI } from '../services/meta/index.js';
import { ValidationError } from '../lib/errors.js';

const log = createLogger('campaigns-route');

export function createCampaignsRouter(orchestrator, metaApi, creativeStudio, campaignsRepo, adsRepo, adsetsRepo, draftsRepo, platformAccountsRepo) {
  const router = Router();

  // Resolve the Meta API for the requesting user: their own bound token when
  // present. Unbound users get a clear 400 — never the operator system token.
  function resolveUserMetaApi(req) {
    const userId = req.user?.id;
    if (userId && platformAccountsRepo) {
      try {
        const acct = platformAccountsRepo.getByPlatform(userId, 'meta');
        if (acct && acct.access_token) {
          return MetaAdsAPI.withToken(acct.access_token);
        }
      } catch (err) {
        log.error('resolveUserMetaApi failed', { userId, error: err.message });
      }
    }
    throw new ValidationError('Meta account is not connected. Connect your Meta account in Settings before using campaign features.');
  }

  // Create full campaign (AI creative → campaign → adset → creative → ad)
  router.post('/create', async (req, res) => {
    const { accountId, pageId, product, target, keunggulan, objective, targeting, dailyBudget, landingUrl } = req.body;

    if (!accountId || !product || !dailyBudget) {
      return res.status(400).json({ success: false, error: 'accountId, product, and dailyBudget are required' });
    }

    try {
      const result = await orchestrator.createFullCampaign({
        accountId, pageId, product, target, keunggulan,
        objective: objective || 'OUTCOME_TRAFFIC',
        targeting, dailyBudget: parseFloat(dailyBudget),
        landingUrl,
      }, resolveUserMetaApi(req));

      // Save to local DB
      if (result.campaignId) {
        campaignsRepo.upsert({
          platform: 'meta',
          campaign_id: result.campaignId,
          name: `${product} - ${objective || 'TRAFFIC'}`,
          status: 'paused',
          budget: parseFloat(dailyBudget),
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
        });
      }

      res.json({ success: true, data: result });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Activate a paused campaign
  router.post('/:id/activate', async (req, res) => {
    try {
      const campaignId = req.params.id;
      const approvedDrafts = draftsRepo.findAll({ campaignId, status: 'approved', limit: 1 });
      if (!approvedDrafts || approvedDrafts.total === 0) {
        return res.status(403).json({ success: false, error: 'Campaign requires an approved activation request. Submit for approval first.' });
      }
      await orchestrator.activateCampaign(campaignId, resolveUserMetaApi(req));
      res.json({ success: true, data: { id: campaignId, status: 'ACTIVE' } });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Submit campaign for approval before activation
  router.post('/:id/submit-for-approval', async (req, res) => {
    try {
      const campaignId = req.params.id;
      const userId = req.user?.id || 'system';
      const campaign = campaignsRepo.findById(campaignId, userId);
      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

      const draft = draftsRepo.create({
        type: 'campaign_activation',
        summary: `Activate campaign "${campaign.name}" (${campaignId})`,
        proposedBy: userId,
        campaignId,
      });
      res.status(201).json({ success: true, data: draft });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Pause a running campaign
  router.post('/:id/pause', async (req, res) => {
    try {
      await orchestrator.pauseCampaign(req.params.id, resolveUserMetaApi(req));
      res.json({ success: true, data: { id: req.params.id, status: 'PAUSED' } });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Update campaign budget
  router.put('/:id/budget', async (req, res) => {
    try {
      const { dailyBudget } = req.body;
      if (!dailyBudget) return res.status(400).json({ success: false, error: 'dailyBudget is required' });
      await orchestrator.scaleBudget(req.params.id, parseFloat(dailyBudget), resolveUserMetaApi(req));
      res.json({ success: true, data: { id: req.params.id, dailyBudget } });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });
  // PATCH /ads/:id/status — pause/resume a single ad (ad-level control)
  router.patch('/ads/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      if (!['ACTIVE', 'PAUSED'].includes(status)) {
        return res.status(400).json({ success: false, error: "status must be ACTIVE or PAUSED" });
      }
      await resolveUserMetaApi(req).updateAd(req.params.id, { status });
      res.json({ success: true, data: { id: req.params.id, status } });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // POST /:id/duplicate — deep-copy a campaign as PAUSED (zero-Ads-Manager scaling)
  router.post('/:id/duplicate', async (req, res) => {
    try {
      let accountId = String(req.query.accountId || req.body?.accountId || '');
      const api = resolveUserMetaApi(req);
      // Auto-locate owning account: match against each account's own campaign
      // list (read-only, always permitted) — direct GET /{campaign} returns
      // permission error #10 for BM-owned ads.
      if (!accountId) {
        const accounts = await api.getAdAccounts();
        const target = String(req.params.id);
        for (const acc of accounts.slice(0, 12)) {
          try {
            const list = await api._get(`/${acc.id}/campaigns`, { fields: 'id', limit: '1000' });
            if ((list.data || []).some(c => c.id === target)) { accountId = acc.id; break; }
          } catch { /* skip account */ }
        }
      }
      const suffix = (req.body && req.body.suffix) || ' (Copy)';
      const result = await api.duplicateCampaign(accountId, req.params.id, { suffix });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });


  // Search targeting interests — must be before GET /:id to avoid route shadowing
  router.get('/targeting/search', async (req, res) => {
    try {
      const { q, type } = req.query;
      if (!q) return res.status(400).json({ success: false, error: 'q (query) is required' });
      const results = await resolveUserMetaApi(req).getTargetingOptions(q, type);
      res.json({ success: true, data: results });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // List Facebook pages — must be before GET /:id to avoid route shadowing
  router.get('/pages', async (req, res) => {
    try {
      const pages = await resolveUserMetaApi(req).getPages();
      res.json({ success: true, data: pages });
    } catch (err) {
      if (err.message.includes('nonexisting field') || err.message.includes('permission')) {
        res.json({ success: true, data: [] });
      } else {
        res.status(err.status || 500).json({ success: false, error: err.message });
      }
    }
  });

  // GET /performance — ad-level creative performance across owned accounts.
  // ONE batched account-level call per account (level=ad) instead of
  // per-ad fan-out — hundreds of sequential Meta calls would time out.
  router.get('/performance', async (req, res) => {
    try {
      const api = resolveUserMetaApi(req);
      const accounts = await api.getAdAccounts();
      const maxAccounts = Math.min(parseInt(req.query.accounts, 10) || 6, 12);
      const results = [];
      const errors = [];

      await Promise.allSettled(accounts.slice(0, maxAccounts).map(async (account) => {
        try {
          const [adsRes, insRes] = await Promise.all([
            api._get(`/${account.id}/ads`, { fields: 'id,name,status', limit: '50' }).catch(() => ({ data: [] })),
            api._get(`/${account.id}/insights`, {
              level: 'ad',
              // ad_id must be explicit at level=ad or rows come back anonymous
              fields: 'ad_id,spend,impressions,clicks,ctr,cpc,actions,action_values',
              date_preset: String(req.query.preset || 'last_30d'),
              limit: '100',
            }).catch(() => ({ data: [] })),
          ]);
          const names = new Map((adsRes.data || []).map(a => [a.id, { name: a.name, status: (a.status || '').toLowerCase() }]));
          for (const row of (insRes.data || [])) {
            const metaInfo = names.get(row.ad_id) || {};
            const spend = parseFloat(row.spend || 0);
            const actions = {};
            for (const a of (row.actions || [])) actions[a.action_type] = parseInt(a.value);
            const values = {};
            for (const v of (row.action_values || [])) values[v.action_type] = parseFloat(v.value);
            const revenue = values.purchase || 0;
            results.push({
              id: row.ad_id,
              name: metaInfo.name || `Ad ${row.ad_id ?? 'unknown'}`,
              accountId: account.id,
              accountName: account.name,
              status: metaInfo.status || 'unknown',
              spend,
              revenue,
              roas: spend > 0 ? revenue / spend : null,
              ctr: parseFloat(row.ctr || 0),
              cpc: parseFloat(row.cpc || 0),
              linkClicks: actions.link_click || 0,
              purchases: actions.purchase || 0,
            });
          }
        } catch (err) {
          errors.push({ accountId: account.id, error: err.message });
        }
      }));

      results.sort((a, b) => b.spend - a.spend);
      res.json({ success: true, data: results, total: results.length, ...(errors.length ? { warnings: errors } : {}) });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // GET /accounts — list Meta ad accounts
  router.get('/accounts', async (req, res) => {
    try {
      const api = resolveUserMetaApi(req);
      let accounts;
      try {
        accounts = await api.getAdAccounts();
        // Token proven to work — record health so the UI can show token state.
        try { platformAccountsRepo.updateHealthByPlatform(req.user?.id, 'meta', 'ok', null); } catch { /* non-fatal */ }
      } catch (err) {
        const expired = /190|session has expired/i.test(`${err?.message}${err?.error?.message || ''}`);
        try { platformAccountsRepo.updateHealthByPlatform(req.user?.id, 'meta', 'invalid_token', err.message?.slice(0, 200)); } catch { /* non-fatal */ }
        throw expired ? Object.assign(new Error('Meta token expired or invalid. Reconnect in Settings.'), { status: 400 }) : err;
      }
      res.json({ success: true, data: accounts });
    } catch (err) {
      log.error('Failed to get ad accounts', { error: err.message });
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // POST /sync — sync campaigns, adsets, ads from Meta to local DB
  router.post('/sync', async (req, res) => {
    try {
      const api = resolveUserMetaApi(req);
      const { accountId } = req.body;
      log.info('Starting Meta sync', { accountId });

      // Get ad accounts
      let accounts;
      try {
        accounts = await api.getAdAccounts();
      } catch (err) {
        return res.status(err.status || 500).json({ success: false, error: `Failed to get ad accounts: ${err.message}` });
      }

      if (!accounts || accounts.length === 0) {
        return res.json({ success: true, data: { campaigns: 0, adsets: 0, ads: 0, message: 'No ad accounts found' } });
      }

      // Filter to specific account if provided
      if (accountId) {
        accounts = accounts.filter(a => a.id === accountId || a.id.endsWith(accountId));
      }

      let totalCampaigns = 0;
      let totalAdsets = 0;
      let totalAds = 0;

      for (const account of accounts) {
        log.info('Syncing account', { accountId: account.id, name: account.name });

        // Fetch campaigns
        let campaigns = [];
        try {
          campaigns = await api.getCampaigns(account.id);
        } catch (err) {
          log.error('Failed to get campaigns', { accountId: account.id, error: err.message });
        }

        // Fetch insights for all campaigns
        let insightsMap = {};
        if (campaigns.length > 0) {
          try {
            const campaignIds = campaigns.map(c => c.id);
            insightsMap = await api.getMultiCampaignInsights(campaignIds, { accountId: account.id });
          } catch (err) {
            log.error('Failed to get campaign insights', { error: err.message });
          }
        }

        // Store campaigns in DB
        for (const c of campaigns) {
          const insights = insightsMap[c.id] || {};
          const spendVal = parseFloat(insights.spend || 0);
          const revenueVal = parseFloat(insights.revenue || 0);
          const roasVal = spendVal > 0 ? revenueVal / spendVal : 0;
          campaignsRepo.upsert({
            platform: 'meta',
            campaign_id: c.id,
            name: c.name,
            status: c.status,
            budget: c.dailyBudget || c.lifetimeBudget || 0,
            spend: spendVal,
            revenue: revenueVal,
            impressions: parseInt(insights.impressions || 0),
            clicks: parseInt(insights.clicks || 0),
            conversions: parseInt(insights.conversions || 0),
            roas: Math.round(roasVal * 100) / 100,
          });
          totalCampaigns++;
        }

        // Fetch ad sets
        let adsets = [];
        try {
          const adsetData = await api._get(`/${account.id}/adsets`, {
            fields: 'id,name,status,campaign_id,daily_budget,lifetime_budget,targeting,billing_event,optimization_goal',
            limit: '50',
          });
          adsets = adsetData.data || [];
          totalAdsets += adsets.length;

          // Store adsets in local DB
          for (const as of adsets) {
            try {
              const existing = adsetsRepo?.findById?.(as.id);
              const targetingFlat = as.targeting ? JSON.stringify(as.targeting) : '{}';
              if (existing) {
                adsetsRepo?.update?.(as.id, {
                  name: as.name, status: as.status,
                  targeting: targetingFlat,
                });
              } else {
                adsetsRepo?.create?.({
                  id: as.id, campaignId: as.campaign_id,
                  name: as.name, status: as.status,
                  dailyBudget: as.daily_budget || 0,
                  targeting: targetingFlat,
                  optimizationGoal: as.optimization_goal,
                  billingEvent: as.billing_event,
                });
              }
            } catch { /* skip individual adset errors */ }
          }
        } catch (err) {
          log.error('Failed to get adsets', { accountId: account.id, error: err.message });
        }

        // Fetch ads and store in DB
        let ads = [];
        try {
          ads = await api.getAds(account.id);
          for (const ad of ads) {
            try {
              const existing = adsRepo?.findById?.(ad.id);
              if (existing) {
                adsRepo?.update?.(ad.id, { name: ad.name, status: ad.status });
              } else {
                adsRepo?.create?.({
                  id: ad.id, name: ad.name, product: ad.creative?.title || '',
                  target: ad.creative?.body || '', platform: 'meta',
                  format: 'single_image', status: ad.status,
                });
              }
            } catch { /* skip individual ad errors */ }
          }
          totalAds += ads.length;
        } catch (err) {
          log.error('Failed to get ads', { accountId: account.id, error: err.message });
        }
      }

      log.info('Meta sync complete', { campaigns: totalCampaigns, adsets: totalAdsets, ads: totalAds });
      res.json({
        success: true,
        data: {
          campaigns: totalCampaigns,
          adsets: totalAdsets,
          ads: totalAds,
          accounts: accounts.map(a => ({ id: a.id, name: a.name })),
        },
      });
    } catch (err) {
      log.error('Sync failed', { error: err.message });
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // List all campaigns
  router.get('/', async (req, res) => {
    try {
      const userId = req.user?.id || 'system';
      const result = campaignsRepo.findAll({ userId });
      res.json({ success: true, data: result.data, total: result.total });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });

  // Generate AI creative package (without creating campaign)
  router.post('/creative', async (req, res) => {
    const { product, target, keunggulan, platform, format } = req.body;
    if (!product) return res.status(400).json({ success: false, error: 'product is required' });

    try {
      const result = await creativeStudio.generateAdPackage(
        product, target || '', keunggulan || '', platform || 'meta', format || 'single_image'
      );
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // GET /api/campaigns/list - Simple campaign list for external dashboard
  router.get('/list', async (_req, res) => {
    try {
      const result = campaignsRepo.findAll();
      res.json({ success: true, data: result.data, total: result.total });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });
  // GET /sync/ads — get ads from Meta (live, not stored) — must be before GET /:id to avoid route shadowing
  router.get('/sync/ads', async (req, res) => {
    try {
      const api = resolveUserMetaApi(req);
      const accounts = await api.getAdAccounts();
      if (!accounts || accounts.length === 0) {
        return res.json({ success: true, data: [], total: 0, page: 1, limit: 20 });
      }

      const allAds = [];
      for (const account of accounts.slice(0, 3)) {
        try {
          const ads = await api.getAds(account.id, { limit: 50 });
          for (const ad of ads) {
            allAds.push({
              id: ad.id,
              name: ad.name,
              status: ad.status,
              campaign_id: '',
              adset_id: '',
              creative: ad.creative || {},
              insights: { impressions: 0, clicks: 0, spend: 0, ctr: 0, cpc: 0 },
              created_at: new Date().toISOString(),
            });
          }
        } catch (err) {
          log.error('Failed to get ads for account', { accountId: account.id, error: err.message });
        }
      }

      res.json({ success: true, data: allAds, total: allAds.length, page: 1, limit: 20 });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });

  // Get campaign detail with insights
  router.get('/:id', async (req, res) => {
    try {
      const insights = await resolveUserMetaApi(req).getCampaignInsights(req.params.id);
      res.json({ success: true, data: { id: req.params.id, insights } });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });



  return router;
}
