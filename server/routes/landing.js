import express from 'express';

export function createLandingRouter(landingRepo, landingGenerator) {
  const router = express.Router();

  // GET /api/landing - List all landing pages
  router.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const result = landingRepo.findAll({ page, limit });
    res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
  });

  // GET /api/landing/:id - Get single landing page
  router.get('/:id', (req, res) => {
    const page = landingRepo.getById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Landing page not found' });
    }
    res.json({ success: true, data: page });
  });

  // POST /api/landing - Generate new landing page
  router.post('/', async (req, res) => {
    try {
      const { product_name, target, industry, template } = req.body;
      const generated = await landingGenerator.generate(req.body);
      const id = landingRepo.create({
        name: `Landing: ${product_name}`,
        template: template || 'modern',
        theme: 'dark',
        ...generated
      });
      const page = landingRepo.getById(id);
      res.status(201).json({ success: true, data: page });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/landing/:id - Update landing page
  router.put('/:id', (req, res) => {
    const page = landingRepo.update(req.params.id, req.body);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Landing page not found' });
    }
    res.json({ success: true, data: page });
  });

  // DELETE /api/landing/:id - Delete landing page
  router.delete('/:id', (req, res) => {
    landingRepo.delete(req.params.id);
    res.json({ success: true });
  });

  // POST /api/landing/:id/publish - Publish landing page
  router.post('/:id/publish', (req, res) => {
    const page = landingRepo.update(req.params.id, { is_published: true });
    if (!page) {
      return res.status(404).json({ success: false, error: 'Landing page not found' });
    }
    res.json({ success: true, data: page });
  });

  return router;
}
