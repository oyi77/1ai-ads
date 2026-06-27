/**
 * Rule Evaluator — Condition Matching + Action Dispatch
 *
 * Extracted from AutonomousAgent (SRP).
 * Handles only: rule CRUD, condition evaluation, action execution.
 */

import { MetaAdsAPI } from './meta-api.js';
import { GoogleAdsAPI } from './google-ads-api.js';
import { TikTokAdsAPI } from './tiktok-api.js';
import { createLogger } from '../lib/logger.js';
import { compare } from '../lib/operators.js';

const log = createLogger('rule-evaluator');

export class RuleEvaluator {
  constructor(settingsRepo, campaignsRepo, rulesRepo, llmClient, { metaAdsAPI, googleAdsAPI, tiktokAdsAPI } = {}) {
    this.settingsRepo = settingsRepo;
    this.campaignsRepo = campaignsRepo;
    this.rulesRepo = rulesRepo;
    this.llmClient = llmClient;
    this.metaAdsAPI = metaAdsAPI || new MetaAdsAPI(settingsRepo);
    this.googleAdsAPI = googleAdsAPI || new GoogleAdsAPI(settingsRepo);
    this.tiktokAdsAPI = tiktokAdsAPI || new TikTokAdsAPI(settingsRepo);
    this.runningRules = new Set();
  }

  static PLATFORM_APIS = {
    google: (self) => self.googleAdsAPI,
    tiktok: (self) => self.tiktokAdsAPI,
  };

  _getPlatformApi(platform) {
    const resolver = RuleEvaluator.PLATFORM_APIS[platform];
    return resolver ? resolver(this) : this.metaAdsAPI;
  }

  createRule(userId, { name, condition, action, priority = 1, enabled = true }) {
    return this.rulesRepo.create({
      user_id: userId,
      name,
      condition: JSON.stringify(condition),
      action: JSON.stringify(action),
      priority,
      enabled,
      created_at: new Date().toISOString(),
    });
  }

  async evaluateRule(rule, campaign) {
    const condition = JSON.parse(rule.condition);
    const action = JSON.parse(rule.action);

    const matches = this._evaluateCondition(condition, campaign);
    if (matches) {
      return await this._executeAction(action, campaign);
    }
    return null;
  }

  _evaluateCondition(condition, campaign) {
    if (condition.type === 'status') {
      return campaign.status === condition.value;
    }

    const CONDITION_METRICS = {
      roas: (c) => c.stats?.roas || 0,
      spend: (c) => c.stats?.spend || 0,
      cpm: (c) => c.stats?.cpm || 0,
    };

    const getMetric = CONDITION_METRICS[condition.type];
    if (!getMetric) return false;

    return this._compare(getMetric(campaign), condition.operator, condition.value);
  }

  _compare(value, operator, target) {
    return compare(value, operator, target);
  }

  async _executeAction(action, campaign) {
    if (this.runningRules.has(campaign.id)) return null;
    this.runningRules.add(campaign.id);

    try {
      const result = await this._applyAction(action, campaign);
      return { campaign_id: campaign.id, action, result };
    } finally {
      this.runningRules.delete(campaign.id);
    }
  }

  static ACTION_HANDLERS = {
    scale_up: (self, action, campaign) => self._scaleCampaign(campaign.id, action.amount || 1.5, 'increase'),
    scale_down: (self, action, campaign) => self._scaleCampaign(campaign.id, action.amount || 0.8, 'decrease'),
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
    const api = this._getPlatformApi(platform);
    const currentBudget = campaign.budget || 100;
    const newBudget = direction === 'increase' ? currentBudget * multiplier : currentBudget / multiplier;
    const safeBudget = Math.max(100, newBudget);

    if (platform === 'meta') {
      await api.apiUpdate(`/campaign_${campaignId}`, { budget: Math.round(safeBudget * 100) / 100 });
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
    const api = this._getPlatformApi(platform);

    if (platform === 'meta') {
      await api.apiUpdate(`/campaign_${campaignId}`, { status: 'PAUSED' });
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
    const api = this._getPlatformApi(platform);

    if (platform === 'meta') {
      await api.apiUpdate(`/campaign_${campaignId}`, { status: 'ACTIVE' });
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

    const ads = await this.campaignsRepo.getAds(campaignId);
    const bestAd = ads.sort((a, b) => (b.stats?.roas || 0) - (a.stats?.roas || 0))[0];

    if (bestAd) {
      await this.metaAdsAPI.apiUpdate(`/ad_${bestAd.platform_id}`, { status: 'ACTIVE' });
      for (const ad of ads) {
        if (ad.id !== bestAd.id) {
          await this.metaAdsAPI.apiUpdate(`/ad_${ad.platform_id}`, { status: 'PAUSED' });
        }
      }
      return { campaign_id: campaignId, action: 'optimize_creative', best_ad_id: bestAd.id };
    }

    return { error: 'No ads found' };
  }

  async _optimizeBudget(campaignId) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    const insights = await this.metaAdsAPI.apiGet(`/campaign_${campaignId}`, {
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
    } catch {
      if (suggestion.includes('increase')) newBudget = currentBudget * 1.5;
      else if (suggestion.includes('decrease')) newBudget = currentBudget * 0.8;
    }

    await this.metaAdsAPI.apiUpdate(`/campaign_${campaignId}`, { budget: Math.round(newBudget * 100) / 100 });

    return { campaign_id: campaignId, action: 'optimize_budget', from: currentBudget, to: newBudget, suggestion };
  }

  async checkCampaigns(userId) {
    const campaigns = await this.campaignsRepo.getByUserId(userId);
    if (!campaigns?.length) return [];

    const rules = await this.rulesRepo.getAllEnabled(userId);
    if (!rules.length) return [];

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
