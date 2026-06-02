/**
 * Workflow Engine — Orchestrates Full IKLAN_WORKFLOW
 *
 * Steps:
 * 1. Product research → trigger from external
 * 2. Video posting → delegate to 1ai-social/GoLogin
 * 3. Campaign setup → CampaignOrchestrator
 * 4. Ad config → MetaAdsAPI
 * 5. 3-day evaluation → evaluate after 72h
 * 6. Scale/stop decision → ScaleManager + StoplossEngine
 * 7. Weekly cycle → scheduled runner
 *
 * SOLID: Single Responsibility — orchestration only, delegates to focused services.
 */

import { evaluateMetrics, generateReport, evaluateROAS } from './profitability-calculator.js';
import { evaluateStoploss } from './stoploss-engine.js';
import { ScaleManager } from './scale-manager.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('workflow-engine');

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

export class WorkflowEngine {
  constructor({ metaApi, campaignsRepo, rulesRepo, llmClient, selowApi, notificationService }) {
    this.meta = metaApi;
    this.campaignsRepo = campaignsRepo;
    this.rulesRepo = rulesRepo;
    this.llm = llmClient;
    this.selow = selowApi;
    this.notifier = notificationService;
    this.scaleManager = new ScaleManager(metaApi, llmClient);
  }

  /**
   * Daily check — monitor all active campaigns.
   * @param {string} userId
   * @returns {object[]} Actions taken
   */
  async _checkCampaign(campaign) {
    const insights = await this.meta.getCampaignInsights(campaign.platform_campaign_id, { datePreset: 'last_3d' });
    if (!insights) return null;

    const spend = parseFloat(insights.spend || 0);
    const commission = campaign.commission || 0;
    const metrics = evaluateMetrics(commission, spend);

    return { campaignId: campaign.id, product: campaign.product_name, spend, commission, ...metrics };
  }

  async runDailyCheck(userId) {
    log.info('Running daily check', { userId });
    const campaigns = this.campaignsRepo.findActive(userId);
    const results = [];

    for (const campaign of campaigns) {
      try {
        const result = await this._checkCampaign(campaign);
        if (result) results.push(result);
      } catch (err) {
        log.error('Daily check failed for campaign', { campaignId: campaign.id, error: err.message });
      }
    }

    log.info('Daily check complete', { campaignCount: results.length });
    return results;
  }

  /**
   * 3-day evaluation — decide scale/stop/continue.
   * @param {string} campaignId
   * @returns {object} Evaluation result with decision
   */
  async _applyStoploss(campaign, stoplossResult) {
    if (stoplossResult.action === 'KILL') {
      await this.meta.updateCampaign(campaign.platform_campaign_id, { status: 'PAUSED' });
      this.campaignsRepo.update(campaign.id, { status: 'stopped', stop_reason: stoplossResult.reason });
      return { decision: 'STOP', reason: stoplossResult.reason };
    }
    if (stoplossResult.action === 'REDUCE_BUDGET') {
      await this.meta.updateCampaign(campaign.platform_campaign_id, { daily_budget: stoplossResult.newBudget });
      this.campaignsRepo.update(campaign.id, { daily_budget: stoplossResult.newBudget, budget_reduced: true });
      return { decision: 'REDUCE_BUDGET', newBudget: stoplossResult.newBudget, reason: stoplossResult.reason };
    }
    return null;
  }

  async run3DayEvaluation(campaignId) {
    const campaign = this.campaignsRepo.findById(campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const insights = await this.meta.getCampaignInsights(campaign.platform_campaign_id, { datePreset: 'last_3d' });
    if (!insights) return { decision: 'NO_DATA', reason: 'No insights available' };

    const spend = parseFloat(insights.spend || 0);
    const roas = evaluateROAS(campaign.commission || 0, spend);
    const ctr = parseFloat(insights.ctr || 0);
    const cpc = parseFloat(insights.cpc || 0);

    const stoplossResult = evaluateStoploss({
      currentROAS: roas,
      previousROAS: campaign.previous_roas || roas,
      consecutiveDrops: campaign.consecutive_drops || 0,
      alreadyReducedBudget: campaign.budget_reduced || false,
      currentDailyBudget: campaign.daily_budget || 20_000,
    });

    const stoplossAction = await this._applyStoploss(campaign, stoplossResult);
    if (stoplossAction) return stoplossAction;

    const scaleResult = this.scaleManager.evaluateScaleEligibility({ roas, ctr, cpc });
    if (scaleResult.canScale) return { decision: 'SCALE_UP', reason: scaleResult.reason, metrics: { roas, ctr, cpc } };

    if (roas < 1) {
      await this.meta.updateCampaign(campaign.platform_campaign_id, { status: 'PAUSED' });
      this.campaignsRepo.update(campaignId, { status: 'stopped', stop_reason: `ROAS ${roas} < 1 after 3 days` });
      return { decision: 'STOP', reason: `ROAS ${roas.toFixed(2)} < 1 after 3 days` };
    }

    return { decision: 'CONTINUE', reason: `ROAS ${roas.toFixed(2)} — monitoring continues`, metrics: { roas, ctr, cpc } };
  }

  /**
   * Weekly cycle runner — determines what to do based on day.
   * @returns {object} Today's action
   */
  getWeeklyAction() {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const today = days[new Date().getDay()];
    const action = WEEKLY_CYCLE[today];

    log.info('Weekly cycle', { today, action });
    return { day: today, action, description: this._describeAction(action) };
  }

  _describeAction(action) {
    const descriptions = {
      research: 'Riset produk & video baru',
      post_video: 'Posting video di Fanpage',
      launch_campaign: 'Setup & launch campaign baru',
      monitor: 'Monitoring & evaluasi',
      evaluate: 'Evaluasi data',
      decide: 'Keputusan: scale-up atau matikan',
      review: 'Review mingguan — apa yang berhasil',
    };
    return descriptions[action] || action;
  }

  /**
   * Generate formatted campaign report.
   * @param {string} campaignId
   * @returns {string} Formatted report
   */
  async generateCampaignReport(campaignId) {
    const campaign = this.campaignsRepo.findById(campaignId);
    if (!campaign) throw new Error(`Campaign ${campaignId} not found`);

    const insights = await this.meta.getCampaignInsights(campaign.platform_campaign_id, { datePreset: 'last_3d' });
    const spend = parseFloat(insights?.spend || 0);
    const commission = campaign.commission || 0;
    const daysRunning = Math.ceil((Date.now() - new Date(campaign.created_at).getTime()) / 86400000);

    return generateReport({
      product: campaign.product_name,
      day: daysRunning,
      totalDays: EVALUATION_DAYS,
      spend,
      commission,
    });
  }
}
