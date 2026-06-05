/**
 * Auto-Optimizer (Pareto Engine)
 * Evaluates automation rules against campaign performance.
 * Runs on a timer (default: every 6 hours).
 * Actions: pause, scale_up, scale_down budget.
 */

import { createLogger } from '../lib/logger.js';
import { OPERATORS, compare } from '../lib/operators.js';

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
        const result = await this._evaluateRule(rule);
        if (result) results.push(result);
      } catch (err) {
        results.push({ rule: rule.name, error: err.message });
      }
    }
    log.info(`AutoOptimizer: checked ${activeRules.length} rules, triggered ${results.filter(r => !r.error).length}`);
    return { checked: activeRules.length, triggered: results.length, results };
  }

  async _evaluateRule(rule) {
    if (!rule.campaign_id || rule.campaign_id === 'undefined') {
      log.debug('Skipping rule - no valid campaign_id', { ruleId: rule.id, name: rule.name });
      return null;
    }
    let insights;
    try {
      insights = await this.meta.getCampaignInsights(rule.campaign_id, { datePreset: 'last_7d' });
    } catch (err) {
      log.debug('Skipping rule - insights unavailable', { ruleId: rule.id, error: err.message });
      return null;
    }
    if (!insights) return null;

    const metricValue = this._getMetricValue(insights, rule.condition_metric);
    if (metricValue === null) return null;

    if (!this._evaluateCondition(metricValue, rule.condition_operator, rule.condition_value)) return null;

    const actionResult = await this._executeAction(rule.campaign_id, rule.action, rule.action_value, insights);
    this.rules.markTriggered(rule.id);
    return { rule: rule.name, campaign: rule.campaign_id, metric: rule.condition_metric, value: metricValue, action: rule.action, result: actionResult };
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
    return compare(value, operator, threshold);
  }

  async _executeAction(campaignId, action, actionValue, insights) {
    const ACTION_HANDLERS = {
      pause: () => this._pauseAction(campaignId),
      scale_up: () => this._scaleAction(campaignId, actionValue || 20, 'up', insights),
      scale_down: () => this._scaleAction(campaignId, actionValue || 20, 'down', insights),
      alert: () => this._alertAction(campaignId),
    };

    const handler = ACTION_HANDLERS[action];
    if (!handler) return { action: 'unknown' };
    return await handler();
  }

  async _pauseAction(campaignId) {
    await this.meta.updateCampaign(campaignId, { status: 'PAUSED' });
    return { action: 'paused', campaignId };
  }

  async _scaleAction(campaignId, percent, direction, insights) {
    // Rule: Only scale LC_ campaigns
    const campaign = await this.campaigns.getById(campaignId);
    if (campaign && campaign.name && !campaign.name.startsWith('LC_')) {
      log.info(`Scale blocked: ${campaign.name} is not LC_`);
      return { action: 'blocked', reason: 'Only LC_ campaigns benefit from budget scaling' };
    }
    
    const currentBudget = insights.spend / 7;
    const factor = direction === 'up' ? (1 + percent / 100) : (1 - percent / 100);
    const newBudget = direction === 'down'
      ? Math.max(10000, Math.round(currentBudget * factor))
      : Math.round(currentBudget * factor);
    await this.meta.updateCampaign(campaignId, { dailyBudget: newBudget });
    return { action: `scale_${direction}`, from: currentBudget, to: newBudget };
  }

  _alertAction(campaignId) {
    log.info(`ALERT: Campaign ${campaignId} triggered rule`);
    return { action: 'alert', campaignId };
  }
}
