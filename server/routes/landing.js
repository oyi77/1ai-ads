import { Router } from 'express';
import db from '../../db/index.js';
import { v4 as uuid } from 'uuid';
import { generateLandingPage } from '../services/ai.js';
import { renderLandingPage } from '../services/templates.js';

const router = Router();

router.get('/', (req, res) => {
  const pages = db.prepare('SELECT * FROM landing_pages ORDER BY created_at DESC').all();
  res.json({ success: true, data: pages, total: pages.length });
});

router.get('/:id', (req, res) => {
  const page = db.prepare('SELECT * FROM landing_pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: page });
});

router.post('/', (req, res) => {
  const id = uuid();
  const { name, template, theme, product_name, price, pain_points, benefits, cta_primary, cta_secondary, wa_link, checkout_link } = req.body;
  db.prepare(`
    INSERT INTO landing_pages (id, name, template, theme, product_name, price, pain_points, benefits, cta_primary, cta_secondary, wa_link, checkout_link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, template || 'dark', theme || 'dark', product_name, price, JSON.stringify(pain_points || []), JSON.stringify(benefits || []), cta_primary, cta_secondary, wa_link, checkout_link);
  res.json({ success: true, data: { id } });
});

router.post('/generate', async (req, res) => {
  const { product_name, price, benefits, cta_primary, theme } = req.body;

  if (!product_name || !price) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: product_name, price'
    });
  }

  try {
    const html = await generateLandingPage(product_name, price, benefits, cta_primary, theme);
    res.json({ success: true, data: { html_output: html } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/render', (req, res) => {
  const { template, theme, product_name, price, benefits, cta_primary, checkout_link, pain_points, cta_secondary, wa_link } = req.body;
  const html = renderLandingPage({
    template, theme: theme || 'dark', product_name, price, benefits, cta_primary, checkout_link, pain_points, cta_secondary, wa_link
  });
  res.json({ success: true, data: { html_output: html } });
});

export default router;
