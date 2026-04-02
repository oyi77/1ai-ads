import { Router } from 'express';
import { validateLandingPage, validateRequired } from '../lib/validate.js';
import { renderLandingPage } from '../services/templates.js';

export function createLandingRouter(landingRepo, landingGenerator) {
  const router = Router();

  router.get('/', (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const result = landingRepo.findAll({ page: +page, limit: +limit });
    res.json({ success: true, ...result });
  });

  router.get('/:id/export', (req, res) => {
    const page = landingRepo.findById(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Not found' });

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
    res.setHeader('Content-Disposition', `attachment; filename="${page.name || 'landing-page'}.html"`);
    res.send(html);
  });

  router.get('/:id', (req, res) => {
    const page = landingRepo.findById(req.params.id);
    if (!page) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: page });
  });

  router.post('/', (req, res) => {
    const v = validateLandingPage(req.body);
    if (!v.valid) return res.status(400).json({ success: false, error: v.error });

    const id = landingRepo.create(req.body);
    res.json({ success: true, data: { id } });
  });

  router.put('/:id', (req, res) => {
    const updated = landingRepo.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: updated });
  });

  router.delete('/:id', (req, res) => {
    const removed = landingRepo.remove(req.params.id);
    if (!removed) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  });

  router.post('/generate', async (req, res) => {
    const v = validateRequired(req.body, ['product_name', 'price']);
    if (!v.valid) return res.status(400).json({ success: false, error: v.error });

    try {
      const { product_name, price, benefits, cta_primary } = req.body;
      const html = await landingGenerator.generateLandingPage(product_name, price, benefits, cta_primary);
      res.json({ success: true, data: { html_output: html } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/render', (req, res) => {
    const { id, theme, product_name, price, benefits, cta_primary, checkout_link, pain_points, cta_secondary, wa_link } = req.body;
    const html = renderLandingPage({
      theme: theme || 'dark', product_name, price, benefits, cta_primary, checkout_link, pain_points, cta_secondary, wa_link
    });

    // If id provided, save the rendered html to the landing page
    if (id) {
      landingRepo.update(id, { html_output: html });
    }

    res.json({ success: true, data: { html_output: html } });
  });

  return router;
}
