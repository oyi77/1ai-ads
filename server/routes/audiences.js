import { Router } from 'express';
import { AudienceService } from '../services/audience-service.js';

export default function createAudienceRouter(metaApi) {
  const router = Router();
  const svc = new AudienceService(metaApi);

  router.get('/', async (req, res) => {
    try {
      const actId = req.query.account_id;
      if (!actId) return res.status(400).json({ error: 'account_id required' });
      const result = await svc.getAudiences(actId);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/', async (req, res) => {
    try {
      const { account_id, name, description, subtype } = req.body;
      if (!account_id || !name) return res.status(400).json({ error: 'account_id and name required' });
      const result = await svc.createAudience(account_id, { name, description, subtype });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/users', async (req, res) => {
    try {
      const { users, schema } = req.body;
      if (!users?.length) return res.status(400).json({ error: 'users array required' });
      const result = await svc.addUsersToAudience(req.params.id, users, schema);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/lookalike', async (req, res) => {
    try {
      const { country, ratio, ad_account_id } = req.body;
      const result = await svc.createLookalike(req.params.id, { country, ratio, ad_account_id });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const result = await svc.deleteAudience(req.params.id);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
