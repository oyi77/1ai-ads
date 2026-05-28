import { Router } from 'express';
import { BatchService } from '../services/batch-service.js';

export default function createBatchRouter(metaApi) {
  const router = Router();
  const svc = new BatchService(metaApi);

  router.get('/', (req, res) => {
    res.json({ service: 'batch', endpoints: ['POST /', 'POST /pause', 'POST /activate', 'POST /update-budget'] });
  });

  router.post('/', async (req, res) => {
    try {
      const { requests } = req.body;
      if (!requests?.length) return res.status(400).json({ error: 'requests array required' });
      const result = await svc.batchRequest(requests);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/pause', async (req, res) => {
    try {
      const { ids, entity_type } = req.body;
      if (!ids?.length) return res.status(400).json({ error: 'ids array required' });
      const result = await svc.batchPause(ids, entity_type);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/activate', async (req, res) => {
    try {
      const { ids, entity_type } = req.body;
      if (!ids?.length) return res.status(400).json({ error: 'ids array required' });
      const result = await svc.batchActivate(ids, entity_type);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/update-budget', async (req, res) => {
    try {
      const { updates } = req.body;
      if (!updates?.length) return res.status(400).json({ error: 'updates array required' });
      const result = await svc.batchUpdateBudget(updates);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
