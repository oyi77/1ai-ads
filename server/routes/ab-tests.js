import { Router } from 'express';

export function createABTestsRouter(abTestService) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const test = await abTestService.createTest({ ...req.body, userId: req.user?.id });
      res.json({ success: true, data: test });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const result = await abTestService.getTests({ page: +page, limit: +limit, userId: req.user?.id });
      res.json({ success: true, data: result.data, total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });


  router.get('/:id', async (req, res) => {
    try {
      const test = await abTestService.getTest(req.params.id, req.user?.id);
      res.json({ success: true, data: test });
    } catch (err) {
      res.status(404).json({ success: false, error: err.message });
    }
  });

  router.post('/:id/start', async (req, res) => {
    try {
      const test = await abTestService.startTest(req.params.id, req.user?.id);
      res.json({ success: true, data: test });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/:id/stop', async (req, res) => {
    try {
      const test = await abTestService.stopTest(req.params.id, req.user?.id);
      res.json({ success: true, data: test });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/:id/winner', async (req, res) => {
    try {
      const { winner_id } = req.body;
      if (!winner_id) return res.status(400).json({ success: false, error: 'winner_id required' });
      const test = await abTestService.updateWinner(req.params.id, winner_id, req.user?.id);
      res.json({ success: true, data: test });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
