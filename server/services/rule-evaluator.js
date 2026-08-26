/**
 * Rule Evaluator — Condition Matching + Action Dispatch
 *
 * Extracted from AutonomousAgent (SRP).
 * Handles only: rule CRUD, condition evaluation, action execution.
 */

import { MetaAdsAPI } from './meta/index.js';
import { GoogleAdsAPI } from './google/index.js';
import { TikTokAdsAPI } from './tiktok/index.js';
import { createLogger } from '../lib/logger.js';
import { compare } from '../lib/operators.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';
import { resolveScaleDefault } from '../lib/scale-defaults.js';

const log = createLogger('rule-evaluator');

export class RuleEvaluator {
  MAX_COMPOUND_DEPTH = 3;
  constructor(settingsRepo, campaignsRepo, rulesRepo, llmClient, { metaAdsAPI, googleAdsAPI, tiktokAdsAPI, platformAccountsRepo } = {}, draftService = null) {
    this.settingsRepo = settingsRepo;
    this.campaignsRepo = campaignsRepo;
    this.rulesRepo = rulesRepo;
    this.llmClient = llmClient;
    this.metaAdsAPI = metaAdsAPI || new MetaAdsAPI(settingsRepo);
    this.googleAdsAPI = googleAdsAPI || new GoogleAdsAPI(settingsRepo);
    this.tiktokAdsAPI = tiktokAdsAPI || new TikTokAdsAPI(settingsRepo);
    this.platformAccountsRepo = platformAccountsRepo || null;
    this.runningRules = new Set();
    this.draftService = draftService;
  }

  /**
   * Resolve a platform API for a campaign mutation as the CAMPAIGN OWNER
   * (multi-tenant). Falls back to the injected system API only when the
   * owner has no bound account — never another user's token.
   */
  _platformApiForOwner(platform, campaign) {
    if (this.platformAccountsRepo) {
      const token = resolveOwnerPlatformToken(platform, campaign?.user_id, {
        platformAccountsRepo: this.platformAccountsRepo,
        settingsRepo: this.settingsRepo,
      });
      if (token) {
        const api = this._getPlatformApi(platform);
        api.setActiveAccount(null, token);
        return api;
      }
    }
    return this._getPlatformApi(platform);
  }

  static PLATFORM_APIS = {
    google: (self) => self.googleAdsAPI,
    tiktok: (self) => self.tiktokAdsAPI,
  };

  _getPlatformApi(platform) {
    const resolver = RuleEvaluator.PLATFORM_APIS[platform];
    return resolver ? resolver(this) : this.metaAdsAPI;
  }
  _scaleDefault(type) {
    return resolveScaleDefault(type, this.settingsRepo);
  }


  createRule(userId, { name, condition, action, priority = 1, enabled = true, account_id = null }) {
    return this.rulesRepo.create({
      user_id: userId,
      name,
      condition: JSON.stringify(condition),
      action: JSON.stringify(action),
      priority,
      enabled,
      created_at: new Date().toISOString(),
      account_id,
    });
  }

  async evaluateRule(rule, campaign) {
    const condition = typeof rule.condition === 'string' ? JSON.parse(rule.condition) : rule.condition;
    const action = typeof rule.action === 'string' ? JSON.parse(rule.action) : rule.action;

    const matches = this._evaluateCondition(condition, campaign);
    if (matches) {
      return await this._executeAction(action, campaign);
    }
    return null;
  }

  /**
   * Evaluate a condition leaf or a compound group.
   * Leaf:  { type, operator?, value }          — legacy single-condition form
   * Group: { all: [cond|group, ...] }           — logical AND
   *        { any: [cond|group, ...] }           — logical OR
   * Groups nest up to MAX_COMPOUND_DEPTH to keep evaluation bounded.
   */
  _evaluateCondition(condition, campaign, depth = 0) {
    if (!condition || typeof condition !== 'object') return false;

    if (Array.isArray(condition.all)) {
      if (depth >= this.MAX_COMPOUND_DEPTH || !condition.all.length) return false;
      return condition.all.every(c => this._evaluateCondition(c, campaign, depth + 1));
    }
    if (Array.isArray(condition.any)) {
      if (depth >= this.MAX_COMPOUND_DEPTH || !condition.any.length) return false;
      return condition.any.some(c => this._evaluateCondition(c, campaign, depth + 1));
    }
    if (condition.all || condition.any) return false; // empty group — treat as non-match

    if (condition.type === 'status') {
      return campaign.status === condition.value;
    }

    const CONDITION_METRICS = {
      roas: (c) => c.stats?.roas || 0,
      spend: (c) => c.stats?.spend || 0,
      cpm: (c) => c.stats?.cpm || 0,
      ctr: (c) => c.stats?.ctr || 0,
      clicks: (c) => c.stats?.clicks || 0,
      impressions: (c) => c.stats?.impressions || 0,
      frequency: (c) => c.stats?.frequency || 0,
      purchases: (c) => c.stats?.purchases || 0,
      cpc: (c) => c.stats?.cpc || 0,
    };

    const getMetric = CONDITION_METRICS[condition.type];
    if (!getMetric) return false;

    return this._compare(getMetric(campaign), condition.operator, condition.value);
  }

