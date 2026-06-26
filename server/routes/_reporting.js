import { Router } from 'express';
import { createUnifiedReportingRouter } from './unified-reporting.js';
import { createDashboardWidgetsRouter } from './dashboard-widgets.js';
import { createAnalyticsRouter } from './analytics.js';
import { createAttributionRouter } from './attribution.js';
import { createRealtimeRouter } from './realtime.js';
import { createCompetitorSpyRouter } from './competitor-spy.js';
import { createCampaignMonitorRouter } from './campaign-monitor.js';
import { requireAuth } from '../middleware/auth.js';

export function createReportingGroupRouter({ repos, services }) {
  const router = Router();
  router.use('/reporting/unified', requireAuth, createUnifiedReportingRouter(services.unifiedReporter));
  router.use('/reporting/widgets', requireAuth, createDashboardWidgetsRouter(services.dashboardWidgetsRepo));
  router.use('/analytics', requireAuth, createAnalyticsRouter(repos.campaignsRepo));
  router.use('/attribution', requireAuth, createAttributionRouter(services.attributionService, repos.attributionRepo));
  router.use('/realtime', requireAuth, createRealtimeRouter(services.realtimeService));
  router.use('/competitor-spy', requireAuth, createCompetitorSpyRouter(repos.competitorsRepo, services.adIntelligenceService, services.competitorSpyService));
  router.use('/campaign-monitor', requireAuth, createCampaignMonitorRouter(services.campaignMonitorService));
  return router;
}
