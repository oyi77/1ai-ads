import { Router } from 'express';
import { validateAd, validateRequired } from '../lib/validate.js';

// In-memory wizard session storage (production: use Redis/database)
const wizardSessions = new Map();

export function createAdsRouter(adsRepo, adGenerator) {
  const router = Router();

  function generateAdPreview(ad) {
    if (!ad) return '';
    const cta = ad.cta || 'Learn More';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ad Preview - ${ad.name || 'Untitled'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-slate-900 to-slate-800 min-h-screen p-4">
  <div class="max-w-4xl mx-auto bg-white rounded-xl shadow-2xl overflow-hidden">
    <div class="p-8">
      <h1 class="text-2xl font-bold text-slate-900 mb-2">${ad.name || 'Untitled'}</h1>
      ${ad.hook ? `<p class="text-lg text-slate-700 mb-4"><em>${ad.hook}</em></p>` : ''}
      ${ad.body ? `<p class="text-lg text-slate-700 mb-4">${ad.body}</p>` : ''}
      <button class="mt-6 bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-lg font-bold transition-colors">${cta}</button>
    </div>
  </div>
</body>
</html>
    `;
  }

  // Wizard mode endpoints
  router.post('/wizard/start', async (req, res) => {
    const wizardSessionId = `wizard_${req.user.id}_${Date.now()}`;
    res.json({
      success: true,
      data: { wizardSessionId }
    });
  });

  router.post('/wizard/step', async (req, res) => {
    const { sessionId, step, data } = req.body;
    if (!sessionId || !step) {
      return res.status(400).json({ success: false, error: 'sessionId and step are required' });
    }

    res.json({ success: true, data: { acknowledged: true } });
  });

  router.get('/wizard/session/:sessionId', async (req, res) => {
    // In production, this would fetch from Redis/database
    res.json({ success: true, data: { step: 1, totalSteps: 6 } });
  });

  router.post('/wizard/complete', async (req, res) => {
    const { sessionId, finalData } = req.body;
    if (!sessionId || !finalData) {
      return res.status(400).json({ success: false, error: 'sessionId and finalData are required' });
    }

    const adData = {
      ...finalData,
      status: finalData.status || 'draft',
      created_at: new Date().toISOString()
    };
    const id = adsRepo.create(adData);
    res.json({ success: true, data: { id } });
  });

  router.post('/preview', async (req, res) => {
    const { id } = req.body;
    const ad = adsRepo.findById(id);
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });

    // Generate preview HTML
    const html = generateAdPreview(ad);
    res.json({ success: true, data: { html } });
  });

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