  _compare(value, operator, target) {
    return compare(value, operator, target);
  }

  async _executeAction(action, campaign) {
    // Approval gate: route the intended change to a draft instead of mutating live.
    if (this.draftService) {
      const intercepted = await this.draftService.guardAutonomousChange({
        type: `rule_${action.type}`,
        summary: `Rule action: ${action.type} on campaign ${campaign.id}`,
        details: { action, campaign },
        proposedBy: 'rule-evaluator',
        campaignId: campaign.id,
      });
      if (intercepted) {
        return { campaign_id: campaign.id, action: `pending_approval_${action.type}`, intercepted: true };
      }
    }

    if (this.runningRules.has(campaign.id)) return null;
    this.runningRules.add(campaign.id);

    // Compliance: log the intended action BEFORE execution for audit trail
    log.info('Automation action executing', {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      platform: campaign.platform,
      action_type: action.type,
      action_value: action.amount || action.value,
      campaign_status: campaign.status,
      campaign_budget: campaign.budget,
    });

    try {
      const result = await this._applyAction(action, campaign);
      log.info('Automation action completed', { campaign_id: campaign.id, action_type: action.type, result });
      return { campaign_id: campaign.id, action, result };
    } catch (err) {
      log.error('Automation action failed', { campaign_id: campaign.id, action_type: action.type, error: err.message });
      throw err;
    } finally {
      this.runningRules.delete(campaign.id);
    }
  }

  static ACTION_HANDLERS = {
    scale_up: (self, action, campaign) => self._scaleCampaign(campaign.id, action.amount || self._scaleDefault('scale_up'), 'increase'),
    scale_down: (self, action, campaign) => self._scaleCampaign(campaign.id, action.amount || self._scaleDefault('scale_down'), 'decrease'),
    pause: (self, _action, campaign) => self._pauseCampaign(campaign.id),
    resume: (self, _action, campaign) => self._resumeCampaign(campaign.id),
    optimize_creative: (self, _action, campaign) => self._optimizeCreative(campaign.id),
    optimize_budget: (self, _action, campaign) => self._optimizeBudget(campaign.id),
  };
  async _applyAction(action, campaign) {
    const handler = RuleEvaluator.ACTION_HANDLERS[action.type];
    if (!handler) {
      log.warn('Unknown action type', { type: action.type });
      return null;
    }
    return handler(this, action, campaign);
  }
  async _scaleCampaign(campaignId, multiplier, direction) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    // Rule: Only scale LC_ campaigns. BIDCAP/TC limited by bid caps.
    const name = campaign.name || '';
    if (!name.startsWith('LC_')) {
      log.info('Scale blocked: non-LC campaign', { id: campaignId, name });
      return { error: 'Blocked: only LC_ campaigns benefit from budget scaling' };
    }

    const platform = campaign.platform || 'meta';
    const api = this._platformApiForOwner(platform, campaign);
    const currentBudget = campaign.budget || 100;
    const newBudget = direction === 'increase' ? currentBudget * multiplier : currentBudget / multiplier;
    const safeBudget = Math.max(100, newBudget);

    if (platform === 'meta') {
      await api.updateCampaign(campaign.campaign_id, { dailyBudget: safeBudget });
    } else if (platform === 'google') {
      await api.updateCampaign(campaign.customer_id, campaign.platform_campaign_id, { budget: safeBudget });
    } else if (platform === 'tiktok') {
      await api.updateCampaign(campaign.advertiser_id, campaign.platform_campaign_id, { budget: safeBudget });
    }

