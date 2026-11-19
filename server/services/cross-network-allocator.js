/**
 * Cross-network allocation adviser (Phase 4).
 *
 * Generates cross-platform budget recommendations from normalized local
 * campaign metrics. Advisory-only by default; live changes require both
 * `CROSS_NETWORK_APPLY=1` and an injected ActionGateway/PolicyEngine.
 * No platform API is called in advisory mode.
 */
import { createLogger } from '../lib/logger.js';

const log = createLogger('cross-network-allocator');

export class CrossNetworkAllocator {
  constructor({ campaignsRepo, actionGateway = null, settingsRepo = null } = {}) {
    this.campaignsRepo = campaignsRepo;
    this.actionGateway = actionGateway;
    this.settingsRepo = settingsRepo;
  }

  /**
   * Recommend budget allocation across platforms by ROAS.
   * @param {string} userId
   * @param {number} totalBudget
   * @returns {{userId,totalBudget,allocations,advisory}}
   */
  recommend(userId, totalBudget) {
    const budget = Number(totalBudget);
    if (!userId) throw new Error('userId is required');
    if (!Number.isFinite(budget) || budget <= 0) throw new Error('totalBudget must be positive');

    const rows = this.campaignsRepo.findAll({ userId })?.data || [];
    const byPlatform = new Map();
    for (const row of rows) {
      const platform = row.platform || 'unknown';
      const bucket = byPlatform.get(platform) || { platform, spend: 0, revenue: 0 };
      bucket.spend += Number(row.spend) || 0;
      bucket.revenue += Number(row.revenue) || 0;
      byPlatform.set(platform, bucket);
    }

    const scored = [...byPlatform.values()].map(row => ({
      ...row,
      roas: row.spend > 0 ? row.revenue / row.spend : 0,
    })).filter(row => row.spend > 0);
    const totalRoas = scored.reduce((sum, row) => sum + row.roas, 0);
    const allocations = (scored.length ? scored : [{ platform: 'meta', roas: 0 }]).map(row => ({
      platform: row.platform,
      roas: row.roas,
      recommendedBudget: Math.round((totalRoas > 0 ? row.roas / totalRoas : 1 / (scored.length || 1)) * budget * 100) / 100,
      advisory: true,
    }));
    return { userId, totalBudget: budget, allocations, advisory: true };
  }

  /**
   * Apply an allocation only when explicitly enabled. Uses ActionGateway so
   * allowlist, trust tier, budget, approval, and audit gates remain mandatory.
   */
  async applyRecommendation(userId, recommendation) {
    if (process.env.CROSS_NETWORK_APPLY !== '1') {
      return { applied: false, reason: 'CROSS_NETWORK_APPLY not set', recommendation };
    }
    if (!this.actionGateway) return { applied: false, reason: 'action_gateway_not_configured' };
    const results = [];
    for (const item of recommendation.allocations || []) {
      const campaigns = this.campaignsRepo.findAll({ userId, platform: item.platform })?.data || [];
      for (const campaign of campaigns) {
        results.push(await this.actionGateway.execute({
          platform: item.platform,
          accountId: campaign.account_id || campaign.accountId,
          campaignId: campaign.campaign_id,
          action: 'set_budget',
          params: { daily_budget: item.recommendedBudget },
        }, { userId, tier: 'approval_first', role: 'user' }, {
          source: 'cross_network_allocator', requestId: `allocation-${Date.now()}`,
        }));
      }
    }
    log.info('Cross-network allocation applied', { userId, count: results.length });
    return { applied: true, results };
  }
}

export default CrossNetworkAllocator;
