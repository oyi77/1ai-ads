import { Router } from 'express';
import { PixelService } from '../services/pixel-service.js';

export default function createPixelRouter(metaApi) {
  const router = Router();
  const svc = new PixelService(metaApi);

  router.get('/', async (req, res) => {
    try {
      const actId = req.query.account_id;
      if (!actId) return res.status(400).json({ error: 'account_id required' });
      const result = await svc.getPixels(actId);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id/events', async (req, res) => {
    try {
      const result = await svc.getPixelEvents(req.params.id, req.query);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/events', async (req, res) => {
    try {
      const result = await svc.sendCAPIEvent(req.params.id, req.body);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id/stats', async (req, res) => {
    try {
      const result = await svc.getPixelStats(req.params.id, req.query.date_range);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
