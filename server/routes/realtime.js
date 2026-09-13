import { Router } from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('realtime-route');

export function createRealtimeRouter(realtimeService) {
  const router = Router();

  // GET /api/realtime/metrics — REST fallback, scoped to the caller's campaigns
  router.get('/metrics', (req, res) => {
    try {
      const metrics = realtimeService.getMetrics(req.user?.id);
      res.json({ success: true, data: metrics });
    } catch (err) {
      log.error('Failed to get metrics', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/realtime/refresh/:campaignId — refresh OWN campaign only (404 otherwise)
  router.post('/refresh/:campaignId', async (req, res) => {
    try {
      const metric = await realtimeService.refreshCampaign(req.params.campaignId, req.user?.id);
      res.json({ success: true, data: metric });
    } catch (err) {
      log.error('Failed to refresh campaign', { error: err.message });
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  });

  // GET /api/realtime/status — service status
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      data: {
        connected_clients: realtimeService.clients.size,
        tracked_campaigns: realtimeService.metrics.size,
        polling: !!realtimeService.pollInterval,
        poll_interval_ms: realtimeService.POLL_MS,
      },
    });
  });

  return router;
}
