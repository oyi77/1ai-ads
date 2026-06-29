import { Router } from 'express';

export function createCreativeLibraryRouter(creativeLibRepo) {
  const router = Router();

  // List creatives with optional filters
  router.get('/', async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const { type, tags, platform, sort, page = 1, limit = 50 } = req.query;
      const result = creativeLibRepo.list({
        userId,
        type,
        tags: tags ? tags.split(',').map(t => t.trim()) : undefined,
        platform,
        sortBy: sort || 'created_at',
        page: +page,
        limit: +limit,
      });
      res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // Get top performing creatives
  router.get('/top', async (req, res) => {
    try {
      const { limit } = req.query;
      const result = creativeLibRepo.findTop({
        limit: limit ? parseInt(limit, 10) : 10,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Save a new creative to the library
  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const { name, type, hook, body, cta, imageUrl, videoUrl, tags, platform } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const result = creativeLibRepo.create({
        userId, name, type, hook, body, cta, imageUrl, videoUrl, tags, platform,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update a creative
  router.put('/:id', async (req, res) => {
    try {
      const result = creativeLibRepo.update(req.params.id, req.body);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Creative not found' });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete a creative
  router.delete('/:id', async (req, res) => {
    try {
      creativeLibRepo.delete(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Record creative usage (increment times_used)
  router.post('/:id/use', async (req, res) => {
    try {
      const { campaignId } = req.body;
      const result = creativeLibRepo.recordUsage(req.params.id, campaignId);
      if (!result) {
        return res.status(404).json({ success: false, error: 'Creative not found' });
      }
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
