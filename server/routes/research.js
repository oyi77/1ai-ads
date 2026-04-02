import { Router } from 'express';

export function createResearchRouter(adResearch) {
  const router = Router();

  // Search ads by keyword
  router.get('/search', async (req, res) => {
    const { q, country, status, media_type, limit } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: 'q (search query) is required' });
    }

    try {
      const result = await adResearch.searchAds({
        query: q,
        country: country || 'ID',
        activeStatus: status || 'ALL',
        mediaType: media_type,
        limit: limit ? parseInt(limit) : 50,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Search ads by competitor page
  router.get('/page/:pageId', async (req, res) => {
    const { country, status, limit } = req.query;

    try {
      const result = await adResearch.searchByPage({
        pageId: req.params.pageId,
        country: country || 'ID',
        activeStatus: status || 'ACTIVE',
        limit: limit ? parseInt(limit) : 100,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Resolve page name/URL to page ID
  router.get('/resolve-page', async (req, res) => {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: 'q (page name or URL) is required' });
    }

    try {
      const page = await adResearch.resolvePageId(q);
      res.json({ success: true, data: page });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
