/**
 * Domain: Workflow — IKLAN_WORKFLOW Orchestrator
 *
 * 7-step weekly cycle:
 * MON: research → TUE: post_video → WED: launch_campaign →
 * THU: monitor → FRI: evaluate → SAT: decide → SUN: review
 *
 * Delegates to optimization domain for decisions.
 * Delegates to platform clients for API calls.
 */

import { createLogger } from '../lib/logger.js';
import { evaluateMetrics, evaluateStoploss, evaluateScaleEligibility, generateReport } from './optimization.js';

const log = createLogger('domain:workflow');

const EVALUATION_DAYS = 3;

const WEEKLY_CYCLE = {
  MONDAY: 'research',
  TUESDAY: 'post_video',
  WEDNESDAY: 'launch_campaign',
  THURSDAY: 'monitor',
  FRIDAY: 'evaluate',
  SATURDAY: 'decide',
  SUNDAY: 'review',
};

/**
 * Run daily campaign check — evaluate all active campaigns.
 * @param {object} params
 * @param {object} params.metaApi — Meta API client
 * @param {object} params.campaignsRepo — campaigns repository
 * @param {string} params.userId
 * @returns {object[]} actions taken
 */
export async function runDailyCheck({ metaApi, campaignsRepo, userId }) {
  log.info('Running daily check', { userId });
  const campaigns = campaignsRepo.findActive ? await campaignsRepo.findActive(userId) : [];
  const results = [];

  for (const campaign of campaigns) {
    try {
      const result = await checkCampaign({ metaApi, campaign });
      if (result) results.push(result);
    } catch (err) {
      log.error('Campaign check failed', { campaignId: campaign.id, error: err.message });
    }
  }

  log.info('Daily check complete', { userId, checked: campaigns.length, actions: results.length });
  return results;
}

/**
 * Check a single campaign — get insights, evaluate, decide.
 */
async function checkCampaign({ metaApi, campaign }) {
  if (!campaign.platform_campaign_id) return null;

  const insights = await metaApi.getCampaignInsights(campaign.platform_campaign_id, { datePreset: 'last_3d' });
  if (!insights) return null;

  const spend = parseFloat(insights.spend || 0);
  const commission = campaign.commission || 0;
  const metrics = evaluateMetrics(commission, spend);
  const report = generateReport({
    product: campaign.product_name || campaign.name,
    day: campaign.days_running || 0,
    totalDays: EVALUATION_DAYS,
    spend,
    commission,
  });

  return { campaignId: campaign.id, ...metrics, ...report };
}

/**
 * Evaluate a campaign for stoploss/scale decisions.
 */
export function evaluateCampaignDecision({ currentROAS, previousROAS, consecutiveDrops, alreadyReducedBudget, currentDailyBudget, metrics }) {
  const stoploss = evaluateStoploss({
    currentROAS, previousROAS, consecutiveDrops, alreadyReducedBudget, currentDailyBudget,
  });

  const scale = evaluateScaleEligibility(metrics);

  return { stoploss, scale, shouldAct: stoploss.action !== 'MONITOR' || scale.canScale };
}

/**
 * Get the current day's workflow step.
 */
export function getCurrentWorkflowStep() {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const today = days[new Date().getDay()];
  return { day: today, step: WEEKLY_CYCLE[today] || 'rest' };
}
