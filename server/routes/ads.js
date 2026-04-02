import { Router } from 'express';
import db from '../../db/index.js';
import { v4 as uuid } from 'uuid';
import { generateAds } from '../services/ai.js';

const router = Router();

router.get('/', (req, res) => {
  const ads = db.prepare('SELECT * FROM ads ORDER BY created_at DESC').all();
  res.json({ success: true, data: ads, total: ads.length });
});

router.get('/:id', (req, res) => {
  const ad = db.prepare('SELECT * FROM ads WHERE id = ?').get(req.params.id);
  if (!ad) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: ad });
});

router.post('/', (req, res) => {
  const id = uuid();
  const { name, product, target, keunggulan, platform, format, content_model, hook, body, cta, tags } = req.body;
  db.prepare(`
    INSERT INTO ads (id, name, product, target, keunggulan, platform, format, content_model, hook, body, cta, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, product, target, keunggulan, platform || 'meta', format || 'single_image', content_model, hook, body, cta, JSON.stringify(tags || []));
  res.json({ success: true, data: { id } });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM ads WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/generate', async (req, res) => {
  const { product, target, keunggulan } = req.body;

  if (!product || !target || !keunggulan) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: product, target, keunggulan'
    });
  }

  try {
    const result = await generateAds(product, target, keunggulan);
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
