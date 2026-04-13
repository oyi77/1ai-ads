import express from 'express';
import { renderLandingPage } from '../services/templates.js';

const VALID_THEMES = ['dark', 'light'];

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
    const page = landingRepo.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Landing page not found' });
    }
    res.json({ success: true, data: page });
  });

  // POST /api/landing/render - Render landing page HTML from template (no save)
  router.post('/render', (req, res) => {
    try {
      const html_output = renderLandingPage(req.body);
      res.json({ success: true, data: { html_output } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/landing/generate - AI-generate landing page HTML (no save)
  router.post('/generate', async (req, res) => {
    try {
      const { product_name, price, benefits, cta_primary } = req.body;
      const html = await landingGenerator.generateLandingPage(
        product_name || '',
        price || '',
        benefits || '',
        cta_primary || 'Buy Now'
      );
      const html_output = typeof html === 'string' ? html : renderLandingPage({ theme: 'dark', ...req.body });
      res.json({ success: true, data: { html_output } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/landing - Generate new landing page and save
  router.post('/', async (req, res) => {
    try {
      const { name, product_name, price, benefits, cta_primary, template, theme, html_output } = req.body;

      if (!name && !product_name) {
        return res.status(400).json({ success: false, error: 'name or product_name is required' });
      }
      if (theme && !VALID_THEMES.includes(theme)) {
        return res.status(400).json({ success: false, error: `Invalid theme. Valid values: ${VALID_THEMES.join(', ')}` });
      }

      let html = html_output;
      
      if (!html) {
        if (req.body.is_ai) {
          html = await landingGenerator.generateLandingPage(
            product_name || name,
            price || '',
            benefits || '',
            cta_primary || 'Buy Now'
          );
        } else {
          html = renderLandingPage({
            theme: theme || 'dark',
            product_name: product_name || name,
            price,
            benefits,
            cta_primary
          });
        }
      }

      const id = landingRepo.create({
        name: name || `Landing: ${product_name}`,
        template: template || 'dark',
        theme: theme || 'dark',
        product_name: product_name || null,
        price: price || null,
        benefits: benefits || null,
        cta_primary: cta_primary || null,
        html_output: typeof html === 'string' ? html : null,
      });
      const page = landingRepo.findById(id);
      res.json({ success: true, data: page });
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
    const existing = landingRepo.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Landing page not found' });
    }
    landingRepo.remove(req.params.id);
    res.json({ success: true });
  });

  // POST /api/landing/:id/deploy - Publish landing page
  router.post('/:id/deploy', (req, res) => {
    const slug = req.body.slug;
    const page = landingRepo.update(req.params.id, { is_published: true, slug: slug });
    if (!page) {
      return res.status(404).json({ success: false, error: 'Landing page not found' });
    }
    res.json({ success: true, data: page });
  });

  // POST /api/landing/:id/undeploy - Unpublish landing page
  router.post('/:id/undeploy', (req, res) => {
    const page = landingRepo.update(req.params.id, { is_published: false });
    if (!page) {
      return res.status(404).json({ success: false, error: 'Landing page not found' });
    }
    res.json({ success: true, data: page });
  });

  // GET /api/landing/:id/export - Export landing page as HTML
  router.get('/:id/export', (req, res) => {
    const page = landingRepo.findById(req.params.id);
    if (!page) {
      return res.status(404).json({ success: false, error: 'Landing page not found' });
    }
    const html = page.html_output || renderLandingPage({
      theme: page.theme,
      product_name: page.product_name,
      price: page.price,
      benefits: page.benefits,
      pain_points: page.pain_points,
      cta_primary: page.cta_primary,
      cta_secondary: page.cta_secondary,
      wa_link: page.wa_link,
      checkout_link: page.checkout_link,
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  return router;
}
