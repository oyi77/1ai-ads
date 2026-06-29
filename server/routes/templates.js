import express from 'express';
import { requireRole } from '../middleware/rbac.js';

export function createTemplatesRouter(templatesRepo) {
  const router = express.Router();

  // GET /api/templates - List all templates
  router.get('/', (req, res) => {
    const userId = req.user?.id || 'system';
    const { page = 1, limit = 50 } = req.query;
    const filters = {
      category: req.query.category,
      industry: req.query.industry,
      search: req.query.search,
      userId,
      page: +page,
      limit: +limit,
    };
    const result = templatesRepo.getAll(filters);
    res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
  });


  // GET /api/templates/:id - Get single template
  router.get('/:id', (req, res) => {
    const template = templatesRepo.getById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: template });
  });

  // POST /api/templates - Create template (admin only)
  router.post('/', requireRole('admin'), (req, res) => {
    const template = templatesRepo.create(req.body);
    res.status(201).json({ success: true, data: template });
  });

  // PUT /api/templates/:id - Update template (admin only)
  router.put('/:id', requireRole('admin'), (req, res) => {
    const template = templatesRepo.update(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: template });
  });

  // DELETE /api/templates/:id - Delete template (admin only)
  router.delete('/:id', requireRole('admin'), (req, res) => {
    templatesRepo.delete(req.params.id);
    res.json({ success: true });
  });

  return router;
}
