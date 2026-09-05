import { Router } from 'express';

export function createReportingRouter(reportingRepo) {
  const router = Router();

  // GET /api/reporting/snapshots — get reporting snapshots
  router.get('/snapshots', async (req, res) => {
    try {
      const { startDate, endDate, platforms, groupBy } = req.query;
      const snapshots = reportingRepo.getSnapshots(req.user.id, {
        startDate,
        endDate,
        platforms: platforms ? platforms.split(',') : undefined,
        groupBy,
      });
      res.json({ success: true, data: snapshots });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/reporting/totals — get aggregated totals
  router.get('/totals', async (req, res) => {
    try {
      const { startDate, endDate, platforms } = req.query;
      const totals = reportingRepo.getTotals(req.user.id, {
        startDate,
        endDate,
        platforms: platforms ? platforms.split(',') : undefined,
      });
      res.json({ success: true, data: totals });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/reporting/top-campaigns — get top performing campaigns
  router.get('/top-campaigns', async (req, res) => {
    try {
      const { startDate, endDate, limit } = req.query;
      const campaigns = reportingRepo.getTopCampaigns(req.user.id, {
        startDate,
        endDate,
        limit: parseInt(limit) || 10,
      });
      res.json({ success: true, data: campaigns });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
