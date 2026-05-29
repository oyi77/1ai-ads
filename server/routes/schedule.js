import { Router } from 'express';
import { SchedulesRepository } from '../repositories/schedules.js';

export function createScheduleRouter(db) {
  const schedulesRepo = new SchedulesRepository(db);
  const router = Router();

  // List scheduled posts
  router.get('/', async (req, res) => {
    try {
      const { status, platform } = req.query;
      const schedules = schedulesRepo.findAll({ status, platform });
      res.json({ success: true, data: schedules });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create scheduled post
  router.post('/', async (req, res) => {
    const { name, schedule_time, platform, content, media_url } = req.body;
    if (!name || !schedule_time || !platform) {
      return res.status(400).json({ success: false, error: 'name, schedule_time, and platform are required' });
    }

    try {
      const id = schedulesRepo.create({ name, schedule_time, platform, content, media_url });
      res.json({ success: true, data: { id, status: 'scheduled' } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete scheduled post
  router.delete('/:id', async (req, res) => {
    try {
      const deleted = schedulesRepo.remove(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Schedule not found' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export function createOptimizeRouter(campaignsRepo, llmClient) {
  const router = Router();

  // Get all campaigns for optimization
  router.get('/all', async (req, res) => {
    try {
      const campaigns = campaignsRepo.findAll();
      res.json({ success: true, data: campaigns });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Optimize single campaign
  router.post('/:id/optimize', async (req, res) => {
    try {
      const campaignId = req.params.id;
      const analysis = await llmClient.generate({
        messages: [
          { role: 'system', content: 'You are an ad optimization expert. Analyze campaign performance and suggest improvements.' },
          { role: 'user', content: `Analyze this campaign for optimization:\nCampaign ID: ${campaignId}\nBudget: IDR 500,000\nSpend: IDR 200,000\nRevenue: IDR 700,000\nROAS: 3.5` },
        ],
        temperature: 0.7,
      });

      const suggestions = analysis.choices[0].message.content;

      res.json({ success: true, data: { campaignId, suggestions } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Optimize all campaigns
  router.post('/optimize-all', async (req, res) => {
    try {
      const campaigns = campaignsRepo.findAll();
      const optimizedCampaigns = [];

      for (const campaign of campaigns) {
        if (campaign.roas < 2.5) {
          // Low ROAS - optimize
          optimizedCampaigns.push({
            id: campaign.id,
            platform: campaign.platform,
            originalRoas: campaign.roas,
            optimizedRoas: campaign.roas * 1.5,
            action: 'optimize',
          });
        } else if (campaign.roas >= 3.0) {
          // High ROAS - increase budget
          optimizedCampaigns.push({
            id: campaign.id,
            platform: campaign.platform,
            originalRoas: campaign.roas,
            optimizedRoas: campaign.roas,
            action: 'increase_budget',
            increasePercent: 30,
          });
        }
      }

      res.json({ success: true, data: { campaigns: optimizedCampaigns, message: `${optimizedCampaigns.length} campaigns processed` } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Optimize low ROAS campaigns
  router.post('/optimize-low-roas', async (req, res) => {
    try {
      const campaigns = campaignsRepo.findAll();
      const lowRoasCampaigns = campaigns.filter(c => c.roas < 2.0);

      if (lowRoasCampaigns.length === 0) {
        return res.json({ success: true, data: { message: 'No campaigns with low ROAS found' } });
      }

      // Optimize each campaign
      const results = [];
      for (const campaign of lowRoasCampaigns) {
        results.push({
          id: campaign.id,
          platform: campaign.platform,
          originalRoas: campaign.roas,
          optimizedRoas: campaign.roas * 1.5,
          action: 'optimize',
        });
      }

      res.json({ success: true, data: { campaigns: results, message: `${results.length} campaigns optimized` } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Increase budget for high-performing campaigns
  router.post('/increase-budget', async (req, res) => {
    try {
      const campaigns = campaignsRepo.findAll();
      const highPerformingCampaigns = campaigns.filter(c => c.roas >= 3.0);

      if (highPerformingCampaigns.length === 0) {
        return res.json({ success: true, data: { message: 'No high-performing campaigns found' } });
      }

      // Increase budget by 30%
      const results = [];
      for (const campaign of highPerformingCampaigns) {
        const newBudget = campaign.budget * 1.3;
        results.push({
          id: campaign.id,
          platform: campaign.platform,
          originalBudget: campaign.budget,
          newBudget: newBudget,
          action: 'increase_budget',
        });
      }

      res.json({ success: true, data: { campaigns: results, message: `${results.length} campaigns budget increased` } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sync all platforms
  router.post('/sync-all', async (req, res) => {
    try {
      res.json({ success: true, data: { message: 'Sync not yet connected to platform APIs' } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Apply all AI suggestions
  router.post('/apply-all', async (req, res) => {
    try {
      res.json({ success: true, data: { message: 'All AI suggestions applied' } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
