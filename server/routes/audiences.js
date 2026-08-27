import { Router } from 'express';
import { AudienceService } from '../services/audience-service.js';
import { MetaAdsAPI } from '../services/meta/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { ValidationError } from '../lib/errors.js';

export function createAudienceRouter({ platformAccountsRepo, settingsRepo }) {
  const router = Router();

  // Fresh per-request Meta client bound to the REQUESTING USER's own token
  // (SaaS multi-tenant). NEVER reuse the shared services.metaApi singleton with
  // setActiveAccount — that mutates shared token state across concurrent users.
  function clientFor(req) {
    const token = resolveUserPlatformToken('meta', req, platformAccountsRepo, settingsRepo);
    if (!token) {
      throw new ValidationError('Meta account not connected. Please connect your account in Settings.');
    }
    return new MetaAdsAPI(token);
  }
  router.get('/', async (req, res) => {
    try {
      const actId = req.query.account_id;
      if (!actId) return res.json([]);
      const api = clientFor(req);
      const scopedSvc = new AudienceService(api);
      res.json(await scopedSvc.getAudiences(actId));
    } catch (err) {
      const status = err instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { account_id, name, description, subtype } = req.body;
      if (!account_id || !name) return res.status(400).json({ error: 'account_id and name required' });
      const api = clientFor(req);
      const scopedSvc = new AudienceService(api);
      res.json(await scopedSvc.createAudience(account_id, { name, description, subtype }));
    } catch (err) {
      const status = err instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  router.post('/:id/users', async (req, res) => {
    try {
      const { users, schema } = req.body;
      if (!users?.length) return res.status(400).json({ error: 'users array required' });
      const api = clientFor(req);
      const scopedSvc = new AudienceService(api);
      res.json(await scopedSvc.addUsersToAudience(req.params.id, users, schema));
    } catch (err) {
      const status = err instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  router.post('/:id/lookalike', async (req, res) => {
    try {
      const { country, ratio, ad_account_id } = req.body;
      const api = clientFor(req);
      const scopedSvc = new AudienceService(api);
      res.json(await scopedSvc.createLookalike(req.params.id, { country, ratio, ad_account_id }));
    } catch (err) {
      const status = err instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  // Phase 6 — ingest a customer contact list into a Meta Custom Audience.
  // contacts: array of strings (phone) or { phone } objects. Meta-side only;
  // no DB persistence (Phase 6 UI follows). Strictly per-user scoped.
  router.post('/custom-list', async (req, res) => {
    try {
      const { account_id, name, contacts } = req.body;
      if (!account_id || !name) return res.status(400).json({ error: 'account_id and name required' });
      if (!Array.isArray(contacts) || !contacts.length) return res.status(400).json({ error: 'contacts array required' });
      const api = clientFor(req);
      const scopedSvc = new AudienceService(api);
      res.json(await scopedSvc.createCustomListAudience(account_id, { name, contacts }));
    } catch (err) {
      const status = err instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const api = clientFor(req);
      const scopedSvc = new AudienceService(api);
      res.json(await scopedSvc.deleteAudience(req.params.id));
    } catch (err) {
      const status = err instanceof ValidationError ? 400 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  return router;
}
