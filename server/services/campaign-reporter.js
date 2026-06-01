/**
 * Campaign Reporter — Daily Reports + Stats
 *
 * Extracted from AutonomousAgent (SRP).
 * Handles only: report generation, stats calculation, report delivery.
 */

import { createLogger } from '../lib/logger.js';

const log = createLogger('campaign-reporter');

export class CampaignReporter {
  constructor(campaignsRepo, rulesRepo, aiAgent) {
    this.campaignsRepo = campaignsRepo;
    this.rulesRepo = rulesRepo;
    this.aiAgent = aiAgent;
  }

  async sendDailyReport(userId) {
    const campaigns = await this.campaignsRepo.getByUserId(userId);
    const stats = this._calculateCampaignStats(campaigns);

    const report = {
      date: new Date().toISOString().split('T')[0],
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      totalSpend: stats.totalSpend,
      totalROAS: stats.totalROAS,
      actionsTaken: this._getActionsTakenToday(),
      newRecommendations: await this.aiAgent.analyzeAndSuggest(userId),
    };

    log.info('Daily report generated', { userId, campaigns: report.totalCampaigns });
    return report;
  }

  _calculateCampaignStats(campaigns) {
    const stats = campaigns.map(c => c.stats || {}).reduce(
      (acc, s) => ({
        totalSpend: acc.totalSpend + (s.spend || 0),
        totalROAS: acc.totalROAS + (s.roas || 0),
      }),
      { totalSpend: 0, totalROAS: 0 }
    );

    return {
      totalSpend: Math.round(stats.totalSpend * 100) / 100,
      totalROAS: campaigns.length > 0
        ? Math.round((stats.totalROAS / campaigns.length) * 100) / 100
        : 0,
    };
  }

  _getActionsTakenToday() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const rules = this.rulesRepo.getAll ? this.rulesRepo.getAll() : (this.rulesRepo.findAll ? this.rulesRepo.findAll() : []);
      return rules.filter(r => r.last_triggered?.startsWith(today)).length;
    } catch (err) {
      log.error('Failed to count actions today', { error: err.message });
      return 0;
    }
  }
}
