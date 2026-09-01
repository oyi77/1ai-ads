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

  async _runAndAssign(steps, name, result, key, fn, extra = {}) {
    steps.push({ step: name, status: 'running' });
    const data = await fn();
    const id = typeof data === 'object' && data !== null ? data.id : data;
    result[key] = id;
    steps[steps.length - 1].status = 'done';
    steps[steps.length - 1].data = { id, ...extra };
    return id;
  }

  async _stepCreative(accountId, pageId, product, bestAd, landingUrl, objective, result, meta = this.meta) {
    // Try to use an existing page photo (avoids /adimages upload which is
    // blocked in dev mode with error (#3) "Application does not have the
    // capability to make this API call"). Falls back to placeholder upload,
    // then to no-image creative if both fail.
    let imageHash;

    // Strategy 1: Use an existing photo from the page
    if (pageId) {
      try {
        const photosRes = await meta._get(`/${pageId}/photos`, { fields: 'images,id', limit: '1' });
        const photos = photosRes.data || [];
        if (photos.length > 0) {
          const photoId = photos[0].id;
          return this._runAndAssign(result.steps, 'create_creative', result, 'creativeId',
            () => meta.createAdCreativeWithPhoto(accountId, {
              name: `${product} Creative`, pageId,
              message: `${bestAd.hook}\n\n${bestAd.body}`, headline: bestAd.cta || product,
              description: product, linkUrl: landingUrl || 'https://example.com',
              photoId,
              ctaType: this._objectiveToCTA(objective),
            }));
        }
      } catch (photoErr) {
        log.warn('Page photo fetch failed — trying placeholder upload', { error: photoErr.message });
      }
    }

    // Strategy 2: Upload a placeholder image (fails in dev mode)
    try {
      const imgData = await meta._post(`/${accountId}/adimages`, {
        url: `https://placehold.co/1080x1080/6366f1/ffffff?text=${encodeURIComponent((bestAd.hook || product).slice(0, 25))}`,
      });
      const imgs = imgData.images || {};
      const firstKey = Object.keys(imgs)[0];
      if (firstKey) imageHash = imgs[firstKey].hash;
    } catch { /* non-fatal — try without image */ }

    // Strategy 3: Create creative with image_hash (or without image)
    return this._runAndAssign(result.steps, 'create_creative', result, 'creativeId',
      () => meta.createAdCreative(accountId, {
        name: `${product} Creative`, pageId,
        message: `${bestAd.hook}\n\n${bestAd.body}`, headline: bestAd.cta || product,
        description: product, linkUrl: landingUrl || 'https://example.com',
        imageHash,
        ctaType: this._objectiveToCTA(objective),
      }));
  }

  async _createCampaignStep(accountId, pageId, product, objective, dailyBudget, landingUrl, aiResult, bestAd, result, meta = this.meta) {
    const steps = result.steps;
    const campaignName = `${product} - ${objective} - ${new Date().toISOString().split('T')[0]}`;
    const campaignId = await this._runAndAssign(steps, 'create_campaign', result, 'campaignId',
      () => meta.createCampaign(accountId, { name: campaignName, objective, status: 'PAUSED' }),
      { name: campaignName });

    const adsetName = `${product} - ${bestAd.hook || product}`;
    const adsetId = await this._runAndAssign(steps, 'create_adset', result, 'adsetId',
      () => meta.createAdSet(accountId, campaignId, {
        name: adsetName, dailyBudget, isCbo: false,
        targeting: this._buildDefaultTargeting(aiResult.targetingSuggestions),
        optimizationGoal: this._objectiveToOptimization(objective),
      }), { name: adsetName });

    // Creative step is non-fatal: if it fails (dev-mode app, no page), the
    // campaign + ad set still exist — user adds creative from the library.
    let creativeId = null;
    try {
      creativeId = await this._stepCreative(accountId, pageId, product, bestAd, landingUrl, objective, result, meta);
    } catch (creativeErr) {
      log.warn('Creative creation failed — campaign/adset still created, add creative later', { error: creativeErr.message });
      result.steps.push({ step: 'create_creative', status: 'failed', error: creativeErr.message });
    }

    if (creativeId) {
      await this._runAndAssign(result.steps, 'create_ad', result, 'adId',
        () => meta.createAd(accountId, {
          adsetId, creativeId,
          name: `${product} Ad - ${bestAd.model_name || 'AI'}`, status: 'PAUSED',
        }));
    } else {
      result.steps.push({ step: 'create_ad', status: 'skipped', error: 'No creative — add from library' });
    }
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
      let aiResult, bestAd;
      try {
        ({ aiResult, bestAd } = await this._generateCreative(product, target, keunggulan, platform, format, steps));
      } catch (creativeErr) {
        log.warn('AI creative failed — using template fallback', { error: creativeErr.message });
        bestAd = {
          hook: product + ' — ' + (keunggulan || target || 'Penawaran terbaik!'),
          body: product + '. ' + (keunggulan || 'Kualitas terjamin.') + ' Kunjungi sekarang!',
          cta: 'Belanja Sekarang',
          model_name: 'template_fallback',
        };
        aiResult = { copies: [bestAd], imageDirections: [] };
        steps.push({ step: 'ai_creative', status: 'done', data: { model: 'template_fallback' } });
      }
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

  async _generateCreative(product, target, keunggulan, platform, format, steps) {
    const aiResult = await this._runStep(steps, 'ai_creative', () =>
      this.creative.generateAdPackage(product, target, keunggulan, platform, format));
    const bestAd = this._pickBestAd(aiResult, product, keunggulan);
    steps[steps.length - 1].data = { model: bestAd.model_name, hook: bestAd.hook };
    return { aiResult, bestAd };
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
    if (result.status === 'created' && autoActivate) {
      const activateAt = Date.now() + delayMs;
      result.autoActivateScheduled = true;
      result.autoActivateAt = activateAt;
      setTimeout(() => {
        this.activateCampaign(result.campaignId).catch(err => {
          log.error('Auto-activation failed', { campaignId: result.campaignId, error: err.message });
        });
      }, delayMs);
    }
    return result;
  }

  async scaleBudget(campaignId, newDailyBudget, metaApi = null) {
    const meta = metaApi || this.meta;
    return meta.updateCampaign(campaignId, { dailyBudget: newDailyBudget });
  }

  _objectiveToOptimization(objective) {
    const map = {
      OUTCOME_TRAFFIC: 'LINK_CLICKS',
      OUTCOME_SALES: 'OFFSITE_CONVERSIONS',
      OUTCOME_LEADS: 'LEAD_GENERATION',
      OUTCOME_ENGAGEMENT: 'POST_ENGAGEMENT',
      OUTCOME_AWARENESS: 'REACH',
    };
    return map[objective] || 'LINK_CLICKS';
  }

  _objectiveToCTA(objective) {
    const map = {
      OUTCOME_TRAFFIC: 'LEARN_MORE',
      OUTCOME_SALES: 'SHOP_NOW',
      OUTCOME_LEADS: 'SIGN_UP',
      OUTCOME_ENGAGEMENT: 'LEARN_MORE',
    };
    return map[objective] || 'LEARN_MORE';
  }

  _buildDefaultTargeting(suggestions) {
    return {
      geo_locations: { countries: ['ID'] },
      age_min: 18,
      age_max: 55,
      targeting_automation: { advantage_audience: 0 },
    };
  }
}
