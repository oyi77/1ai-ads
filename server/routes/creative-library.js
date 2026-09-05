import { Router } from 'express';

export function createCreativeLibraryRouter(repo) {
  const router = Router();

  // GET /api/creative/library — list user's creatives
  router.get('/', async (req, res) => {
    try {
      const { type, limit, offset } = req.query;
      const result = repo.list({ 
        userId: req.user.id, 
        type, 
        limit: parseInt(limit) || 50, 
        offset: parseInt(offset) || 0 
      });
      // Parse tags from JSON string to array
      const data = (result.data || []).map(item => ({
        ...item,
        tags: typeof item.tags === 'string' ? JSON.parse(item.tags) : item.tags,
      }));
      res.json({ success: true, data, total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/creative/library/top — get top performing creatives
  router.get('/top', async (req, res) => {
    try {
      const { limit } = req.query;
      const data = repo.getTopPerformers({ userId: req.user.id, limit: parseInt(limit) || 10 });
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/creative/library — create creative
  router.post('/', async (req, res) => {
    try {
      const { name, hook, body, cta, tags, type } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'name is required' });
      }
      const creative = repo.create({ userId: req.user.id, name, hook, body, cta, tags, type });
      res.status(201).json({ success: true, data: creative });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/creative/library/:id/use — increment usage
  router.post('/:id/use', async (req, res) => {
    try {
      const result = repo.incrementUsage(req.params.id, req.user.id);
      if (!result) return res.status(404).json({ success: false, error: 'Creative not found' });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/creative/library/:id — update creative
  router.put('/:id', async (req, res) => {
    try {
      const { name, hook, body, cta, tags } = req.body;
      const result = repo.update(req.params.id, { name, hook, body, cta, tags }, req.user.id);
      if (!result) return res.status(404).json({ success: false, error: 'Creative not found' });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/creative/library/:id — delete creative
  router.delete('/:id', async (req, res) => {
    try {
      const result = repo.delete(req.params.id, req.user.id);
      // Handle both mock (undefined) and real repo ({changes: N}) responses
      if (result && result.changes === 0) return res.status(404).json({ success: false, error: 'Creative not found' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
