import { Router } from 'express';
import { validateAd, validateRequired } from '../lib/validate.js';

export function createAdsRouter(adsRepo, adGenerator) {
  const router = Router();

  router.get('/', (req, res) => {
    const { page = 1, limit = 20, platform, status } = req.query;
    const result = adsRepo.findAll({ page: +page, limit: +limit, platform, status });
    res.json({ success: true, ...result });
  });

  router.get('/search', (req, res) => {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q) return res.json({ success: true, data: [], total: 0 });
    const result = adsRepo.search(q, { page: +page, limit: +limit });
    res.json({ success: true, ...result });
  });

  router.get('/:id', (req, res) => {
    const ad = adsRepo.findById(req.params.id);
    if (!ad) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: ad });
  });

  router.post('/', (req, res) => {
    const v = validateAd(req.body);
    if (!v.valid) return res.status(400).json({ success: false, error: v.error });

    const id = adsRepo.create(req.body);
    res.json({ success: true, data: { id } });
  });

  router.put('/:id', (req, res) => {
    const updated = adsRepo.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: updated });
  });

  router.delete('/:id', (req, res) => {
    const removed = adsRepo.remove(req.params.id);
    if (!removed) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  });

  router.post('/generate', async (req, res) => {
    const v = validateRequired(req.body, ['product', 'target', 'keunggulan']);
    if (!v.valid) return res.status(400).json({ success: false, error: v.error });

    try {
      const result = await adGenerator.generateAds(req.body.product, req.body.target, req.body.keunggulan);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}
