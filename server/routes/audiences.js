import { Router } from 'express';
import { AudienceService } from '../services/audience-service.js';

export function createAudienceRouter(metaApi) {
  const router = Router();
  const svc = new AudienceService(metaApi);

  router.get('/', async (req, res) => {
    try {
      const actId = req.query.account_id;
      if (!actId) return res.json([]);
      res.json(await svc.getAudiences(actId));
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/', async (req, res) => {
    const { account_id, name, description, subtype } = req.body;
    if (!account_id || !name) return res.status(400).json({ error: 'account_id and name required' });
    res.json(await svc.createAudience(account_id, { name, description, subtype }));
  });

  router.post('/:id/users', async (req, res) => {
    const { users, schema } = req.body;
    if (!users?.length) return res.status(400).json({ error: 'users array required' });
    res.json(await svc.addUsersToAudience(req.params.id, users, schema));
  });

  router.post('/:id/lookalike', async (req, res) => {
    const { country, ratio, ad_account_id } = req.body;
    res.json(await svc.createLookalike(req.params.id, { country, ratio, ad_account_id }));
  });

  router.delete('/:id', async (req, res) => {
    res.json(await svc.deleteAudience(req.params.id));
  });

  return router;
}
