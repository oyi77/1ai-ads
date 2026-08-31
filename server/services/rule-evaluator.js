import { MetaAdsAPI } from './meta/index.js';
import { GoogleAdsAPI } from './google/index.js';
import { TikTokAdsAPI } from './tiktok/index.js';
import { createLogger } from '../lib/logger.js';
import { compare } from '../lib/operators.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';
import { resolveScaleDefault } from '../lib/scale-defaults.js';
import { METRICS } from '../lib/rule-metrics.js';
import { ConditionGroup } from '../lib/rule-builder.js';

const log = createLogger('rule-evaluator');

export class RuleEvaluator {
  MAX_COMPOUND_DEPTH = 3;

  constructor(settingsRepo, campaignsRepo, rulesRepo, llmClient, { metaAdsAPI, googleAdsAPI, tiktokAdsAPI, platformAccountsRepo } = {}, draftService = null) {
    this.settingsRepo = settingsRepo;
    this.campaignsRepo = campaignsRepo;
    this.rulesRepo = rulesRepo;
    this.llmClient = llmClient;
    this.platformApis = { meta: metaAdsAPI, google: googleAdsAPI, tiktok: tiktokAdsAPI };
    this.platformAccountsRepo = platformAccountsRepo;
    this.draftService = draftService;
  }

  _platformApiForOwner(platform, campaign) {
    const ownerApi = this._getPlatformApi(platform);
    if (ownerApi) return ownerApi;

    if (campaign?.user_id && this.platformAccountsRepo) {
      const token = resolveOwnerPlatformToken(platform, campaign.user_id, {
        platformAccountsRepo: this.platformAccountsRepo,
        settingsRepo: this.settingsRepo,
      });
      if (token) {
        const cls = this.constructor.PLATFORM_APIS[platform];
        if (cls) return new cls(token);
      }
    }
    return null;
  }

  static PLATFORM_APIS = {
    meta: MetaAdsAPI,
    google: GoogleAdsAPI,
    tiktok: TikTokAdsAPI,
  };

  _getPlatformApi(platform) {
    return this.platformApis[platform] || null;
  }

  createRule(userId, { name, condition, action, priority = 1, enabled = true, account_id = null, intervalMinutes = 15 }) {
    return this.rulesRepo.create({
      userId,
      name,
      condition,
      action,
      priority,
      enabled,
      accountId: account_id,
      intervalMinutes,
    });
  }

  async evaluateRule(rule, campaign) {
    try {
      const matched = this._evaluateCondition(rule.condition, campaign);
      if (matched) {
        log.info('Rule matched', { rule: rule.name, campaign: campaign.name });
        this.rulesRepo.trigger(rule.id);
        await this._executeAction(rule.action, campaign);
      }
      return matched;
    } catch (err) {
      log.error('Rule evaluation failed', { rule: rule.name, error: err.message });
      return false;
    }
  }

  _evaluateCondition(condition, campaign, depth = 0) {
    if (!condition) return false;
    if (condition.type === 'group') return this._evaluateGroup(condition, campaign, depth);
    return this._evaluateLeaf(condition, campaign);
  }

  _evaluateLeaf(condition, campaign) {
    const metric = METRICS[condition.metric];
    if (!metric) {
      log.warn('Unknown metric in rule', { metric: condition.metric });
      return false;
    }
    const value = metric.resolve(campaign, campaign.insights || {});
    return compare(value, condition.operator, condition.value);
  }

  _evaluateGroup(group, campaign, depth = 0) {
    if (depth > this.MAX_COMPOUND_DEPTH) {
      log.warn('Max compound depth exceeded');
      return false;
    }
    if (!group.children || !group.children.length) return false;
    if (group.logic === 'and') return group.children.every(c => this._evaluateCondition(c, campaign, depth + 1));
    if (group.logic === 'or') return group.children.some(c => this._evaluateCondition(c, campaign, depth + 1));
    return false;
  }

  async _executeAction(action, campaign) {
    const handler = this.constructor.ACTION_HANDLERS[action.type];
    if (!handler) {
      log.warn('Unknown action type', { type: action.type });
      return;
    }
    await handler.call(this, action.params || {}, campaign);
  }

  async _scaleCampaign(campaignId, multiplier, direction) {
    const campaign = this.campaignsRepo.findById(campaignId);
    if (!campaign) return;
    const api = this._platformApiForOwner(campaign.platform, campaign);
    if (!api) return;
    const currentBudget = campaign.budget || 0;
    const newBudget = direction === 'up'
      ? Math.round(currentBudget * (1 + multiplier / 100))
      : Math.round(currentBudget * (1 - multiplier / 100));
    await api.updateCampaign(campaignId, { dailyBudget: newBudget });
    log.info('Budget scaled', { campaignId, multiplier, direction, newBudget });
  }

