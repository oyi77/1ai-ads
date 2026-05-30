import { Router } from 'express';
import { BatchService } from '../services/batch-service.js';

export default function createBatchRouter(metaApi) {
  const router = Router();
  const svc = new BatchService(metaApi);

  router.get('/', (req, res) => {
    res.json({ service: 'batch', endpoints: ['POST /', 'POST /pause', 'POST /activate', 'POST /update-budget'] });
  });

  router.post('/', async (req, res) => {
    const { requests } = req.body;
    if (!requests?.length) return res.status(400).json({ error: 'requests array required' });
    res.json(await svc.batchRequest(requests));
  });

  router.post('/pause', async (req, res) => {
    const { ids, entity_type } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids array required' });
    res.json(await svc.batchPause(ids, entity_type));
  });

  router.post('/activate', async (req, res) => {
    const { ids, entity_type } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids array required' });
    res.json(await svc.batchActivate(ids, entity_type));
  });

  router.post('/update-budget', async (req, res) => {
    const { updates } = req.body;
    if (!updates?.length) return res.status(400).json({ error: 'updates array required' });
    res.json(await svc.batchUpdateBudget(updates));
  });

  return router;
}
