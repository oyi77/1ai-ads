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
      // Status is persisted lower-case ('active'/'paused'), so the old
      // upper-case compare reported 0 active campaigns on every report.
      activeCampaigns: campaigns.filter(c => String(c.status).toLowerCase() === 'active').length,
      totalSpend: stats.totalSpend,
      totalROAS: stats.totalROAS,
      actionsTaken: this._getActionsTakenToday(userId),
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

  /**
   * Count of rule actions fired today for ONE tenant.
   *
   * `getAll()` takes the owner id; calling it bare binds undefined and returns
   * an empty list, and the hydrated rows expose `lastTriggeredAt` — so the old
   * `last_triggered` check was dead on both counts (always reported 0).
   */
  _getActionsTakenToday(userId) {
    try {
      if (!userId) return 0;
      const today = new Date().toISOString().split('T')[0];
      const rules = this.rulesRepo.getAll(userId) || [];
      return rules.filter(r => String(r.lastTriggeredAt ?? '').startsWith(today)).length;
    } catch (err) {
      log.error('Failed to count actions today', { userId, error: err.message });
      return 0;
    }
  }
}
