import { createLogger } from '../lib/logger.js';

const log = createLogger('campaign-monitor');

// Alert thresholds — configurable via settingsRepo if needed
const DEFAULTS = {
  ctrThreshold: 0.5,        // CTR below 0.5% is warning
  cpaThreshold: 50000,      // CPA above 50k IDR is warning (cents)
  budgetExhaustedRatio: 0.95,
  zeroImpressionHours: 24,
  autoPauseSpendMultiplier: 2,
};

export class CampaignMonitorService {
  /**
   * @param {import('./meta/index.js').MetaAdsAPI} metaApi
   * @param {object} campaignsRepo
   * @param {object} settingsRepo
   */
  constructor(metaApi, campaignsRepo, settingsRepo) {
    this.metaApi = metaApi;
    this.campaignsRepo = campaignsRepo;
    this.settingsRepo = settingsRepo;
  }

  /**
   * Fetch current campaign status for an ad account.
   */
  async getAccountStatus(accountId) {
    try {
      const campaigns = await this.metaApi.getCampaigns(accountId);
      const active = campaigns.filter(c => c.status === 'active');
      const paused = campaigns.filter(c => c.status === 'paused');

      // Get today's and this week's spend from account insights
      const [todayInsights, weekInsights] = await Promise.all([
        this.metaApi.getAccountInsights(accountId, { datePreset: 'today' }).catch(() => null),
        this.metaApi.getAccountInsights(accountId, { datePreset: 'this_week' }).catch(() => null),
      ]);

      const alerts = await this._detectStatusAlerts(campaigns);

      return {
        accountId,
        activeCampaigns: active.length,
        pausedCampaigns: paused.length,
        totalCampaigns: campaigns.length,
        campaigns: campaigns.map(c => ({ id: c.id, name: c.name, status: c.status, objective: c.objective })),
        spendToday: todayInsights?.spend ?? 0,
        spendThisWeek: weekInsights?.spend ?? 0,
        impressionsToday: todayInsights?.impressions ?? 0,
        clicksToday: todayInsights?.clicks ?? 0,
        alerts,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      log.warn('getAccountStatus failed, returning empty', { accountId, error: err.message });
      return this._emptyStatus(accountId);
    }
  }

  /**
   * Return health score (0-100) based on multiple signals.
   */
  async getAccountHealth(accountId) {
    try {
      const [campaigns, todayInsights, weekInsights] = await Promise.all([
        this.metaApi.getCampaigns(accountId),
        this.metaApi.getAccountInsights(accountId, { datePreset: 'today' }).catch(() => null),
        this.metaApi.getAccountInsights(accountId, { datePreset: 'this_week' }).catch(() => null),
      ]);

      let score = 100;
      const factors = [];

      // 1. Spend vs budget ratio
      const activeCampaigns = campaigns.filter(c => c.status === 'active');
      const totalDailyBudget = activeCampaigns.reduce((sum, c) => sum + (c.dailyBudget || 0), 0);
      if (totalDailyBudget > 0 && todayInsights) {
        const ratio = (todayInsights.spend * 100) / totalDailyBudget; // spend is in currency, budget in cents
        if (ratio > DEFAULTS.budgetExhaustedRatio * 100) {
          score -= 15;
          factors.push({ name: 'Budget nearly exhausted', impact: -15, detail: `${ratio.toFixed(0)}% of daily budget used` });
        }
      }

      // 2. CTR trend
      if (todayInsights && weekInsights) {
        const dailyCtr = todayInsights.ctr || 0;
        const weeklyCtr = weekInsights.ctr || 0;
        if (dailyCtr < DEFAULTS.ctrThreshold) {
          score -= 20;
          factors.push({ name: 'Low CTR today', impact: -20, detail: `${dailyCtr.toFixed(2)}% (threshold: ${DEFAULTS.ctrThreshold}%)` });
        } else if (weeklyCtr > 0 && dailyCtr < weeklyCtr * 0.7) {
          score -= 10;
          factors.push({ name: 'CTR declining', impact: -10, detail: `Today ${dailyCtr.toFixed(2)}% vs Week avg ${weeklyCtr.toFixed(2)}%` });
        }
      }

      // 3. CPA trend
      if (todayInsights) {
        const conversions = todayInsights.conversions || 0;
        if (conversions > 0) {
          const cpa = (todayInsights.spend * 100) / conversions; // cents per conversion
          if (cpa > DEFAULTS.cpaThreshold) {
            score -= 20;
            factors.push({ name: 'High CPA', impact: -20, detail: `${Math.round(cpa)} cents/conversion` });
          }
        } else if (todayInsights.spend > 0) {
          score -= 25;
          factors.push({ name: 'No conversions with spend', impact: -25, detail: `${todayInsights.spend} spent, 0 conversions` });
        }
      }

      // 4. Conversion rate
      if (todayInsights) {
        const clicks = todayInsights.clicks || 0;
        const conversions = todayInsights.conversions || 0;
        if (clicks > 10 && conversions === 0) {
          score -= 15;
          factors.push({ name: 'Zero conversion rate', impact: -15, detail: `${clicks} clicks, 0 conversions` });
        }
      }

      // 5. Paused campaigns penalty
      const pausedCount = campaigns.filter(c => c.status === 'paused').length;
      if (pausedCount > activeCampaigns.length && activeCampaigns.length > 0) {
        score -= 5;
        factors.push({ name: 'Many paused campaigns', impact: -5, detail: `${pausedCount} paused vs ${activeCampaigns.length} active` });
      }

      score = Math.max(0, Math.min(100, score));

      return {
        accountId,
        score,
        grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
        factors,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      log.warn('getAccountHealth failed', { accountId, error: err.message });
      return { accountId, score: 0, grade: 'N/A', factors: [{ name: 'API unavailable', impact: 0, detail: err.message }], fetchedAt: new Date().toISOString() };
    }
  }

  /**
   * Check for campaigns that need attention.
   */
  async getAlerts(accountId) {
    try {
      const campaigns = await this.metaApi.getCampaigns(accountId);
      const alerts = [];

      for (const campaign of campaigns) {
        if (campaign.status !== 'active') continue;

        let insights = null;
        try {
          insights = await this.metaApi.getCampaignInsights(campaign.id, { datePreset: 'today' });
        } catch { /* no insights */ }

        // Campaign exceeding daily budget
        if (campaign.dailyBudget > 0 && insights && insights.spend * 100 > campaign.dailyBudget) {
          alerts.push({
            severity: 'critical',
            type: 'budget_exceeded',
            campaignId: campaign.id,
            campaignName: campaign.name,
            message: `Spend (${insights.spend}) exceeds daily budget (${(campaign.dailyBudget / 100).toFixed(0)})`,
            spend: insights.spend,
            budget: campaign.dailyBudget / 100,
          });
        }

        // 0 impressions in 24h
        if (insights && insights.impressions === 0) {
          alerts.push({
            severity: 'warning',
            type: 'zero_impressions',
            campaignId: campaign.id,
            campaignName: campaign.name,
            message: 'Active campaign has 0 impressions today',
          });
        }

        // Low CTR
        if (insights && insights.ctr > 0 && insights.ctr < DEFAULTS.ctrThreshold) {
          alerts.push({
            severity: 'warning',
            type: 'low_ctr',
            campaignId: campaign.id,
            campaignName: campaign.name,
            message: `CTR ${insights.ctr.toFixed(2)}% is below ${DEFAULTS.ctrThreshold}% threshold`,
            ctr: insights.ctr,
            threshold: DEFAULTS.ctrThreshold,
          });
        }

        // High CPA
        if (insights && insights.conversions > 0) {
          const cpa = (insights.spend * 100) / insights.conversions;
          if (cpa > DEFAULTS.cpaThreshold) {
            alerts.push({
              severity: 'warning',
              type: 'high_cpa',
              campaignId: campaign.id,
              campaignName: campaign.name,
              message: `CPA ${Math.round(cpa)} cents exceeds ${DEFAULTS.cpaThreshold} threshold`,
              cpa,
              threshold: DEFAULTS.cpaThreshold,
            });
          }
        }

        // Budget exhausted (spent > 95% of budget)
        if (campaign.dailyBudget > 0 && insights && (insights.spend * 100) / campaign.dailyBudget >= DEFAULTS.budgetExhaustedRatio) {
          alerts.push({
            severity: 'info',
            type: 'budget_exhausted',
            campaignId: campaign.id,
            campaignName: campaign.name,
            message: `Budget ${((insights.spend * 100 / campaign.dailyBudget) * 100).toFixed(0)}% exhausted`,
          });
        }
      }

      return { accountId, alerts, count: alerts.length, fetchedAt: new Date().toISOString() };
    } catch (err) {
      log.warn('getAlerts failed', { accountId, error: err.message });
      return { accountId, alerts: [], count: 0, error: err.message, fetchedAt: new Date().toISOString() };
    }
  }

  /**
   * Daily performance trend for the last N days.
   */
  async getPerformanceTrend(accountId, days = 7) {
    try {
      // Meta insights with time_increment gives daily breakdown
      const data = await this.metaApi._get(`/${accountId}/insights`, {
        fields: 'spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type',
        time_increment: '1',
        date_preset: days <= 7 ? 'last_7d' : days <= 30 ? 'last_30d' : 'last_90d',
        limit: String(days),
      });

      const daily = (data.data || []).map(row => {
        const actions = {};
        for (const a of (row.actions || [])) {
          actions[a.action_type] = parseInt(a.value);
        }
        return {
          date: row.date_start,
          spend: parseFloat(row.spend || 0),
          impressions: parseInt(row.impressions || 0),
          clicks: parseInt(row.clicks || 0),
          ctr: parseFloat(row.ctr || 0),
          cpc: parseFloat(row.cpc || 0),
          conversions: actions.onsite_conversion?.total_messaging_connection || actions.purchase || 0,
        };
      });

      return { accountId, days, daily, fetchedAt: new Date().toISOString() };
    } catch (err) {
      log.warn('getPerformanceTrend failed', { accountId, error: err.message });
      return { accountId, days, daily: [], error: err.message, fetchedAt: new Date().toISOString() };
    }
  }

  /**
   * Check if any campaigns should be auto-paused:
   * spend > 2x daily budget with 0 conversions.
   */
  async autoPauseCheck(accountId) {
    try {
      const campaigns = await this.metaApi.getCampaigns(accountId);
      const toPause = [];

      for (const campaign of campaigns) {
        if (campaign.status !== 'active' || !campaign.dailyBudget) continue;

        let insights = null;
        try {
          insights = await this.metaApi.getCampaignInsights(campaign.id, { datePreset: 'today' });
        } catch { continue; }

        if (!insights) continue;

        const spendCents = insights.spend * 100; // Meta returns spend in currency units
        const conversions = insights.conversions || 0;
        const threshold = campaign.dailyBudget * DEFAULTS.autoPauseSpendMultiplier;

        if (spendCents > threshold && conversions === 0) {
          toPause.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            spend: insights.spend,
            dailyBudget: campaign.dailyBudget / 100,
            conversions,
            reason: `Spend ${insights.spend} > ${DEFAULTS.autoPauseSpendMultiplier}x daily budget (${(campaign.dailyBudget / 100).toFixed(0)}) with 0 conversions`,
          });
        }
      }

      return {
        accountId,
        shouldPause: toPause.length > 0,
        campaigns: toPause,
        count: toPause.length,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      log.warn('autoPauseCheck failed', { accountId, error: err.message });
      return { accountId, shouldPause: false, campaigns: [], count: 0, error: err.message, fetchedAt: new Date().toISOString() };
    }
  }

  async _detectStatusAlerts(campaigns) {
    const alerts = [];
    const active = campaigns.filter(c => c.status === 'active');
    if (active.length === 0) {
      alerts.push({ severity: 'warning', type: 'no_active_campaigns', message: 'No active campaigns running' });
    }
    return alerts;
  }

  _emptyStatus(accountId) {
    return {
      accountId,
      activeCampaigns: 0,
      pausedCampaigns: 0,
      totalCampaigns: 0,
      campaigns: [],
      spendToday: 0,
      spendThisWeek: 0,
      impressionsToday: 0,
      clicksToday: 0,
      alerts: [{ severity: 'info', type: 'api_unavailable', message: 'Meta API not configured or unavailable' }],
      fetchedAt: new Date().toISOString(),
    };
  }
}
