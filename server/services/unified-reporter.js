import { createLogger } from '../lib/logger.js';
import { MetricsNormalizer } from './metrics-normalizer.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';

const log = createLogger('unified-reporter');

const DATE_RANGE_MAP = {
  'last_1d': 1, 'last_3d': 3, 'last_7d': 7, 'last_14d': 14,
  'last_30d': 30, 'last_60d': 60, 'last_90d': 90,
};

export class UnifiedReporter {
  /**
   * @param {Object} platformApis - { meta, google, tiktok, linkedin, twitter, microsoft, snapchat, pinterest }
   * @param {Object} campaignsRepo
   * @param {Object} db - better-sqlite3 database instance
   * @param {Object} [repos] - { platformAccountsRepo, settingsRepo } used to resolve owner-scoped tokens
   */
  constructor(platformApis, campaignsRepo, db, repos = null) {
    this.apis = platformApis;
    this.campaignsRepo = campaignsRepo;
    this.db = db;
    this.repos = repos;
    this.normalizer = new MetricsNormalizer();
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Aggregated cross-platform dashboard.
   * @param {string} [userId] - when provided, metrics are scoped to that user's performance_history rows
   */
  async getUnifiedDashboard(userId, { dateRange = 'last_7d' } = {}) {
    const days = DATE_RANGE_MAP[dateRange] || 7;

    // Use DB metrics directly — live API calls are too slow for dashboard
    const dbMetrics = this._getDBMetrics(days, userId);

    const totals = { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };
    const byPlatform = [];

    for (const dm of dbMetrics) {
      totals.spend += dm.spend || 0;
      totals.revenue += dm.revenue || 0;
      totals.impressions += dm.impressions || 0;
      totals.clicks += dm.clicks || 0;
      totals.conversions += dm.conversions || 0;
      byPlatform.push({
        platform: dm.platform,
        spend: dm.spend || 0,
        revenue: dm.revenue || 0,
        roas: (dm.spend || 0) > 0 ? (dm.revenue || 0) / (dm.spend || 0) : 0,
        impressions: dm.impressions || 0,
        clicks: dm.clicks || 0,
        conversions: dm.conversions || 0,
        ctr: (dm.impressions || 0) > 0 ? (dm.clicks || 0) / (dm.impressions || 0) : 0,
        cpc: (dm.clicks || 0) > 0 ? (dm.spend || 0) / (dm.clicks || 0) : 0,
        connected: true,
      });
    }

    // Mark platforms without synced metrics as "coming soon"
    for (const key of this.normalizer.platformKeys()) {
      if (!byPlatform.some((p) => p.platform === key)) {
        byPlatform.push({
          platform: key,
          spend: 0,
          revenue: 0,
          roas: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          ctr: 0,
          cpc: 0,
          connected: false,
        });
      }
    }

    const overallROAS = totals.spend > 0 ? totals.revenue / totals.spend : 0;

    return {
      totals: { ...totals, overallROAS },
      byPlatform,
      dateRange,
      days,
    };
  }

  /**
   * Compare campaigns across platforms, normalised to a common schema.
   * @param {string} [userId] - when provided, each campaign is resolved only if owned by the user
   */
  async compareCampaigns(campaignIds, { metric = 'roas' } = {}, userId) {
    if (!campaignIds || !campaignIds.length) return [];

    const results = [];
    for (const id of campaignIds) {
      const campaign = this.campaignsRepo?.findById?.(id, userId);
      if (!campaign) continue;

      try {
        const platform = campaign.platform;
        const api = this.apis[platform];
        let insights = null;

        if (api) {
          if (platform === 'meta') {
            insights = await api.getCampaignInsights(id);
          } else if (platform === 'google') {
            // Google returns cost_micros; getCampaignPerformance needs customerId
            const perf = await api.getCampaignPerformance(campaign.account_id || id, { days: 30 });
            const match = Array.isArray(perf) ? perf.find(p => p.campaignId === id || p.id === id) : null;
            if (match) {
              insights = {
                spend: (match.costMicros || 0) / 1_000_000,
                impressions: match.impressions || 0,
                clicks: match.clicks || 0,
                conversions: match.conversions || 0,
                ctr: match.ctr || 0,
                cpc: match.averageCpc ? match.averageCpc / 1_000_000 : 0,
              };
            }
          } else if (platform === 'tiktok') {
            const data = await api.getCampaignInsights(campaign.account_id || '', [id]);
            insights = Array.isArray(data) ? data[0] : data;
          } else if (platform === 'linkedin') {
            const data = await api.getCampaignAnalytics(campaign.account_id || '');
            const match = Array.isArray(data) ? data.find(d => d.campaignId === id) : null;
            if (match) insights = match;
          }
        }

        const spend = insights?.spend || campaign.spend || 0;
        const revenue = insights?.revenue || campaign.revenue || 0;
        const impressions = insights?.impressions || campaign.impressions || 0;
        const clicks = insights?.clicks || campaign.clicks || 0;
        const conversions = insights?.conversions || campaign.conversions || 0;

        results.push({
          campaignId: id,
          platform,
          name: campaign.name,
          spend,
          revenue,
          impressions,
          clicks,
          conversions,
          ctr: impressions > 0 ? clicks / impressions : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          roas: spend > 0 ? revenue / spend : 0,
        });
      } catch (err) {
        log.warn('compareCampaigns: failed to fetch insights', { id, error: err.message });
        results.push({
          campaignId: id,
          platform: campaign.platform,
          name: campaign.name,
          spend: campaign.spend || 0,
          revenue: campaign.revenue || 0,
          impressions: campaign.impressions || 0,
          clicks: campaign.clicks || 0,
          conversions: campaign.conversions || 0,
          ctr: 0, cpc: 0, roas: 0,
          error: err.message,
        });
      }
    }

    const sortKey = metric === 'roas' ? 'roas' : metric;
    results.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
    return results;
  }

  /**
   * AI-driven budget allocation recommendation based on historical ROAS.
   * @param {string} [userId] - when provided, only the user's performance_history is considered
   */
  async recommendBudgetAllocation(userId, totalBudget) {
    if (!totalBudget || totalBudget <= 0) {
      throw new Error('totalBudget must be a positive number');
    }

    const platformResults = await this._fetchAllPlatformInsights(30, userId);

    const platformROAS = platformResults.map(r => ({
      platform: r.platform,
      spend: r.spend,
      revenue: r.revenue,
      roas: r.spend > 0 ? r.revenue / r.spend : 0,
    })).filter(r => r.spend > 0);

    if (!platformROAS.length) {
      // No historical data — split equally across connected platforms
      const connected = Object.keys(this.apis).filter(k => this.apis[k]);
      const perPlatform = connected.length ? totalBudget / connected.length : totalBudget;
      return {
        totalBudget,
        allocations: (connected.length ? connected : ['meta']).map(p => ({
          platform: p,
          recommendedBudget: perPlatform,
          expectedROAS: 0,
          reasoning: 'No historical data; equal distribution.',
        })),
      };
    }

    // Allocate proportionally to ROAS with floor 10%, ceiling 50%
    const totalROAS = platformROAS.reduce((s, r) => s + r.roas, 0);
    const allocations = platformROAS.map(r => {
      let share = totalROAS > 0 ? r.roas / totalROAS : 0;
      share = Math.max(0.10, Math.min(0.50, share));
      return {
        platform: r.platform,
        rawShare: totalROAS > 0 ? r.roas / totalROAS : 0,
        clampedShare: share,
        expectedROAS: r.roas,
      };
    });

    // Re-normalise clamped shares to sum to 1
    const totalClamped = allocations.reduce((s, a) => s + a.clampedShare, 0);

    return {
      totalBudget,
      allocations: allocations.map(a => ({
        platform: a.platform,
        recommendedBudget: Math.round((a.clampedShare / totalClamped) * totalBudget * 100) / 100,
        expectedROAS: Math.round(a.expectedROAS * 100) / 100,
        reasoning: a.clampedShare > a.rawShare
          ? 'Budget floor applied (historical ROAS below proportional share).'
          : a.clampedShare < a.rawShare
            ? 'Budget ceiling applied (high ROAS platform capped).'
            : 'Proportional to historical ROAS.',
      })),
    };
  }

  /**
   * Time-series data for charts.
   * @param {string} [userId] - when provided, rows are scoped to that user's performance_history
   */
  async getTimeSeries({ metric = 'spend', granularity: _granularity = 'daily', days = 30 } = {}, userId) {
    const validMetric = ['spend', 'revenue', 'impressions', 'clicks', 'conversions'].includes(metric)
      ? metric : 'spend';

    try {
      const rows = this.db.prepare(`
        SELECT
          DATE(created_at) AS date,
          platform,
          SUM(${validMetric}) AS value
        FROM performance_history
        WHERE created_at >= DATE('now', '-${days} days')
        ${userId ? "AND user_id = ?" : ""}
        GROUP BY DATE(created_at), platform
        ORDER BY date ASC
      `).all(...(userId ? [userId] : []));

      return rows.map(r => ({ date: r.date, platform: r.platform, value: r.value || 0 }));
    } catch (err) {
      log.warn('getTimeSeries: query failed, returning empty', { error: err.message });
      return [];
    }
  }

  // ── Internal helpers ─────────────────────────────────────────

  async _fetchAllPlatformInsights(days, userId) {
    const datePreset = days <= 1 ? 'last_1d' : days <= 7 ? 'last_7d' : days <= 30 ? 'last_30d' : 'last_90d';
    const results = [];

    // When a userId is supplied, resolve the owner-scoped meta API so live
    // insights reflect only that user's connected account (never the system token).
    const liveApis = (userId && this.repos)
      ? { meta: resolveOwnerPlatformToken('meta', userId, this.repos) }
      : this.apis;

    for (const [platform, api] of Object.entries(liveApis)) {
      if (!api) continue;
      try {
        const insights = await this._fetchPlatformInsights(api, platform, days, datePreset);
        results.push({ platform, ...insights });
      } catch (err) {
        log.warn('_fetchAllPlatformInsights: skipped platform', { platform, error: err.message });
        results.push({
          platform, spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Platform-specific insight fetching with dispatch.
   */
  async _fetchPlatformInsights(api, platform, days, datePreset) {
    const empty = { spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0 };

    if (platform === 'meta') {
      try {
        const accounts = await api.getAdAccounts();
        if (!accounts?.length) return empty;

        const total = { ...empty };
        for (const acct of accounts) {
          try {
            const data = await api.getAccountInsights(acct.id, { datePreset });
            const n = this.normalizer.normalizePlatformStats('meta', data);
            total.spend += n.spend;
            total.revenue += n.revenue;
            total.impressions += n.impressions;
            total.clicks += n.clicks;
            total.conversions += n.conversions;
          } catch { /* per-account error, continue */ }
        }
        return total;
      } catch {
        return empty;
      }
    }

    if (platform === 'google') {
      try {
        const accounts = await api.listAccounts();
        if (!accounts?.length) return empty;

        const total = { ...empty };
        for (const acct of accounts) {
          try {
            const perf = await api.getCampaignPerformance(acct.id || acct, { days });
            if (Array.isArray(perf)) {
              for (const row of perf) {
                const n = this.normalizer.normalizePlatformStats('google', row);
                total.spend += n.spend;
                total.revenue += n.revenue;
                total.impressions += n.impressions;
                total.clicks += n.clicks;
                total.conversions += n.conversions;
              }
            }
          } catch { /* per-account */ }
        }
        return total;
      } catch {
        return empty;
      }
    }

    if (platform === 'tiktok') {
      try {
        const accounts = await api.syncAllAccounts();
        if (!accounts?.length) return empty;

        const total = { ...empty };
        for (const acct of accounts) {
          try {
            const advId = acct.advertiserId || acct.id;
            const insights = await api.getCampaignInsights(advId, [], { startDate: null, endDate: null });
            if (Array.isArray(insights)) {
              for (const row of insights) {
                const n = this.normalizer.normalizePlatformStats('tiktok', row);
                total.spend += n.spend;
                total.revenue += n.revenue;
                total.impressions += n.impressions;
                total.clicks += n.clicks;
                total.conversions += n.conversions;
              }
            }
          } catch { /* per-account */ }
        }
        return total;
      } catch {
        return empty;
      }
    }

    if (platform === 'linkedin') {
      try {
        const accounts = await api.getAccounts();
        if (!accounts?.length) return empty;

        const total = { ...empty };
        for (const acct of accounts) {
          try {
            const analytics = await api.getCampaignAnalytics(acct.id || acct);
            if (Array.isArray(analytics)) {
              for (const row of analytics) {
                const n = this.normalizer.normalizePlatformStats('linkedin', row);
                total.spend += n.spend;
                total.revenue += n.revenue;
                total.impressions += n.impressions;
                total.clicks += n.clicks;
                total.conversions += n.conversions;
              }
            }
          } catch { /* per-account */ }
        }
        return total;
      } catch {
        return empty;
      }
    }

    // Other platforms: gracefully return empty
    return empty;
  }

  /**
   * Fetch aggregated metrics from the DB for platforms that may not be live-connected.
   * @param {number} days
   * @param {string} [userId] - when provided, only that user's performance_history rows are aggregated
   */
  _getDBMetrics(days, userId) {
    try {
      return this.db.prepare(`
        SELECT platform,
               SUM(spend) AS spend,
               SUM(revenue) AS revenue,
               SUM(impressions) AS impressions,
               SUM(clicks) AS clicks,
               SUM(conversions) AS conversions
        FROM performance_history
        WHERE created_at >= DATE('now', '-${days} days')
        ${userId ? "AND user_id = ?" : ""}
        GROUP BY platform
      `).all(...(userId ? [userId] : []));
    } catch (err) {
      log.debug('_getDBMetrics: table may not exist', { error: err.message });
      return [];
    }
  }
}
