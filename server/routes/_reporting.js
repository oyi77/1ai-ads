import { Router } from 'express';
import { createUnifiedReportingRouter } from './unified-reporting.js';
import { createDashboardWidgetsRouter } from './dashboard-widgets.js';
import { createAnalyticsRouter } from './analytics.js';
import { createAttributionRouter } from './attribution.js';
import { createRealtimeRouter } from './realtime.js';
import { createCompetitorSpyRouter } from './competitor-spy.js';
import { createCampaignMonitorRouter } from './campaign-monitor.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePlan } from '../middleware/rbac.js';

export function createReportingGroupRouter({ repos, services }) {
  const router = Router();
  router.use('/reporting/unified', requireAuth, createUnifiedReportingRouter(services.unifiedReporter));
  router.use('/reporting/widgets', requireAuth, createDashboardWidgetsRouter(services.dashboardWidgetsRepo));
  router.use('/analytics', requireAuth, createAnalyticsRouter(repos.campaignsRepo));
  router.use('/attribution', requireAuth, requirePlan('pro'), createAttributionRouter(services.attributionService, repos.attributionRepo));
  router.use('/realtime', requireAuth, createRealtimeRouter(services.realtimeService));

  // Detailed per-account report with AI recommendations (per-user scoped token)
  router.get('/reporting/accounts/:accountId/report', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      const acct = repos.platformAccountsRepo.getByPlatform(userId, 'meta');
      if (!acct?.access_token) {
        return res.status(400).json({ success: false, error: 'Meta account is not connected. Connect it in Settings first.' });
      }
      const { MetaAdsAPI } = await import('../services/meta/index.js');
      const api = MetaAdsAPI.withToken(acct.access_token);
      // Verify the account actually belongs to this token (tenant isolation)
      const accounts = await api.getAdAccounts();
      const owned = accounts.find(a => String(a.id).replace(/^act_/, '') === String(req.params.accountId).replace(/^act_/, ''));
      if (!owned) return res.status(404).json({ success: false, error: 'Account not found for your Meta token' });
      const report = await services.accountReportService.buildReport(api, owned.id, owned.name);
      res.json({ success: true, data: report });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });
  router.use('/competitor-spy', requireAuth, createCompetitorSpyRouter(repos.competitorsRepo, services.adIntelligenceService, services.competitorSpyService));
  router.use('/campaign-monitor', requireAuth, createCampaignMonitorRouter(services.campaignMonitorService, repos));

  // CSV Export — download campaign data as CSV
  router.get('/reports/export/csv', requireAuth, (req, res) => {
    const result = repos.campaignsRepo?.findAll?.() || [];
    const campaigns = Array.isArray(result) ? result : (result.data || []);
    const header = 'Name,Status,Spend,Revenue,ROAS,Impressions,Clicks,Conversions';
    const rows = campaigns.map(c => {
      const spend = c.spend || 0;
      const revenue = c.revenue || 0;
      const roas = spend > 0 ? (revenue / spend).toFixed(2) : '0.00';
      return `"${(c.name || '').replace(/"/g, '""')}",${c.status || ''},${spend},${revenue},${roas},${c.impressions || 0},${c.clicks || 0},${c.conversions || 0}`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=report.csv');
    res.send([header, ...rows].join('\n'));
  });

  return router;
}
