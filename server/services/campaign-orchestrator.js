/**
 * Campaign Orchestrator - chains AI creative generation with Meta campaign creation.
 * Flow: AI generates creative → create campaign → create adset → create ad creative → create ad
 * All campaigns created as PAUSED by default (explicit activation required).
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('campaign-orchestrator');

export class CampaignOrchestrator {
  constructor(metaApi, creativeStudio) {
    this.meta = metaApi;
    this.creative = creativeStudio;
  }

  /**
   * Create campaign, adset, creative, ad — assigning each ID to result
   * immediately so cleanup can access them if a later step fails.
   */
  async _runAndAssign(steps, name, result, key, fn, extra = {}) {
    const data = await this._runStep(steps, name, fn);
    this._assignStepId(steps, result, key, data.id, extra);
    return data;
  }

  async _stepCreative(accountId, pageId, product, bestAd, landingUrl, objective, result, meta = this.meta) {
    return this._runAndAssign(result.steps, 'create_creative', result, 'creativeId',
      () => meta.createAdCreative(accountId, {
        name: `${product} Creative`, pageId,
        message: `${bestAd.hook}\n\n${bestAd.body}`, headline: bestAd.cta || product,
        description: product, linkUrl: landingUrl || 'https://example.com',
        ctaType: this._objectiveToCTA(objective),
      }));
  }

  async _createCampaignStep(accountId, pageId, product, objective, dailyBudget, landingUrl, aiResult, bestAd, result, meta = this.meta) {
    const steps = result.steps;
    const campaignName = `${product} - ${objective} - ${new Date().toISOString().split('T')[0]}`;
    const campaign = await this._runAndAssign(steps, 'create_campaign', result, 'campaignId',
      () => meta.createCampaign(accountId, { name: campaignName, objective, status: 'PAUSED', dailyBudget }),
      { name: campaignName });

    const adsetName = `${product} - ${bestAd.hook || product}`;
    const adset = await this._runAndAssign(steps, 'create_adset', result, 'adsetId',
      () => meta.createAdSet(accountId, campaign.id, {
        name: adsetName, dailyBudget, targeting: this._buildDefaultTargeting(aiResult.targetingSuggestions),
        optimizationGoal: this._objectiveToOptimization(objective),
      }), { name: adsetName });

    const creative = await this._stepCreative(accountId, pageId, product, bestAd, landingUrl, objective, result, meta);
    await this._runAndAssign(steps, 'create_ad', result, 'adId',
      () => meta.createAd(accountId, {
        adsetId: adset.id, creativeId: creative.id,
        name: `${product} Ad - ${bestAd.model_name || 'AI'}`, status: 'PAUSED',
      }));
  }

  async _generateCreative(product, target, keunggulan, platform, format, steps) {
    const aiResult = await this._runStep(steps, 'ai_creative', () =>
      this.creative.generateAdPackage(product, target, keunggulan, platform, format));
    const bestAd = this._pickBestAd(aiResult, product, keunggulan);
    steps[steps.length - 1].data = { model: bestAd.model_name, hook: bestAd.hook };
    return { aiResult, bestAd };
  }

  _assignStepId(steps, result, key, id, extra = {}) {
    result[key] = id;
    steps[steps.length - 1].data = { id, ...extra };
  }

  async createFullCampaign({
    accountId, pageId, product, target, keunggulan,
    objective = 'OUTCOME_TRAFFIC', targeting: _targeting, dailyBudget,
    landingUrl, platform = 'meta', format = 'single_image',
  }, metaApi = null) {
    const meta = metaApi || this.meta;
    log.info('Creating full campaign', { product, objective, platform });
    const steps = [];
    const result = { campaignId: null, adsetId: null, creativeId: null, adId: null, steps };

    try {
      const { aiResult, bestAd } = await this._generateCreative(product, target, keunggulan, platform, format, steps);
      await this._createCampaignStep(accountId, pageId, product, objective, dailyBudget, landingUrl, aiResult, bestAd, result, meta);
      result.status = 'created';
      result.message = 'Campaign created as PAUSED. Activate when ready.';
      result.aiCreative = this._buildAICreative(bestAd, aiResult);
      log.info('Campaign creation completed', { campaignId: result.campaignId, adsetId: result.adsetId, adId: result.adId });
      return result;
    } catch (err) {
      return this._handleCampaignError(err, steps, result, meta);
    }
  }

  _pickBestAd(aiResult, product, keunggulan) {
    return aiResult.copies?.[0] || { hook: product, body: keunggulan, cta: 'Selengkapnya' };
  }

  _buildAICreative(bestAd, aiResult) {
    return { copy: bestAd, imageDirections: aiResult.imageDirections, videoScript: aiResult.videoScript, allCopies: aiResult.copies };
  }

  _handleCampaignError(err, steps, result, meta = this.meta) {
    log.error('Campaign creation failed', { error: err.message });
    this._markStepFailed(steps, err.message);
    result.status = 'failed';
    result.error = err.message;
    this._cleanupPartialCampaign(result.campaignId, meta);
    return result;
  }

  async _runStep(steps, name, fn) {
    steps.push({ step: name, status: 'running' });
    const data = await fn();
    steps[steps.length - 1].status = 'done';
    return data;
  }

  _markStepFailed(steps, error) {
    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (lastStep.status === 'running') {
        lastStep.status = 'failed';
        lastStep.error = error;
      }
    }
  }

  async _cleanupPartialCampaign(campaignId, meta = this.meta) {
    if (!campaignId) return;
    try {
      await meta.updateCampaign(campaignId, { status: 'DELETED' });
      log.info('Cleaned up partially created campaign', { campaignId });
    } catch (cleanupErr) {
      log.error('Failed to cleanup campaign', { campaignId, error: cleanupErr.message });
    }
  }

  async activateCampaign(campaignId, metaApi = null) {
    const meta = metaApi || this.meta;
    return meta.updateCampaign(campaignId, { status: 'ACTIVE' });
  }

  async pauseCampaign(campaignId, metaApi = null) {
    const meta = metaApi || this.meta;
    return meta.updateCampaign(campaignId, { status: 'PAUSED' });
  }

  async createAndActivate(params, { autoActivate = false, delayMs = 5 * 60 * 1000 } = {}) {
    const result = await this.createFullCampaign(params);
    
    if (autoActivate && result.status === 'created' && result.campaignId) {
      log.info('Auto-activation scheduled', { campaignId: result.campaignId, delayMs });
      result.autoActivateScheduled = true;
      result.autoActivateAt = new Date(Date.now() + delayMs).toISOString();
      
      setTimeout(async () => {
        try {
          await this.activateCampaign(result.campaignId, params.metaApi);
          log.info('Campaign auto-activated', { campaignId: result.campaignId });
        } catch (err) {
          log.error('Auto-activation failed', { campaignId: result.campaignId, error: err.message });
        }
      }, delayMs);
    }
    
    return result;
  }

  /**
   * Scale campaign budget up or down.
   */
  async scaleBudget(campaignId, newDailyBudget, metaApi = null) {
    const meta = metaApi || this.meta;
    return meta.updateCampaign(campaignId, { dailyBudget: newDailyBudget });
  }

  _objectiveToOptimization(objective) {
    const map = {
      'OUTCOME_TRAFFIC': 'LINK_CLICKS',
      'OUTCOME_ENGAGEMENT': 'POST_ENGAGEMENT',
      'OUTCOME_SALES': 'OFFSITE_CONVERSIONS',
      'OUTCOME_LEADS': 'LEAD_GENERATION',
      'OUTCOME_AWARENESS': 'REACH',
    };
    return map[objective] || 'LINK_CLICKS';
  }

  _objectiveToCTA(objective) {
    const map = {
      'OUTCOME_TRAFFIC': 'LEARN_MORE',
      'OUTCOME_ENGAGEMENT': 'LIKE_PAGE',
      'OUTCOME_SALES': 'SHOP_NOW',
      'OUTCOME_LEADS': 'SIGN_UP',
      'OUTCOME_AWARENESS': 'LEARN_MORE',
    };
    return map[objective] || 'LEARN_MORE';
  }

  _buildDefaultTargeting(suggestions) {
    return {
      geo_locations: { countries: ['ID'] },
      age_min: 25,
      age_max: 55,
      ...(suggestions?.interests?.length > 0 && {
        flexible_spec: [{ interests: suggestions.interests.map(i => ({ id: i.id, name: i.name })) }],
      }),
    };
  }
}
