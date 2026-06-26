import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';

const log = createLogger('bulk-ops');

// In-flight operation tracking (process lifetime only)
const operations = new Map();

export class BulkOperations {
  /**
   * @param {Object} metaApi - MetaAdsAPI instance
   * @param {Object} campaignsRepo - CampaignsRepository
   * @param {Object} adsRepo - AdsRepository
   */
  constructor(metaApi, campaignsRepo, adsRepo) {
    this.meta = metaApi;
    this.campaignsRepo = campaignsRepo;
    this.adsRepo = adsRepo;
  }

  /**
   * Get status/result of a tracked bulk operation.
   */
  getOperation(operationId) {
    return operations.get(operationId) || null;
  }

  // ── Bulk Create Ads ──────────────────────────────────────────

  /**
   * Bulk create ad variants from a template.
   * @param {string} accountId
   * @param {{ template: Object, variants: Array<{ hook: string, body: string, image: string }> }} opts
   * @returns {Promise<Array>}
   */
  async bulkCreateAds(accountId, { template, variants }) {
    if (!accountId) throw new Error('accountId is required');
    if (!variants?.length) throw new Error('variants array is required');

    const operationId = crypto.randomUUID();
    const op = {
      id: operationId, type: 'bulk_create_ads', status: 'running',
      total: variants.length, completed: 0, failed: 0, results: [],
      startedAt: new Date().toISOString(),
    };
    operations.set(operationId, op);

    try {
      const results = await this._executeParallel(variants, async (variant, idx) => {
        try {
          const creative = await this.meta.createAdCreative(accountId, {
            name: `${template.name || 'Ad'}_v${idx + 1}`,
            pageId: template.pageId,
            message: variant.body || template.body,
            headline: variant.hook || template.hook,
            linkUrl: template.linkUrl,
            imageHash: variant.image || template.imageHash,
            ctaType: template.ctaType || 'LEARN_MORE',
          });

          const ad = await this.meta.createAd(accountId, {
            adsetId: template.adsetId,
            creativeId: creative.id,
            name: `${template.name || 'Ad'}_v${idx + 1}`,
            status: template.status || 'PAUSED',
          });

          op.completed++;
          return { adId: ad.id, creativeId: creative.id, variantIndex: idx, success: true };
        } catch (err) {
          op.failed++;
          log.warn('bulkCreateAds: variant failed', { idx, error: err.message });
          return { variantIndex: idx, success: false, error: err.message };
        }
      }, { operationId });

      op.results = results;
      op.status = op.failed === 0 ? 'completed' : 'completed_with_errors';
      op.finishedAt = new Date().toISOString();
      return results;
    } catch (err) {
      op.status = 'failed';
      op.error = err.message;
      op.finishedAt = new Date().toISOString();
      throw err;
    }
  }

  // ── Bulk Status Update ───────────────────────────────────────

  /**
   * Bulk pause/resume campaigns.
   * @param {string[]} campaignIds
   * @param {string} status - 'ACTIVE' | 'PAUSED'
   * @returns {Promise<Array>}
   */
  async bulkUpdateStatus(campaignIds, status) {
    if (!campaignIds?.length) throw new Error('campaignIds is required');
    if (!status) throw new Error('status is required');

    const operationId = crypto.randomUUID();
    const op = {
      id: operationId, type: 'bulk_update_status', status: 'running',
      total: campaignIds.length, completed: 0, failed: 0, results: [],
      startedAt: new Date().toISOString(),
    };
    operations.set(operationId, op);

    try {
      const results = await this._executeParallel(campaignIds, async (campaignId) => {
        try {
          await this.meta.updateCampaign(campaignId, { status });
          op.completed++;
          return { campaignId, success: true };
        } catch (err) {
          op.failed++;
          return { campaignId, success: false, error: err.message };
        }
      }, { operationId });

      op.results = results;
      op.status = op.failed === 0 ? 'completed' : 'completed_with_errors';
      op.finishedAt = new Date().toISOString();
      return results;
    } catch (err) {
      op.status = 'failed';
      op.error = err.message;
      op.finishedAt = new Date().toISOString();
      throw err;
    }
  }

  // ── Bulk Scale Budget ────────────────────────────────────────