  async _increaseBudget(campaignId, percentage) {
    await this._scaleCampaign(campaignId, percentage, 'up');
    log.info('Budget increased', { campaignId, percentage });
  }

  async _decreaseBudget(campaignId, percentage) {
    await this._scaleCampaign(campaignId, percentage, 'down');
    log.info('Budget decreased', { campaignId, percentage });
  }

  async _duplicateCampaign(campaignId, nameSuffix) {
    const campaign = this.campaignsRepo.findById(campaignId);
    if (!campaign) return;
    log.info('Duplicating campaign', { campaignId, nameSuffix });
  }

  async _pauseCampaign(campaignId) {
    const campaign = this.campaignsRepo.findById(campaignId);
    if (!campaign) return;
    const api = this._platformApiForOwner(campaign.platform, campaign);
    if (!api) return;
    await api.updateCampaign(campaignId, { status: 'PAUSED' });
    log.info('Campaign paused', { campaignId });
  }

  async _resumeCampaign(campaignId) {
    const campaign = this.campaignsRepo.findById(campaignId);
    if (!campaign) return;
    const api = this._platformApiForOwner(campaign.platform, campaign);
    if (!api) return;
    await api.updateCampaign(campaignId, { status: 'ACTIVE' });
    log.info('Campaign resumed', { campaignId });
  }

  async _optimizeCreative(campaignId) {
    const campaign = this.campaignsRepo.findById(campaignId);
    if (!campaign) return;
    log.info('Creative optimization triggered', { campaignId });
  }

  async _optimizeBudget(campaignId) {
    const campaign = this.campaignsRepo.findById(campaignId);
    if (!campaign) return;
    log.info('Budget optimization triggered', { campaignId });
  }

  async checkCampaigns(userId) {
    const rules = this.rulesRepo.getAllEnabled(userId);
    const campaigns = this.campaignsRepo.findAll({ userId });
    let matched = 0;
    const now = Date.now();
    for (const rule of rules) {
      // Respect evaluation interval (15/30 min or follow-FB default 15)
      const intervalMs = (rule.intervalMinutes || 15) * 60 * 1000;
      const last = rule.lastEvaluatedAt ? new Date(rule.lastEvaluatedAt).getTime() : 0;
      if (last && now - last < intervalMs) continue;
      this.rulesRepo.markEvaluated(rule.id);
      for (const campaign of campaigns) {
        if (rule.accountId && rule.accountId !== campaign.accountId) continue;
        if (await this.evaluateRule(rule, campaign)) matched++;
      }
    }
    return matched;
  }
}

// Register action handlers
RuleEvaluator.ACTION_HANDLERS = {
  pause: async function(params, campaign) { await this._pauseCampaign(campaign.id); },
  resume: async function(params, campaign) { await this._resumeCampaign(campaign.id); },
  scale_budget: async function(params, campaign) { await this._scaleCampaign(campaign.id, params.percentage || 10, 'up'); },
  increase_budget: async function(params, campaign) { await this._increaseBudget(campaign.id, params.percentage !== undefined ? params.percentage : 20); },
  decrease_budget: async function(params, campaign) { await this._decreaseBudget(campaign.id, params.percentage !== undefined ? params.percentage : 20); },
  duplicate_campaign: async function(params, campaign) { await this._duplicateCampaign(campaign.id, params.name || '_copy'); },
  change_bid: async function(params, campaign) { log.info('Change bid', { strategy: params.strategy, campaignId: campaign.id }); },
  notify: async function(params, campaign) { log.info('Notify', { message: params.message, campaignId: campaign.id }); },
  notify_and_pause: async function(params, campaign) { log.info('Notify+Pause', { message: params.message, campaignId: campaign.id }); await this._pauseCampaign(campaign.id); },
  auto_allocate: async function(params, campaign) { log.info('Auto allocate', { platforms: params.platforms, campaignId: campaign.id }); },
  dayparting: async function(params, campaign) { log.info('Dayparting', { schedule: params.schedule, campaignId: campaign.id }); },
  optimize_creative: async function(params, campaign) { await this._optimizeCreative(campaign.id); },
  optimize_budget: async function(params, campaign) { await this._optimizeBudget(campaign.id); },
};

export default RuleEvaluator;
