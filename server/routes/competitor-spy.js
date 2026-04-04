import { Router } from 'express';
import { getCompetitorData } from '../services/competitor-spy.js';
import { requireAuth } from '../middleware/auth.js';

export function createCompetitorSpyRouter() {
  const router = Router();

  // GET /api/competitor-spy – returns static competitor data (placeholder)
  router.get('/', requireAuth, async (req, res) => {
    try {
      const data = await getCompetitorData();
      res.json({ success: true, data });
    } catch (e) {
      console.error('Competitor Spy error:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  return router;
}
