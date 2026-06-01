/**
 * Scale Manager — Campaign Duplication, Interest Expansion, Budget Cap Discovery
 *
 * From IKLAN_WORKFLOW FASE 2:
 * - Duplicate winning campaign (same creative, different interest)
 * - Hidden interest expansion (brand competitors, media, activities)
 * - Budget cap discovery (Rp 200rb → 500rb → 1jt → 2jt → ...)
 * - Scale-up trigger: ROAS >= 2 OR (CTR > 2% AND CPC < 120)
 *
 * SOLID: Single Responsibility — only scale-up logic.
 */

import { shouldScale, ROAS_THRESHOLDS, METRIC_THRESHOLDS } from './profitability-calculator.js';
import { canIncreaseBudget } from './stoploss-engine.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('scale-manager');

const BUDGET_LADDER = [
  200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000,
];

export class ScaleManager {
  constructor(metaApi, llmClient) {
    this.meta = metaApi;
    this.llm = llmClient;
  }

  /**
   * Check if campaign qualifies for scale-up.
   * @param {object} metrics - { roas, ctr, cpc }
   * @returns {{ canScale: boolean, reason: string }}
   */
  evaluateScaleEligibility(metrics) {
    if (shouldScale(metrics)) {
      return { canScale: true, reason: `ROAS ${metrics.roas} >= 2, CTR ${metrics.ctr}% >= 2%, CPC ${metrics.cpc} <= 120` };
    }

    const reasons = [];
    if (metrics.roas < ROAS_THRESHOLDS.SCALE_UP) reasons.push(`ROAS ${metrics.roas} < ${ROAS_THRESHOLDS.SCALE_UP}`);
    if (metrics.ctr < METRIC_THRESHOLDS.CTR_SCALE) reasons.push(`CTR ${metrics.ctr}% < ${METRIC_THRESHOLDS.CTR_SCALE}%`);
    if (metrics.cpc > METRIC_THRESHOLDS.CPC_SCALE) reasons.push(`CPC ${metrics.cpc} > ${METRIC_THRESHOLDS.CPC_SCALE}`);
    return { canScale: false, reason: reasons.join(', ') };
  }

  /**
   * Duplicate a winning campaign with new interests.
   * @param {string} accountId - Meta ad account ID
   * @param {string} sourceCampaignId - Winning campaign to duplicate
   * @param {string[]} newInterests - New interest targeting
   * @returns {object} New campaign IDs
   */
  async duplicateCampaign(accountId, sourceCampaignId, newInterests) {
    log.info('Duplicating winning campaign', { sourceCampaignId, newInterestCount: newInterests.length });

    // Get source campaign details
    // NOTE: fetches all campaigns and filters client-side — Meta API does not support
    // fetching a single campaign by ID via getCampaigns(); consider adding getById if available.
    const source = await this.meta.getCampaigns(accountId, { limit: 100 });
    const sourceCampaign = source.find(c => c.id === sourceCampaignId);
    if (!sourceCampaign) throw new Error(`Campaign ${sourceCampaignId} not found`);

    // Create new campaign (same settings, PAUSED)
    const newCampaign = await this.meta.createCampaign(accountId, {
      name: `${sourceCampaign.name} [SCALE] ${new Date().toISOString().split('T')[0]}`,
      objective: sourceCampaign.objective,
      status: 'PAUSED',
      dailyBudget: sourceCampaign.daily_budget || 200_000,
    });

    // Create adset with new interests
    const targeting = {
      geo_locations: { countries: ['ID'] },
      age_min: 25,
      interests: newInterests.map(i => ({ name: i })),
    };

    const newAdset = await this.meta.createAdSet(accountId, newCampaign.id, {
      name: `${sourceCampaign.name} - ${newInterests[0]}`,
      dailyBudget: sourceCampaign.daily_budget || 200_000,
      targeting,
      optimizationGoal: 'LINK_CLICKS',
    });

    log.info('Campaign duplicated', { newCampaignId: newCampaign.id, newAdsetId: newAdset.id });
    return {
      campaignId: newCampaign.id,
      adsetId: newAdset.id,
      status: 'PAUSED',
      requiresManualActivation: true,
    };
  }

  /**
   * Generate hidden interests using LLM.
   * @param {string} product - Product name/description
   * @param {string[]} currentInterests - Already-used interests
   * @returns {string[]} New hidden interests
   */
  async expandHiddenInterests(product, currentInterests = []) {
    if (!this.llm) {
      log.warn('LLM not available, returning default interests');
      return [];
    }

    const prompt = `You are a Facebook Ads expert finding hidden interests for Shopee Affiliate products.

Product: ${product}
Current interests already used: ${currentInterests.join(', ') || 'none'}

Find 5-10 hidden interests that:
1. Are NOT the obvious broad terms (e.g., not "kecantikan" for beauty)
2. Target competitor brands (e.g., "Sephora", "Wardah", "The Ordinary")
3. Target media/publications the audience reads
4. Target activities/habits correlated with high purchasing power
5. Are available as Facebook interest targeting

Return ONLY a JSON array of strings. Example: ["Sephora", "Wardah", "K-beauty"]`;

    try {
      const result = await this.llm.generate(prompt);
      const cleaned = result.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) {
        log.warn('LLM returned non-array for hidden interests', { type: typeof parsed });
        return [];
      }
      const newInterests = parsed.filter(i => typeof i === 'string' && !currentInterests.includes(i));
      log.info('Hidden interests generated', { count: newInterests.length });
      return newInterests;
    } catch (err) {
      log.error('Failed to generate hidden interests', { error: err.message });
      return [];
    }
  }

  /**
   * Discover budget cap through iterative testing.
   * @param {string} campaignId
   * @param {number} currentBudget - Current daily budget
   * @param {boolean} roasIsDropping - Whether ROAS is currently dropping
   * @returns {{ newBudget: number, action: string, reason: string }}
   */
  discoverBudgetCap(currentBudget, roasIsDropping) {
    const budgetCheck = canIncreaseBudget(roasIsDropping);
    if (!budgetCheck.allowed) {
      return { newBudget: currentBudget, action: 'HOLD', reason: budgetCheck.reason };
    }

    // Find next step in budget ladder
    const nextBudget = BUDGET_LADDER.find(b => b > currentBudget);
    if (!nextBudget) {
      return { newBudget: currentBudget, action: 'MAX_REACHED', reason: `Already at max budget ladder step: Rp${currentBudget}` };
    }

    return {
      newBudget: nextBudget,
      action: 'INCREASE',
      reason: `Budget cap discovery: Rp${currentBudget.toLocaleString()} → Rp${nextBudget.toLocaleString()}`,
    };
  }
}
