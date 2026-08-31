/**
 * Autonomous Agent — Thin Orchestrator
 *
 * Delegates to focused services (SRP):
 * - FacebookConnectionService: OAuth + account linking
 * - RuleEvaluator: rule matching + action dispatch
 * - CampaignReporter: daily reports + stats
 * - WorkflowEngine: IKLAN_WORKFLOW orchestration
 * - ScaleManager: scale-up logic
 *
 * This class only coordinates: scheduler loop + service wiring.
 */

import config from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { FacebookConnectionService } from './facebook-connection.js';
import { RuleEvaluator } from './rule-evaluator.js';
import { CampaignReporter } from './campaign-reporter.js';

const log = createLogger('autonomous-agent');

export class AutonomousAgent {
  constructor(settingsRepo, platformAccountsRepo, campaignsRepo, rulesRepo, llmClient, aiAgent, platformApis = {}, draftService = null) {
    this.facebook = new FacebookConnectionService(platformAccountsRepo);
    this.ruleEvaluator = new RuleEvaluator(settingsRepo, campaignsRepo, rulesRepo, llmClient, platformApis, draftService);
    this.reporter = new CampaignReporter(campaignsRepo, rulesRepo, aiAgent);
    this.platformAccountsRepo = platformAccountsRepo;
    this.draftService = draftService;
    this.scheduler = null;
  }

  // ─── Facebook Connection (delegates to FacebookConnectionService) ───

  async connectFacebook(authCode, redirectUri) {
    return this.facebook.connectFacebook(authCode, redirectUri);
  }

  async getFacebookAccounts(accessToken) {
    return this.facebook.getFacebookAccounts(accessToken);
  }

  async linkFacebookAccount(userId, accountId, accountName, accessToken) {
    return this.facebook.linkFacebookAccount(userId, accountId, accountName, accessToken);
  }

  // ─── Rules (delegates to RuleEvaluator) ───

  createRule(userId, opts) {
    return this.ruleEvaluator.createRule(userId, opts);
  }

  async checkCampaigns(userId) {
    return this.ruleEvaluator.checkCampaigns(userId);
  }

  // ─── Reporting (delegates to CampaignReporter) ───

  async sendDailyReport(userId) {
    return this.reporter.sendDailyReport(userId);
  }

  // ─── Autonomous Loop (orchestration only) ───

  async runAutonomousMode() {
    log.info('Autonomous mode started');

    this.scheduler = setInterval(() => {
      this._runAutonomousCycle().catch(err =>
        log.error('Autonomous mode error', { error: err.message })
      );
    }, config.intervals.autonomousAgent);

    return () => clearInterval(this.scheduler);
  }

  async _runAutonomousCycle() {
    const users = await this.platformAccountsRepo.getUsersWithAutoMode();
    for (const user of users) {
      await this._checkUserCampaigns(user);
    }
  }

  async _checkUserCampaigns(user) {
    const rulesCount = await this.ruleEvaluator.rulesRepo.countEnabled(user.id);
    if (rulesCount === 0) return;

    const platforms = ['meta', 'google', 'tiktok'];
    for (const platform of platforms) {
      const account = await this.platformAccountsRepo.getByPlatform(user.id, platform);
      if (!account?.access_token) continue;

      const matched = await this.checkCampaigns(user.id);
      if (matched > 0) {
        log.info('Autonomous actions executed', { userId: user.id, platform, actions: matched });
      }
    }
  }

}
