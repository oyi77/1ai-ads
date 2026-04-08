/**
 * Auto-Optimizer (Pareto Engine)
 * Evaluates automation rules against campaign performance.
 * Runs on a timer (default: every 6 hours).
 * Actions: pause, scale_up, scale_down budget.
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('auto-optimizer');

export class AutoOptimizer {
  constructor(metaApi, rulesRepo, campaignsRepo) {
    this.meta = metaApi;
    this.rules = rulesRepo;
    this.campaigns = campaignsRepo;
    this._interval = null;
  }

  start(intervalMs = 6 * 60 * 60 * 1000) {
    log.info(`AutoOptimizer started (check every ${intervalMs / 1000 / 60}min)`);
    this._interval = setInterval(() => this.evaluate().catch(e => log.error('AutoOptimizer error', { message: e.message })), intervalMs);
    // Also run once on start (after 30s delay to let server boot)
    setTimeout(() => this.evaluate().catch(e => log.error('AutoOptimizer initial error', { message: e.message })), 30000);
  }

  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  async evaluate() {
    const activeRules = this.rules.findActive();
    if (activeRules.length === 0) return { checked: 0, triggered: 0 };

    const results = [];

    for (const rule of activeRules) {
      try {
        // Get latest campaign insights
        let insights;
        try {
          insights = await this.meta.getCampaignInsights(rule.campaign_id, { datePreset: 'last_7d' });
        } catch {
          continue; // Skip if can't get insights (token expired, etc)
        }

        if (!insights) continue;

        // Get the metric value
        const metricValue = this._getMetricValue(insights, rule.condition_metric);
        if (metricValue === null) continue;

        // Evaluate condition
        const triggered = this._evaluateCondition(metricValue, rule.condition_operator, rule.condition_value);

        if (triggered) {
          // Execute action
          const actionResult = await this._executeAction(rule.campaign_id, rule.action, rule.action_value, insights);
          this.rules.markTriggered(rule.id);
          results.push({ rule: rule.name, campaign: rule.campaign_id, metric: rule.condition_metric, value: metricValue, action: rule.action, result: actionResult });
        }
      } catch (err) {
        results.push({ rule: rule.name, error: err.message });
      }
    }

    log.info(`AutoOptimizer: checked ${activeRules.length} rules, triggered ${results.filter(r => !r.error).length}`);
    return { checked: activeRules.length, triggered: results.length, results };
  }

  _getMetricValue(insights, metric) {
    const map = {
      'cpc': insights.cpc,
      'ctr': insights.ctr,
      'cpa': insights.spend > 0 && insights.conversions > 0 ? insights.spend / insights.conversions : null,
      'roas': null, // Would need revenue data
      'spend': insights.spend,
      'impressions': insights.impressions,
      'clicks': insights.clicks,
    };
    return map[metric] !== undefined ? map[metric] : null;
  }

  _evaluateCondition(value, operator, threshold) {
    if (value === null) return false;
    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      default: return false;
    }
  }

  async _executeAction(campaignId, action, actionValue, insights) {
    switch (action) {
      case 'pause':
        await this.meta.updateCampaign(campaignId, { status: 'PAUSED' });
        return { action: 'paused', campaignId };

      case 'scale_up': {
        const currentBudget = insights.spend / 7; // Approximate daily from weekly
        const increase = actionValue || 20; // Default 20% increase
        const newBudget = Math.round(currentBudget * (1 + increase / 100));
        await this.meta.updateCampaign(campaignId, { dailyBudget: newBudget });
        return { action: 'scale_up', from: currentBudget, to: newBudget };
      }

      case 'scale_down': {
        const currentBudget = insights.spend / 7;
        const decrease = actionValue || 20;
        const newBudget = Math.max(10000, Math.round(currentBudget * (1 - decrease / 100)));
        await this.meta.updateCampaign(campaignId, { dailyBudget: newBudget });
        return { action: 'scale_down', from: currentBudget, to: newBudget };
      }

      case 'alert':
        log.info(`ALERT: Campaign ${campaignId} triggered rule`);
        return { action: 'alert', campaignId };

      default:
        return { action: 'unknown' };
    }
  }
}