    return { campaign_id: campaignId, action: 'scale', direction, from: currentBudget, to: safeBudget, platform };
  }

  async _pauseCampaign(campaignId) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    const platform = campaign.platform || 'meta';
    const api = this._platformApiForOwner(platform, campaign);

    if (platform === 'meta') {
      await api.updateCampaign(campaign.campaign_id, { status: 'PAUSED' });
    } else if (platform === 'google') {
      await api.updateCampaign(campaign.customer_id, campaign.platform_campaign_id, { status: 'PAUSED' });
    } else if (platform === 'tiktok') {
      await api.updateCampaign(campaign.advertiser_id, campaign.platform_campaign_id, { status: 'DISABLE' });
    }

    return { campaign_id: campaignId, action: 'pause', status: 'PAUSED', platform };
  }

  async _resumeCampaign(campaignId) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    const platform = campaign.platform || 'meta';
    const api = this._platformApiForOwner(platform, campaign);

    if (platform === 'meta') {
      await api.updateCampaign(campaign.campaign_id, { status: 'ACTIVE' });
    } else if (platform === 'google') {
      await api.updateCampaign(campaign.customer_id, campaign.platform_campaign_id, { status: 'ENABLED' });
    } else if (platform === 'tiktok') {
      await api.updateCampaign(campaign.advertiser_id, campaign.platform_campaign_id, { status: 'ENABLE' });
    }

    return { campaign_id: campaignId, action: 'resume', status: 'ACTIVE', platform };
  }

  async _optimizeCreative(campaignId) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    // Meta-only action: resolve as the campaign owner (multi-tenant).
    const api = this._platformApiForOwner('meta', campaign);

    // Only ads linked to a live platform ad instance carry platform_id.
    // The creative library may hold unlinked drafts that must never be mutated.
    const ads = (await this.campaignsRepo.getAds(campaignId))
      .filter(ad => ad && ad.platform_id);
    if (ads.length === 0) return { error: 'No linked ads found' };

    const bestAd = ads.sort((a, b) => (b.stats?.roas || 0) - (a.stats?.roas || 0))[0];

    await api.apiUpdate(`/ad_${bestAd.platform_id}`, { status: 'ACTIVE' });
    for (const ad of ads) {
      if (ad.id !== bestAd.id) {
        await api.apiUpdate(`/ad_${ad.platform_id}`, { status: 'PAUSED' });
      }
    }
    return { campaign_id: campaignId, action: 'optimize_creative', best_ad_id: bestAd.id };
  }

  async _optimizeBudget(campaignId) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    // Meta-only action: resolve as the campaign owner (multi-tenant).
    const api = this._platformApiForOwner('meta', campaign);

    const insights = await api.apiGet(`/campaign_${campaign.campaign_id}`, {
      fields: 'spend,roas,cpc,cpm',
      time_span: '7days',
    });

    const stats = insights.data?.[0] || {};
    const currentBudget = campaign.budget || 100;

    const suggestion = await this.llmClient.call(
      'You are a budget optimization expert. Given campaign stats, suggest budget adjustment. Respond ONLY with JSON: {"action": "increase|decrease|hold", "newBudget": number, "reason": "string"}',
      JSON.stringify({ campaign_id: campaignId, budget: currentBudget, stats })
    );

    let newBudget = currentBudget;
    try {
      const cleanJson = suggestion.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.action === 'increase' && typeof parsed.newBudget === 'number') newBudget = parsed.newBudget;
      else if (parsed.action === 'decrease' && typeof parsed.newBudget === 'number') newBudget = parsed.newBudget;
    } catch (parseErr) {
      log.warn('LLM budget suggestion parse failed', { campaignId, error: parseErr.message });
      if (suggestion.includes('increase')) newBudget = currentBudget * this._scaleDefault('scale_up');
      else if (suggestion.includes('decrease')) newBudget = currentBudget / this._scaleDefault('scale_down');
    }

    await api.updateCampaign(campaign.campaign_id, { dailyBudget: newBudget });

    return { campaign_id: campaignId, action: 'optimize_budget', from: currentBudget, to: newBudget, suggestion };
  }
  async checkCampaigns(userId) {
    const campaigns = await this.campaignsRepo.getByUserId(userId);
    if (!campaigns?.length) return [];

    const rules = await this.rulesRepo.getAllEnabled(userId);
    if (!rules.length) return [];

    log.info('Automation checkCampaigns starting', { userId, campaignCount: campaigns.length, ruleCount: rules.length });

    const results = [];
    for (const campaign of campaigns) {
      for (const rule of rules) {
        const result = await this.evaluateRule(rule, campaign);
        if (result) results.push(result);
      }
    }
    return results;
  }
}
