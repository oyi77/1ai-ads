import express from 'express';

export function createTemplatesRouter(templatesRepo) {
  const router = express.Router();

  // GET /api/templates - List all templates
  router.get('/', (req, res) => {
    const filters = {
      category: req.query.category,
      industry: req.query.industry,
      search: req.query.search
    };
    const templates = templatesRepo.getAll(filters);
    res.json({ success: true, data: templates });
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
  router.post('/', (req, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const template = templatesRepo.create(req.body);
    res.status(201).json({ success: true, data: template });
  });

  // PUT /api/templates/:id - Update template (admin only)
  router.put('/:id', (req, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    const template = templatesRepo.update(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: template });
  });

  // DELETE /api/templates/:id - Delete template (admin only)
  router.delete('/:id', (req, res) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    templatesRepo.delete(req.params.id);
    res.json({ success: true });
  });

  return router;
}
