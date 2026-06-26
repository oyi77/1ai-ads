import { Router } from 'express';

export function createCapiRouter(capiMonitor) {
  const router = Router();

  router.get('/health/:accountId', async (req, res) => {
    try {
      const data = await capiMonitor.checkHealth(req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/quality/:accountId', async (req, res) => {
    try {
      const data = await capiMonitor.monitorQuality(req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