  /**
   * Bulk scale budgets across campaigns.
   * @param {string[]} campaignIds
   * @param {{ action: 'multiply'|'set', value: number }} opts
   * @returns {Promise<Array>}
   */
  async bulkScaleBudget(campaignIds, { action, value }) {
    if (!campaignIds?.length) throw new Error('campaignIds is required');
    if (!action || value === undefined) throw new Error('action and value are required');

    const operationId = crypto.randomUUID();
    const op = {
      id: operationId, type: 'bulk_scale_budget', status: 'running',
      total: campaignIds.length, completed: 0, failed: 0, results: [],
      startedAt: new Date().toISOString(),
    };
    operations.set(operationId, op);

    try {
      const results = await this._executeParallel(campaignIds, async (campaignId) => {
        try {
          // Fetch current campaign to get existing budget
          const campaign = this.campaignsRepo?.findById?.(campaignId);
          const oldBudget = campaign?.budget || campaign?.dailyBudget || 0;

          let newBudget;
          if (action === 'multiply') {
            newBudget = oldBudget * value;
          } else {
            newBudget = value;
          }
          newBudget = Math.round(newBudget * 100) / 100;

          await this.meta.updateCampaign(campaignId, { dailyBudget: newBudget });
          op.completed++;
          return { campaignId, oldBudget, newBudget, success: true };
        } catch (err) {
          op.failed++;
          return { campaignId, success: false, error: err.message };
        }
      }, { operationId });

      op.results = results;
      op.status = op.failed === 0 ? 'completed' : 'completed_with_errors';
      op.finishedAt = new Date().toISOString();
      return results;
    } catch (err) {
      op.status = 'failed';
      op.error = err.message;
      op.finishedAt = new Date().toISOString();
      throw err;
    }
  }

  // ── Clone Campaign ───────────────────────────────────────────

  /**
   * Clone a campaign structure (campaign + adsets + ads) to a new account.
   * @param {string} sourceCampaignId
   * @param {string} targetAccountId
   * @param {{ rename?: string }} opts
   * @returns {Promise<Object>}
   */
  async cloneCampaign(sourceCampaignId, targetAccountId, { rename } = {}) {
    if (!sourceCampaignId) throw new Error('sourceCampaignId is required');
    if (!targetAccountId) throw new Error('targetAccountId is required');

    const operationId = crypto.randomUUID();
    const op = {
      id: operationId, type: 'clone_campaign', status: 'running',
      total: 1, completed: 0, failed: 0,
      startedAt: new Date().toISOString(),
    };
    operations.set(operationId, op);

    try {
      // Fetch source campaign details from API
      const sourceCampaign = this.campaignsRepo?.findById?.(sourceCampaignId);
      const campaignName = rename || `${sourceCampaign?.name || 'Campaign'} (Copy)`;

      // Create the campaign on Meta
      const newCampaign = await this.meta.createCampaign(targetAccountId, {
        name: campaignName,
        objective: sourceCampaign?.objective || 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        dailyBudget: sourceCampaign?.budget || sourceCampaign?.dailyBudget,
      });

      // Attempt to fetch and recreate adsets
      let adsetIds = [];
      let adIds = [];

      try {
        const adsets = await this.meta._get(`/${sourceCampaignId}/adsets`, {
          fields: 'id,name,status,daily_budget,targeting,billing_event,optimization_goal',
          limit: '50',
        });

        for (const as of (adsets.data || [])) {
          try {
            const newAdset = await this.meta.createAdSet(targetAccountId, newCampaign.id, {
              name: as.name,
              dailyBudget: as.daily_budget ? parseFloat(as.daily_budget) / 100 : undefined,
              targeting: as.targeting,
              billingEvent: as.billing_event,
              optimizationGoal: as.optimization_goal,
            });
            adsetIds.push(newAdset.id);

            // Clone ads in this adset
            try {
              const ads = await this.meta._get(`/${as.id}/ads`, {
                fields: 'id,name,status,creative',
                limit: '50',
              });
              for (const ad of (ads.data || [])) {
                if (ad.creative?.id) {
                  const newAd = await this.meta.createAd(targetAccountId, {
                    adsetId: newAdset.id,
                    creativeId: ad.creative.id,
                    name: ad.name,
                    status: 'PAUSED',
                  });
                  adIds.push(newAd.id);
                }
              }
            } catch { /* ads within adset are optional */ }
          } catch (err) {
            log.warn('cloneCampaign: adset clone failed', { adset: as.id, error: err.message });
          }
        }
      } catch { /* adsets may not be accessible */ }

      op.completed = 1;
      op.status = 'completed';
      op.finishedAt = new Date().toISOString();
      op.result = { campaignId: newCampaign.id, adsetIds, adIds };

      return op.result;
    } catch (err) {
      op.status = 'failed';
      op.error = err.message;
      op.finishedAt = new Date().toISOString();
      throw err;
    }
  }

  // ── Parallel Execution Engine ────────────────────────────────

  /**
   * Execute items in parallel with bounded concurrency.
   * @param {Array} items
   * @param {Function} fn - async (item, index) => result
   * @param {{ concurrency?: number, operationId?: string }} opts
   * @returns {Promise<Array>}
   */
  async _executeParallel(items, fn, { concurrency = 5, operationId } = {}) {
    const results = new Array(items.length);
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < items.length) {
        const idx = nextIndex++;
        try {
          results[idx] = await fn(items[idx], idx);
        } catch (err) {
          results[idx] = { success: false, error: err.message };
        }

        // Emit progress event
        if (operationId) {
          const op = operations.get(operationId);
          if (op) {
            log.debug('bulk_progress', {
              operationId,
              completed: op.completed + op.failed,
              total: op.total,
            });
          }
        }
      }
    };

    const numWorkers = Math.min(concurrency, items.length);
    await Promise.all(Array.from({ length: numWorkers }, () => worker()));

    return results;
  }
}
