import { Router } from 'express';

export function createCampaignWizardRouter(wizardRepo, platformServices) {
  const router = Router();

  // GET /api/wizards — list user's campaign wizards
  router.get('/', async (req, res) => {
    try {
      const { platform, status, limit, offset } = req.query;
      const wizards = wizardRepo.findAll(req.user.id, { 
        platform, status, 
        limit: parseInt(limit) || 50, 
        offset: parseInt(offset) || 0 
      });
      res.json({ success: true, data: wizards });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/wizards/:id — get single wizard
  router.get('/:id', async (req, res) => {
    try {
      const wizard = wizardRepo.findById(req.params.id, req.user.id);
      if (!wizard) return res.status(404).json({ success: false, error: 'Wizard not found' });
      res.json({ success: true, data: wizard });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/wizards — create new campaign wizard
  router.post('/', async (req, res) => {
    try {
      const { platform, name, config, targetAudience, budget, creatives } = req.body;
      if (!platform || !name) {
        return res.status(400).json({ success: false, error: 'platform and name are required' });
      }
      const wizard = wizardRepo.create({
        userId: req.user.id,
        platform,
        name,
        config: config || {},
        targetAudience: targetAudience || {},
        budget: budget || {},
        creatives: creatives || [],
      });
      res.status(201).json({ success: true, data: wizard });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/wizards/:id — update wizard
  router.put('/:id', async (req, res) => {
    try {
      const { name, status, config, targetAudience, budget, creatives } = req.body;
      const wizard = wizardRepo.update(req.params.id, req.user.id, { name, status, config, targetAudience, budget, creatives });
      if (!wizard) return res.status(404).json({ success: false, error: 'Wizard not found' });
      res.json({ success: true, data: wizard });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/wizards/:id — delete wizard
  router.delete('/:id', async (req, res) => {
    try {
      const result = wizardRepo.delete(req.params.id, req.user.id);
      if (result.changes === 0) return res.status(404).json({ success: false, error: 'Wizard not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/wizards/:id/launch — launch campaign from wizard
  router.post('/:id/launch', async (req, res) => {
    try {
      const wizard = wizardRepo.findById(req.params.id, req.user.id);
      if (!wizard) return res.status(404).json({ success: false, error: 'Wizard not found' });

      const service = platformServices[wizard.platform];
      if (!service) return res.status(400).json({ success: false, error: `Unsupported platform: ${wizard.platform}` });

      // Get user's platform account
      const accounts = await service.getAccounts();
      if (!accounts || accounts.length === 0) {
        return res.status(0).json({ success: false, error: `No ${wizard.platform} account connected` });
      }

      const accountId = accounts[0].id;
      
      // Create campaign via platform API
      const campaignData = {
        name: wizard.name,
        objective: wizard.config.objective,
        budget: wizard.budget?.dailyAmount || wizard.budget?.amount || 10,
        currency: wizard.budget?.currency || 'USD',
      };

      const campaign = await service.createCampaign(accountId, campaignData);
      
      // Mark wizard as launched
      wizardRepo.update(req.params.id, req.user.id, { status: 'launched' });

      res.json({ success: true, data: campaign });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
