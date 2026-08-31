import { Router } from 'express';
import { PixelService } from '../services/pixel-service.js';
import { MetaAdsAPI } from '../services/meta/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { ValidationError } from '../lib/errors.js';

export function createPixelRouter(metaApi, platformAccountsRepo = null) {
  const router = Router();

  function clientFor(req) {
    const token = platformAccountsRepo
      ? resolveUserPlatformToken('meta', req, platformAccountsRepo, null)
      : null;
    if (!token) {
      throw new ValidationError('Meta account not connected. Please connect your account in Settings.');
    }
    return MetaAdsAPI.withToken(token);
  }

  router.get('/', async (req, res) => {
    try {
      const actId = req.query.account_id;
      if (!actId) return res.status(400).json({ error: 'account_id required' });
      const svc = new PixelService(clientFor(req));
      res.json(await svc.getPixels(actId));
    } catch (err) {
      res.status(err instanceof ValidationError ? 400 : 500).json({ error: err.message });
    }
  });

  router.get('/:id/events', async (req, res) => {
    try {
      const svc = new PixelService(clientFor(req));
      res.json(await svc.getPixelEvents(req.params.id, req.query));
    } catch (err) {
      res.status(err instanceof ValidationError ? 400 : 500).json({ error: err.message });
    }
  });

  router.post('/:id/events', async (req, res) => {
    try {
      const svc = new PixelService(clientFor(req));
      res.json(await svc.sendCAPIEvent(req.params.id, req.body));
    } catch (err) {
      res.status(err instanceof ValidationError ? 400 : 500).json({ error: err.message });
    }
  });

  router.get('/:id/stats', async (req, res) => {
    try {
      const svc = new PixelService(clientFor(req));
      res.json(await svc.getPixelStats(req.params.id, req.query.date_range));
    } catch (err) {
      res.status(err instanceof ValidationError ? 400 : 500).json({ error: err.message });
    }
  });

  return router;
}
