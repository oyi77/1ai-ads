import { Router } from 'express';
import { ABTestService } from '../services/ab-test-service.js';

export function createABTestsRouter(metaApi) {
  const router = Router();
  const svc = new ABTestService(metaApi);

  router.post('/', async (req, res) => {
    try {
      const result = await svc.createTest(req.body);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/', async (_req, res) => {
    try {
      const result = await svc.getTests();
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/:id', async (req, res) => {
    try {
      const result = await svc.getTest(req.params.id);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/start', async (req, res) => {
    try {
      const result = await svc.startTest(req.params.id);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/stop', async (req, res) => {
    try {
      const result = await svc.stopTest(req.params.id);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post('/:id/winner', async (req, res) => {
    try {
      const { winner_id } = req.body;
      if (!winner_id) return res.status(400).json({ error: 'winner_id required' });
      const result = await svc.updateWinner(req.params.id, winner_id);
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}
