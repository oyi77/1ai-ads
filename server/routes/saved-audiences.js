import { Router } from 'express';

export function createSavedAudiencesRouter(savedAudiencesRepo) {
  const router = Router();

  // List saved audiences
  router.get('/', async (req, res) => {
    try {
      const userId = req.user?.id || 'system';
      const { page = 1, limit = 50 } = req.query;
      const result = savedAudiencesRepo.findAll({ userId, page: +page, limit: +limit });
      res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Save an audience
  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.id || 'system';
      const { name, platform, description, targeting } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'name is required' });
      const audience = savedAudiencesRepo.create({ userId, name, platform, description, targeting });
      res.status(201).json({ success: true, data: audience });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete saved audience
  router.delete('/:id', async (req, res) => {
    try {
      const ok = savedAudiencesRepo.remove(req.params.id, req.user?.id);
      if (!ok) return res.status(404).json({ success: false, error: 'Audience not found' });
      res.json({ success: true, data: { id: req.params.id, deleted: true } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update a saved audience
  router.put('/:id', async (req, res) => {
    try {
      const { name, platform, description } = req.body;
      const updated = savedAudiencesRepo.update(req.params.id, { name, platform, description }, req.user?.id);
      if (!updated) return res.status(404).json({ success: false, error: 'Audience not found' });
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
