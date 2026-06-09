import { Router } from 'express';

export function createCampaignMonitorRouter(campaignMonitorService) {
  const router = Router();

  // GET /api/campaign-monitor/:accountId/status
  router.get('/:accountId/status', async (req, res) => {
    try {
      const data = await campaignMonitorService.getAccountStatus(req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/campaign-monitor/:accountId/health
  router.get('/:accountId/health', async (req, res) => {
    try {
      const data = await campaignMonitorService.getAccountHealth(req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/campaign-monitor/:accountId/alerts
  router.get('/:accountId/alerts', async (req, res) => {
    try {
      const data = await campaignMonitorService.getAlerts(req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/campaign-monitor/:accountId/trend?days=7
  router.get('/:accountId/trend', async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 7;
      const data = await campaignMonitorService.getPerformanceTrend(req.params.accountId, days);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/campaign-monitor/:accountId/auto-pause-check
  router.post('/:accountId/auto-pause-check', async (req, res) => {
    try {
      const data = await campaignMonitorService.autoPauseCheck(req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
