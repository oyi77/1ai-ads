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
      const ALLOWED_AW = new Set(['1d_click', '7d_click', '28d_click', '1d_view', '7d_view']);
      const aw = String(req.query.aw || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => ALLOWED_AW.has(s));
      const report = await services.accountReportService.buildReport(api, owned.id, owned.name, {
        sinceDate: req.query.since || null,
        attributionWindows: aw.length ? aw : null,
      });
      res.json({ success: true, data: report });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  // Hour-of-day breakdown (dayparting heatmap) for one owned ad account
  router.get('/reporting/accounts/:accountId/hourly', requireAuth, async (req, res) => {
    try {
      const acct = repos.platformAccountsRepo.getByPlatform(req.user?.id, 'meta');
      if (!acct?.access_token) {
        return res.status(400).json({ success: false, error: 'Meta account is not connected. Connect it in Settings first.' });
      }
      const { MetaAdsAPI } = await import('../services/meta/index.js');
      const api = MetaAdsAPI.withToken(acct.access_token);
      const accounts = await api.getAdAccounts();
      const owned = accounts.find(a => String(a.id).replace(/^act_/, '') === String(req.params.accountId).replace(/^act_/, ''));
      if (!owned) return res.status(404).json({ success: false, error: 'Account not found for your Meta token' });
      const datePreset = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d'].includes(String(req.query.preset)) ? String(req.query.preset) : 'last_7d';
      const hours = await api.getAccountInsightsByHour(owned.id, { datePreset });
      res.json({ success: true, data: { accountId: owned.id, accountName: owned.name, preset: datePreset, hours } });
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  // Custom report builder — pick metrics × windows for one owned account.
  router.post('/reporting/accounts/:accountId/custom', requireAuth, async (req, res) => {
    try {
      const acct = repos.platformAccountsRepo.getByPlatform(req.user?.id, 'meta');
      if (!acct?.access_token) {
        return res.status(400).json({ success: false, error: 'Meta account is not connected.' });
      }
      const { metrics, windows } = req.body || {};
      const ALLOWED_METRICS = ['spend', 'impressions', 'clicks', 'linkClicks', 'ctr', 'cpc', 'purchases', 'cpr', 'revenue', 'roas'];
      const ALLOWED_WINDOWS = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d'];
      if (!Array.isArray(metrics) || !metrics.length || metrics.some(m => !ALLOWED_METRICS.includes(m))) {
        return res.status(400).json({ success: false, error: `metrics must be a non-empty subset of: ${ALLOWED_METRICS.join(', ')}` });
      }
      const wins = (Array.isArray(windows) && windows.length ? windows : ['today']).filter(w => ALLOWED_WINDOWS.includes(w));
      if (!wins.length) return res.status(400).json({ success: false, error: `windows must be a subset of: ${ALLOWED_WINDOWS.join(', ')}` });

      const { MetaAdsAPI } = await import('../services/meta/index.js');
      const api = MetaAdsAPI.withToken(acct.access_token);
      const accounts = await api.getAdAccounts();
      const owned = accounts.find(a => String(a.id).replace(/^act_/, '') === String(req.params.accountId).replace(/^act_/, ''));
      if (!owned) return res.status(404).json({ success: false, error: 'Account not found for your Meta token' });

      const results = {};
      for (const w of wins) {
        const ins = await api.getAccountInsights(owned.id, { datePreset: w }).catch(() => null);
        const row = {};
        // derive the same metric names as AccountReportService.derive
        const spend = Number(ins?.spend || 0);
        const purchases = Number(ins?.conversions || 0);
        const revenue = Number(ins?.revenue || 0);
        for (const m of metrics) {
          switch (m) {
            case 'spend': row.spend = spend; break;
            case 'impressions': row.impressions = Number(ins?.impressions || 0); break;
            case 'clicks': row.clicks = Number(ins?.clicks || 0); break;
            case 'linkClicks': row.linkClicks = Number(ins?.linkClicks || 0); break;
            case 'ctr': row.ctr = Number(ins?.ctr || 0); break;
            case 'cpc': row.cpc = Number(ins?.cpc || 0); break;
            case 'purchases': row.purchases = purchases; break;
            case 'cpr': row.cpr = purchases > 0 ? spend / purchases : null; break;
            case 'revenue': row.revenue = revenue; break;
            case 'roas': row.roas = spend > 0 ? revenue / spend : null; break;
          }
        }
        results[w] = row;
      }
      res.json({ success: true, data: { accountId: owned.id, accountName: owned.name, metrics, windows: wins, results } });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  });
  router.use('/competitor-spy', requireAuth, createCompetitorSpyRouter(repos.competitorsRepo, services.adIntelligenceService, services.competitorSpyService));
  router.use('/campaign-monitor', requireAuth, createCampaignMonitorRouter(services.campaignMonitorService, repos));

  // CSV Export — download campaign data as CSV
  router.get('/reports/export/csv', requireAuth, (req, res) => {
    const result = repos.campaignsRepo?.findAll?.({ userId: req.user?.id }) || [];
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
