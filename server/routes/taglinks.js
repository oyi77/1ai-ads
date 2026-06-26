import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

/**
 * Taglinks routes — generate, report, and list tagged Shopee attribution links.
 * Ported from adforge-dashboard/app.py taglink endpoints.
 */
export function createTaglinksRouter({ userDb }) {
  const router = Router();

  // All taglink routes require auth
  router.use(requireAuth);

  /**
   * POST /api/taglinks/generate
   * Generate a tagged link for attribution tracking.
   */
  router.post('/generate', async (req, res) => {
    try {
      const { url, campaign, adset, ad, account } = req.body;
      if (!url || !campaign) {
        return res.status(400).json({ success: false, error: 'URL and campaign required' });
      }

      // Sanitize inputs
      const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9_\-./:?=&%\s]/g, '');
      const taglink = {
        id: `tl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url: safe(url),
        campaign: safe(campaign),
        adset: safe(adset),
        ad: safe(ad),
        account: safe(account || 'default'),
        created_at: new Date().toISOString(),
      };

      // Build tagged URL with UTM params
      const sep = url.includes('?') ? '&' : '?';
      taglink.tagged_url = `${url}${sep}utm_source=adforge&utm_medium=paid&utm_campaign=${encodeURIComponent(campaign)}&utm_content=${encodeURIComponent(ad || adset || '')}`;

      res.json({ success: true, taglink });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/taglinks/report
   * Get attribution report summary.
   */
  router.get('/report', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId || !userDb) {
        return res.json({ success: true, report: { total: 0, links: [] } });
      }

      const db = userDb(userId);
      try {
        const links = db.prepare(`
          SELECT id, name, campaign_id, status, created_at
          FROM campaigns WHERE platform = 'shopee_taglink'
          ORDER BY created_at DESC LIMIT 50
        `).all();
        res.json({ success: true, report: { total: links.length, links } });
      } finally {
        db.close();
      }
    } catch (err) {
      res.json({ success: true, report: { total: 0, links: [] } });
    }
  });

  /**
   * GET /api/taglinks/list
   * List all generated taglinks.
   */
  router.get('/list', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId || !userDb) {
        return res.json([]);
      }

      const db = userDb(userId);
      try {
        const taglinks = db.prepare(`
          SELECT id, name, campaign_id, status, created_at
          FROM campaigns WHERE platform = 'shopee_taglink'
          ORDER BY created_at DESC
        `).all();
        res.json(taglinks);
      } finally {
        db.close();
      }
    } catch (err) {
      res.json([]);
    }
  });

  return router;
}
