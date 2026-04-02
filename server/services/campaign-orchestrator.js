/**
 * Campaign Orchestrator - chains AI creative generation with Meta campaign creation.
 * Flow: AI generates creative → create campaign → create adset → create ad creative → create ad
 * All campaigns created as PAUSED by default (explicit activation required).
 */

export class CampaignOrchestrator {
  constructor(metaApi, creativeStudio) {
    this.meta = metaApi;
    this.creative = creativeStudio;
  }

  /**
   * Create a full campaign from product info.
   * Returns all created IDs for review before activation.
   */
  async createFullCampaign({
    accountId, pageId, product, target, keunggulan,
    objective = 'OUTCOME_TRAFFIC', targeting, dailyBudget,
    landingUrl, platform = 'meta', format = 'single_image',
  }) {
    const steps = [];
    const result = { campaignId: null, adsetId: null, creativeId: null, adId: null, steps };

    try {
      // Step 1: Generate AI creative
      steps.push({ step: 'ai_creative', status: 'running' });
      const aiResult = await this.creative.generateAdPackage(product, target, keunggulan, platform, format);
      const bestAd = aiResult.copies?.[0] || { hook: product, body: keunggulan, cta: 'Selengkapnya' };
      steps[steps.length - 1] = { step: 'ai_creative', status: 'done', data: { model: bestAd.model_name, hook: bestAd.hook } };

      // Step 2: Create campaign (PAUSED)
      steps.push({ step: 'create_campaign', status: 'running' });
      const campaignName = `${product} - ${objective} - ${new Date().toISOString().split('T')[0]}`;
      const campaign = await this.meta.createCampaign(accountId, {
        name: campaignName,
        objective,
        status: 'PAUSED',
        dailyBudget,
      });
      result.campaignId = campaign.id;
      steps[steps.length - 1] = { step: 'create_campaign', status: 'done', data: { id: campaign.id, name: campaignName } };

      // Step 3: Create ad set with targeting
      steps.push({ step: 'create_adset', status: 'running' });
      const adsetName = `${product} - ${target}`;
      const finalTargeting = targeting || this._buildDefaultTargeting(aiResult.targetingSuggestions);
      const adset = await this.meta.createAdSet(accountId, campaign.id, {
        name: adsetName,
        dailyBudget,
        targeting: finalTargeting,
        optimizationGoal: this._objectiveToOptimization(objective),
      });
      result.adsetId = adset.id;
      steps[steps.length - 1] = { step: 'create_adset', status: 'done', data: { id: adset.id, name: adsetName } };

      // Step 4: Create ad creative
      steps.push({ step: 'create_creative', status: 'running' });
      const adMessage = `${bestAd.hook}\n\n${bestAd.body}`;
      const creative = await this.meta.createAdCreative(accountId, {
        name: `${product} Creative`,
        pageId,
        message: adMessage,
        headline: bestAd.cta || product,
        description: keunggulan,
        linkUrl: landingUrl || 'https://example.com',
        ctaType: this._objectiveToCTA(objective),
      });
      result.creativeId = creative.id;
      steps[steps.length - 1] = { step: 'create_creative', status: 'done', data: { id: creative.id } };

      // Step 5: Create ad
      steps.push({ step: 'create_ad', status: 'running' });
      const ad = await this.meta.createAd(accountId, {
        adsetId: adset.id,
        creativeId: creative.id,
        name: `${product} Ad - ${bestAd.model_name || 'AI'}`,
        status: 'PAUSED',
      });
      result.adId = ad.id;
      steps[steps.length - 1] = { step: 'create_ad', status: 'done', data: { id: ad.id } };

      result.status = 'created';
      result.message = 'Campaign created as PAUSED. Activate when ready.';
      result.aiCreative = {
        copy: bestAd,
        imageDirections: aiResult.imageDirections,
        videoScript: aiResult.videoScript,
        allCopies: aiResult.copies,
      };

      return result;

    } catch (err) {
      // Mark current step as failed
      if (steps.length > 0) {
        const lastStep = steps[steps.length - 1];
        if (lastStep.status === 'running') {
          lastStep.status = 'failed';
          lastStep.error = err.message;
        }
      }
      result.status = 'failed';
      result.error = err.message;

      // Cleanup: delete partially created objects
      if (result.campaignId) {
        try { await this.meta.updateCampaign(result.campaignId, { status: 'DELETED' }); } catch {}
      }

      return result;
    }
  }

  /**
   * Activate a paused campaign (and its adsets/ads).
   */
  async activateCampaign(campaignId) {
    return this.meta.updateCampaign(campaignId, { status: 'ACTIVE' });
  }

  /**
   * Pause a running campaign.
   */
  async pauseCampaign(campaignId) {
    return this.meta.updateCampaign(campaignId, { status: 'PAUSED' });
  }

  /**
   * Scale campaign budget up or down.
   */
  async scaleBudget(campaignId, newDailyBudget) {
    return this.meta.updateCampaign(campaignId, { dailyBudget: newDailyBudget });
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
