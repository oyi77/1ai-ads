import { Router } from 'express';
import { BatchService } from '../services/batch-service.js';
import { MetaAdsAPI } from '../services/meta/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { ValidationError } from '../lib/errors.js';

export function createBatchRouter(metaApi, platformAccountsRepo = null) {
  const router = Router();

  // Per-request Meta client bound to the REQUESTING user's token — never the
  // shared system token. Batch operations act on the caller's own entities.
  function clientFor(req) {
    const token = platformAccountsRepo
      ? resolveUserPlatformToken('meta', req, platformAccountsRepo, null)
      : null;
    if (!token) {
      throw new ValidationError('Meta account not connected. Please connect your account in Settings.');
    }
    return MetaAdsAPI.withToken(token);
  }

  router.get('/', (_req, res) => {
    res.json({ service: 'batch', endpoints: ['POST /', 'POST /pause', 'POST /activate', 'POST /update-budget'] });
  });

  router.post('/', async (req, res) => {
    try {
      const { requests } = req.body;
      if (!requests?.length) return res.status(400).json({ error: 'requests array required' });
      const svc = new BatchService(clientFor(req));
      res.json(await svc.batchRequest(requests));
    } catch (err) {
      res.status(err instanceof ValidationError ? 400 : 500).json({ error: err.message });
    }
  });

  router.post('/pause', async (req, res) => {
    try {
      const { ids, entity_type } = req.body;
      if (!ids?.length) return res.status(400).json({ error: 'ids array required' });
      const svc = new BatchService(clientFor(req));
      res.json(await svc.batchPause(ids, entity_type));
    } catch (err) {
      res.status(err instanceof ValidationError ? 400 : 500).json({ error: err.message });
    }
  });

  router.post('/activate', async (req, res) => {
    try {
      const { ids, entity_type } = req.body;
      if (!ids?.length) return res.status(400).json({ error: 'ids array required' });
      const svc = new BatchService(clientFor(req));
      res.json(await svc.batchActivate(ids, entity_type));
    } catch (err) {
      res.status(err instanceof ValidationError ? 400 : 500).json({ error: err.message });
    }
  });

  router.post('/update-budget', async (req, res) => {
    try {
      const { updates } = req.body;
      if (!updates?.length) return res.status(400).json({ error: 'updates array required' });
      const svc = new BatchService(clientFor(req));
      res.json(await svc.batchUpdateBudget(updates));
    } catch (err) {
      res.status(err instanceof ValidationError ? 400 : 500).json({ error: err.message });
    }
  });

  return router;
}
