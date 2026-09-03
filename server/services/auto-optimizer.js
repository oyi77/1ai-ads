/**
 * Auto-Optimizer (Pareto Engine)
 * Evaluates automation rules against campaign performance.
 * Runs on a timer (default: every 6 hours).
 * Actions: pause, scale_up, scale_down budget.
 */

import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { compare } from '../lib/operators.js';
import { recordToTreasury, checkWf5Enabled } from './treasuryClient.js';
import { MetaAdsAPI } from './meta/index.js';

const log = createLogger('auto-optimizer');

export class AutoOptimizer {
  constructor(metaApi, rulesRepo, campaignsRepo, draftService = null, platformAccountsRepo = null, settingsRepo = null) {
    this.meta = metaApi;
    this.rules = rulesRepo;
    this.campaigns = campaignsRepo;
    this.draftService = draftService;
    this.platformAccountsRepo = platformAccountsRepo;
    this.settingsRepo = settingsRepo;
    this._interval = null;
  }

  /**
   * Resolve a Meta API as the RULE/owner of a given campaign (multi-tenant).
   * Uses the owner's bound Meta token when present, else falls back to the
   * injected system metaApi. Never another user's token.
   */
  _metaForOwner(campaign) {
    const ownerId = campaign?.user_id || campaign?.created_by || (campaign && campaign.user && campaign.user.id);
    if (ownerId && this.platformAccountsRepo) {
      const accounts = this.platformAccountsRepo.findAllActiveByUserAndPlatform(ownerId, 'meta');
      for (const acct of accounts) {
        if (acct?.access_token) return new MetaAdsAPI(acct.access_token);
      }
      const fallback = this.settingsRepo && this.settingsRepo.getCredentials('meta')?.access_token;
      if (fallback) return new MetaAdsAPI(fallback);
    }
    return this.meta;
  }

  start(intervalMs = 6 * 60 * 60 * 1000) {
    log.info(`AutoOptimizer started (check every ${intervalMs / 1000 / 60}min)`);
    this._interval = setInterval(() => this.evaluate().catch(e => log.error('AutoOptimizer error', { message: e.message })), intervalMs);
    // Also run once on start (after 30s delay to let server boot)
    setTimeout(() => this.evaluate().catch(e => log.error('AutoOptimizer initial error', { message: e.message })), config.intervals.optimizerInitialDelay);
  }

  stop() {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  async evaluate() {
    // Gate: if hub treasury says wf5_enabled=false, skip the entire cycle.
    const wf5On = await checkWf5Enabled();
    if (!wf5On) {
      log.info('AutoOptimizer skipped — wf5_enabled=false in hub treasury');
      return { checked: 0, triggered: 0, skipped: true };
    }

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
    const campaign = await this.campaigns.getById(rule.campaign_id);
    const meta = this._metaForOwner(campaign);
    let insights;
    try {
      insights = await meta.getCampaignInsights(rule.campaign_id, { datePreset: 'last_7d' });
    } catch (err) {
      log.debug('Skipping rule - insights unavailable', { ruleId: rule.id, error: err.message });
      return null;
    }
    if (!insights) return null;

    const metricValue = this._getMetricValue(insights, rule.condition_metric);
    if (metricValue === null) return null;

    if (!this._evaluateCondition(metricValue, rule.condition_operator, rule.condition_value)) return null;

    const actionResult = await this._executeAction(rule.campaign_id, rule.action, rule.action_value, insights, campaign);
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

  async _executeAction(campaignId, action, actionValue, insights, campaign) {
    // Approval gate: route the intended change to a draft instead of mutating live.
    if (this.draftService) {
      const intercepted = await this.draftService.guardAutonomousChange({
        type: `optimization_${action}`,
        summary: `Auto-optimize: ${action} on campaign ${campaignId}`,
        details: { campaignId, action, actionValue, insights },
        proposedBy: 'auto-optimizer',
        campaignId,
      });
      if (intercepted) return { action: `pending_approval_${action}`, campaignId };
    }

    const meta = this._metaForOwner(campaign);
    const ACTION_HANDLERS = {
      pause: () => this._pauseAction(campaignId, meta),
      scale_up: () => this._scaleAction(campaignId, actionValue || 20, 'up', insights, meta),
      scale_down: () => this._scaleAction(campaignId, actionValue || 20, 'down', insights, meta),
      alert: () => this._alertAction(campaignId),
    };

    const handler = ACTION_HANDLERS[action];
    if (!handler) return { action: 'unknown' };
    return await handler();
  }

  async _pauseAction(campaignId, meta = this.meta) {
    await meta.updateCampaign(campaignId, { status: 'PAUSED' });
    // Fire-and-forget: campaign paused = ad spend without return = loss event
    recordToTreasury({
      source: '1ai-ads',
      direction: 'out',
      amount_usd: 0,          // spend already sunk; hub records the event, amount filled by caller if known
      note: `Campaign paused (ROAS stop-loss): ${campaignId}`,
      workflow: 'wf5_ad_loss',
      metadata: { campaign_id: campaignId },
    }).catch((err) => log.warn({ err }, '[auto-optimizer] Treasury record failed (pause)'));
    return { action: 'paused', campaignId };
  }

  async _scaleAction(campaignId, percent, direction, insights, meta = this.meta) {
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
    await meta.updateCampaign(campaignId, { dailyBudget: newBudget });

    // Fire-and-forget: scale_up on a profitable campaign = revenue signal into pool
    if (direction === 'up') {
      const profitEstimate = insights.revenue !== null
        ? insights.revenue - insights.spend
        : insights.spend * (percent / 100); // conservative proxy: budget delta as floor
      recordToTreasury({
        source: '1ai-ads',
        direction: 'in',
        amount_usd: Math.max(0, profitEstimate),
        note: `Campaign scaled up ${percent}%: ${campaignId}`,
        workflow: 'wf5_ad_profit',
        metadata: {
          campaign_id: campaignId,
          budget_from: currentBudget,
          budget_to: newBudget,
          spend_7d: insights.spend,
        },
      }).catch((err) => log.warn({ err }, '[auto-optimizer] Treasury record failed (scale_up)'));
    }

    return { action: `scale_${direction}`, from: currentBudget, to: newBudget };
  }

  _alertAction(campaignId) {
    log.info(`ALERT: Campaign ${campaignId} triggered rule`);
    return { action: 'alert', campaignId };
  }
}
