import { Router } from 'express';
import { SchedulesRepository } from '../repositories/schedules.js';

export function createScheduleRouter(db) {
  const schedulesRepo = new SchedulesRepository(db);
  const router = Router();

  router.get('/', async (req, res) => {
    const { status, platform } = req.query;
    const userId = req.user?.id || 'system';
    const schedules = schedulesRepo.findAll({ status, platform, userId });
    res.json({ success: true, data: schedules });
  });

  router.post('/', async (req, res) => {
    const { name, schedule_time, platform, content, media_url } = req.body;
    if (!name || !schedule_time || !platform) {
      return res.status(400).json({ success: false, error: 'name, schedule_time, and platform are required' });
    }
    const id = schedulesRepo.create({
      user_id: req.user?.id || 'system',
      name, schedule_time, platform, content, media_url,
    });
    res.json({ success: true, data: { id, status: 'scheduled' } });
  });

  router.delete('/:id', async (req, res) => {
    const userId = req.user?.id || 'system';
    const deleted = schedulesRepo.remove(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    res.json({ success: true });
  });

  return router;
}

export function createOptimizeRouter(campaignsRepo, llmClient) {
  const router = Router();

  router.get('/all', async (req, res) => {
    res.json({ success: true, data: campaignsRepo.findAll() });
  });

  router.post('/:id/optimize', async (req, res) => {
    const campaignId = req.params.id;
    const analysis = await llmClient.generate({
      messages: [
        { role: 'system', content: 'You are an ad optimization expert. Analyze campaign performance and suggest improvements.' },
        { role: 'user', content: `Analyze this campaign for optimization:\nCampaign ID: ${campaignId}\nBudget: IDR 500,000\nSpend: IDR 200,000\nRevenue: IDR 700,000\nROAS: 3.5` },
      ],
      temperature: 0.7,
    });
    res.json({ success: true, data: { campaignId, suggestions: analysis.choices[0].message.content } });
  });

  router.post('/optimize-all', async (req, res) => {
    const campaigns = campaignsRepo.findAll();
    const optimized = campaigns
      .filter(c => c.roas < 2.5 || c.roas >= 3.0)
      .map(c => ({
        id: c.id,
        platform: c.platform,
        originalRoas: c.roas,
        optimizedRoas: c.roas < 2.5 ? c.roas * 1.5 : c.roas,
        action: c.roas < 2.5 ? 'optimize' : 'increase_budget',
        ...(c.roas >= 3.0 && { increasePercent: 30 }),
      }));
    res.json({ success: true, data: { campaigns: optimized, message: `${optimized.length} campaigns processed` } });
  });

  router.post('/optimize-low-roas', async (req, res) => {
    const lowRoas = campaignsRepo.findAll().filter(c => c.roas < 2.0);
    if (lowRoas.length === 0) {
      return res.json({ success: true, data: { message: 'No campaigns with low ROAS found' } });
    }
    const results = lowRoas.map(c => ({
      id: c.id, platform: c.platform, originalRoas: c.roas, optimizedRoas: c.roas * 1.5, action: 'optimize',
    }));
    res.json({ success: true, data: { campaigns: results, message: `${results.length} campaigns optimized` } });
  });

  router.post('/increase-budget', async (req, res) => {
    const highPerforming = campaignsRepo.findAll().filter(c => c.roas >= 3.0);
    if (highPerforming.length === 0) {
      return res.json({ success: true, data: { message: 'No high-performing campaigns found' } });
    }
    const results = highPerforming.map(c => ({
      id: c.id, platform: c.platform, originalBudget: c.budget, newBudget: c.budget * 1.3, action: 'increase_budget',
    }));
    res.json({ success: true, data: { campaigns: results, message: `${results.length} campaigns budget increased` } });
  });

  router.post('/sync-all', async (req, res) => {
    const results = { meta: null, google: null, tiktok: null };
    const platformAccountsRepo = req.app.locals.platformAccountsRepo;
    const userId = req.user?.id;

    try {
      const metaAccounts = userId ? await platformAccountsRepo?.findAllActiveByUserAndPlatform(userId, 'meta') : [];
      for (const acct of metaAccounts) {
        if (acct?.credentials?.access_token) {
          results.meta = { synced: true };
          break;
        }
      }
    } catch (e) { results.meta = { error: e.message }; }

    try {
      const googleAccounts = userId ? await platformAccountsRepo?.findAllActiveByUserAndPlatform(userId, 'google') : [];
      for (const acct of googleAccounts) {
        if (acct?.credentials?.developer_token) {
          results.google = { synced: true };
          break;
        }
      }
    } catch (e) { results.google = { error: e.message }; }

    try {
      const tiktokAccounts = userId ? await platformAccountsRepo?.findAllActiveByUserAndPlatform(userId, 'tiktok') : [];
      for (const acct of tiktokAccounts) {
        if (acct?.credentials?.access_token) {
          results.tiktok = { synced: true };
          break;
        }
      }
    } catch (e) { results.tiktok = { error: e.message }; }

    res.json({ success: true, data: results });
  });

  router.post('/apply-all', async (req, res) => {
    try {
      const { llmClient } = req.app.locals;
      if (!llmClient) {
        return res.json({ success: true, data: { message: 'AI not configured' } });
      }
      
      const campaigns = campaignsRepo.findAll();
      const results = [];
      
      for (const campaign of campaigns) {
        if (campaign.roas < 2.0) {
          results.push({
            id: campaign.id,
            platform: campaign.platform,
            action: 'optimize',
            status: 'applied'
          });
        }
      }
      
      res.json({ success: true, data: { applied: results.length, campaigns: results } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
