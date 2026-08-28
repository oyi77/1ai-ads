import { Router } from 'express';

export function createUnifiedReportingRouter(unifiedReporter) {
  const router = Router();

  // Aggregated cross-platform dashboard
  router.get('/dashboard', async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const { dateRange } = req.query;
      const result = await unifiedReporter.getUnifiedDashboard(userId, { dateRange });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Campaign comparison
  router.get('/compare', async (req, res) => {
    try {
      const { campaignIds, metric } = req.query;
      const userId = req.user?.id || req.userId;
      const ids = campaignIds ? campaignIds.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (!ids.length) {
        return res.status(400).json({ success: false, error: 'campaignIds query parameter is required' });
      }
      const result = await unifiedReporter.compareCampaigns(ids, { metric }, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Budget allocation recommendation
  router.get('/allocation', async (req, res) => {
    try {
      const userId = req.user?.id || req.userId;
      const totalBudget = parseFloat(req.query.totalBudget || req.query.budget || 0);
      if (!totalBudget || totalBudget <= 0) {
        return res.status(400).json({ success: false, error: 'totalBudget query parameter is required (positive number)' });
      }
      const result = await unifiedReporter.recommendBudgetAllocation(userId, totalBudget);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Time-series chart data
  router.get('/timeseries', async (req, res) => {
    try {
      const { metric, granularity, days } = req.query;
      const userId = req.user?.id || req.userId;
      const result = await unifiedReporter.getTimeSeries({
        metric,
        granularity,
        days: days ? parseInt(days, 10) : undefined,
      }, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
