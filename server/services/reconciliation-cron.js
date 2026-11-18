import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';
import { normalizeCampaignStatus } from '../lib/campaign-status.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';
import { MetaAdsAPI } from './meta/index.js';
import { getPlatformSync } from '../platforms/index.js';

const log = createLogger('reconciliation');

/**
 * Campaign State Reconciliation (Phase 3d).
 *
 * Periodically compares each LOCAL campaign row against the platform's current
 * state and records drift in `campaign_reconciliation_log` (migration 058).
 *
 * Design decisions:
 * - DRY-RUN BY DEFAULT. Drift is logged, never auto-corrected unless
 *   `RECONCILE_APPLY=1`. Silent correction of live campaigns is exactly the
 *   class of bug this project has been removing.
 * - Per-owner tokens only (resolveOwnerPlatformToken) — never the operator
 *   credential, matching campaign-monitor._ownerApi.
 * - Every failure is logged and swallowed per campaign; one broken account
 *   must not stop the sweep.
 */

const SUPPORTED_PLATFORMS = new Set(['meta', 'google', 'tiktok', 'linkedin']);

export class ReconciliationService {
  /**
   * @param {object} deps
   * @param {object} deps.db - better-sqlite3 instance
   * @param {object} deps.campaignsRepo
   * @param {object} deps.platformAccountsRepo
   * @param {object} deps.settingsRepo
   * @param {boolean} [deps.apply] - override RECONCILE_APPLY env
   */
  constructor({ db, campaignsRepo, platformAccountsRepo, settingsRepo, apply }) {
    this.db = db;
    this.campaignsRepo = campaignsRepo;
    this.platformAccountsRepo = platformAccountsRepo;
    this.settingsRepo = settingsRepo;
    this.apply = apply ?? process.env.RECONCILE_APPLY === '1';
    this._interval = null;
  }

  /** Build a platform client bound to the CAMPAIGN OWNER's token. */
  _ownerApi(platform, userId) {
    if (!userId) return null;
    const token = resolveOwnerPlatformToken(platform, userId, {
      platformAccountsRepo: this.platformAccountsRepo,
      settingsRepo: this.settingsRepo,
    });
    if (!token) return null;
    if (platform === 'meta') return MetaAdsAPI.withToken(token);
    const api = getPlatformSync(platform, this.settingsRepo);
    if (!api) return null;
    api.setActiveAccount(null, token, true);
    return api;
  }

  /**
   * Reconcile one account's campaigns.
   * @param {string} platform
   * @param {string} accountId - platform ad-account id (act_<id> for Meta)
   * @param {string} userId
   * @returns {Promise<{platform, accountId, checked, drifted, applied, errors}>}
   */
  async reconcileAccount(platform, accountId, userId) {
    const result = { platform, accountId, checked: 0, drifted: 0, applied: 0, errors: 0 };
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      result.errors++;
      log.debug('Unsupported platform for reconciliation', { platform });
      return result;
    }

    const api = this._ownerApi(platform, userId);
    if (!api || typeof api.getCampaigns !== 'function') {
      result.errors++;
      log.warn('No owner token for reconciliation', { platform, accountId, userId });
      return result;
    }

    let remote = [];
    try {
      remote = await api.getCampaigns(accountId, { limit: 500 });
    } catch (err) {
      result.errors++;
      log.warn('Reconciliation fetch failed', { platform, accountId, error: err.message });
      return result;
    }

    const byId = new Map((Array.isArray(remote) ? remote : []).map(c => [String(c.id), c]));

    for (const local of this.campaignsRepo.findAll({ platform, userId }).data || []) {
      const remoteRow = byId.get(String(local.campaign_id));
      if (!remoteRow) continue;

      result.checked++;
      const localStatus = normalizeCampaignStatus(local.status);
      const remoteStatus = normalizeCampaignStatus(remoteRow.status);
      const localBudget = Number(local.budget) || 0;
      const remoteBudget = Number(remoteRow.dailyBudget ?? remoteRow.daily_budget ?? 0) || 0;

      const statusDrift = localStatus !== remoteStatus;
      const budgetDrift = remoteBudget > 0 && Math.abs(localBudget - remoteBudget) > 1;

      if (!statusDrift && !budgetDrift) continue;

      result.drifted++;
      const details = {
        ...(statusDrift ? { status: { local: localStatus, remote: remoteStatus } } : {}),
        ...(budgetDrift ? { budget: { local: localBudget, remote: remoteBudget } } : {}),
      };

      if (this.apply) {
        try {
          // Only adopt the REMOTE state — the platform is the source of truth.
          const patch = {};
          if (statusDrift) patch.status = remoteStatus;
          if (budgetDrift) patch.budget = remoteBudget;
          this.campaignsRepo.update(local.id, patch, userId);
          result.applied++;
        } catch (err) {
          result.errors++;
          log.warn('Reconciliation apply failed', { campaignId: local.id, error: err.message });
        }
      }

      this._logDrift({
        campaignId: local.id,
        userId,
        platform,
        localStatus,
        remoteStatus,
        localBudget,
        remoteBudget,
        drifted: true,
        details,
        applied: this.apply,
      });
    }

    return result;
  }

  /**
   * Sweep every active platform account for every user with a usable token.
   */
  async reconcileAll() {
    const summary = { accounts: 0, checked: 0, drifted: 0, applied: 0, errors: 0 };
    const accounts = this.platformAccountsRepo.getAccounts() || [];

    for (const account of accounts) {
      const platform = account.platform;
      if (!SUPPORTED_PLATFORMS.has(platform)) continue;
      const userId = account.user_id;
      const accountId = account.credentials?.ad_account_id
        || account.credentials?.fb_account_id
        || account.account_id;
      if (!userId || !accountId) continue;

      summary.accounts++;
      try {
        const r = await this.reconcileAccount(platform, accountId, userId);
        summary.checked += r.checked;
        summary.drifted += r.drifted;
        summary.applied += r.applied;
        summary.errors += r.errors;
      } catch (err) {
        summary.errors++;
        log.warn('Reconciliation sweep failed for account', { platform, accountId, error: err.message });
      }
    }

    log.info('Reconciliation sweep complete', { ...summary, apply: this.apply });
    return summary;
  }

  _logDrift({ campaignId, userId, platform, localStatus, remoteStatus, localBudget, remoteBudget, drifted, details, applied }) {
    try {
      this.db.prepare(`
        INSERT INTO campaign_reconciliation_log
          (id, campaign_id, user_id, platform, local_status, remote_status,
           local_budget, remote_budget, drift_detected, drift_details, success)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        crypto.randomUUID(), campaignId, userId, platform,
        localStatus, remoteStatus, localBudget, remoteBudget,
        drifted ? 1 : 0,
        JSON.stringify({ ...details, applied: !!applied }),
      );
    } catch (err) {
      log.warn('Reconciliation log write failed', { campaignId, error: err.message });
    }
  }

  /**
   * Start the periodic sweep. Default 6 hours, matching campaign-monitor.
   * @param {number} [intervalMs]
   */
  start(intervalMs = 6 * 60 * 60 * 1000) {
    if (this._interval) return;
    log.info(`Reconciliation cron started (every ${intervalMs / 3600000}h, apply=${this.apply})`);
    this._interval = setInterval(() => {
      this.reconcileAll().catch(err => log.error('Reconciliation sweep error', { error: err.message }));
    }, intervalMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

export default ReconciliationService;
