import { Router } from 'express';
import { ABTestService } from '../services/ab-test-service.js';

export function createABTestsRouter(metaApi) {
  const router = Router();
  const svc = new ABTestService(metaApi);

  router.post('/', async (req, res) => {
    res.json(await svc.createTest(req.body));
  });

  router.get('/', async (_req, res) => {
    res.json(await svc.getTests());
  });

  router.get('/:id', async (req, res) => {
    res.json(await svc.getTest(req.params.id));
  });

  router.post('/:id/start', async (req, res) => {
    res.json(await svc.startTest(req.params.id));
  });

  router.post('/:id/stop', async (req, res) => {
    res.json(await svc.stopTest(req.params.id));
  });

  router.post('/:id/winner', async (req, res) => {
    const { winner_id } = req.body;
    if (!winner_id) return res.status(400).json({ error: 'winner_id required' });
    res.json(await svc.updateWinner(req.params.id, winner_id));
  });

  return router;
}
