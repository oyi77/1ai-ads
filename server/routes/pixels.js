import { Router } from 'express';
import { PixelService } from '../services/pixel-service.js';

export function createPixelRouter(metaApi) {
  const router = Router();
  const svc = new PixelService(metaApi);

  router.get('/', async (req, res) => {
    try {
      const actId = req.query.account_id;
      if (!actId) return res.status(400).json({ error: 'account_id required' });
      res.json(await svc.getPixels(actId));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id/events', async (req, res) => {
    try {
      res.json(await svc.getPixelEvents(req.params.id, req.query));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/events', async (req, res) => {
    try {
      res.json(await svc.sendCAPIEvent(req.params.id, req.body));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id/stats', async (req, res) => {
    try {
      res.json(await svc.getPixelStats(req.params.id, req.query.date_range));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
