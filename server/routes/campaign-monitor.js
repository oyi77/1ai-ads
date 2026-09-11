import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

/**
 * Build the campaign-monitor router.
 *
 * `:accountId` is the REAL Meta ad-account id (`act_<numeric>` or bare numeric),
 * matching `/reporting/accounts/:accountId/*`. `platform_accounts.id` is an
 * internal UUID and must never reach the Graph API — passing it returns
 * 400 "Object with ID '<uuid>' does not exist", which previously degraded every
 * method on this router to its empty/`api_unavailable` fallback.
 *
 * @param {object} campaignMonitorService
 * @param {object} [repos] - { platformAccountsRepo }
 */
export function createCampaignMonitorRouter(campaignMonitorService, repos = {}) {
  const router = Router();
  const platformAccountsRepo = repos.platformAccountsRepo || null;

  const normalize = (id) => String(id ?? '').replace(/^act_/, '');

  /**
   * Resolve the caller's own platform_accounts row for :accountId, returning the
   * canonical `act_<id>` plus the connected currency. Scans ONLY rows owned by
   * req.user.id, so another user's account id resolves to null → 404 (no
   * cross-user leak, no oracle distinguishing "missing" from "not yours").
   */
  const resolveOwned = async (req) => {
    if (!platformAccountsRepo) return null;
    const wanted = normalize(req.params.accountId);
    if (!/^\d+$/.test(wanted)) return null;

    const rows = platformAccountsRepo.findAllActiveByUserAndPlatform(req.user.id, 'meta');

    // Fast path: the ad-account id recorded at connect time.
    for (const row of rows) {
      if (normalize(row.credentials?.ad_account_id) === wanted) {
        return { accountId: `act_${wanted}`, currency: row.credentials?.ad_account_currency || null };
      }
    }
    // Connect flows also persist rows keyed by the Meta account id as account_name.
    for (const row of rows) {
      if (normalize(row.account_name) === wanted) {
        return { accountId: `act_${wanted}`, currency: row.credentials?.ad_account_currency || null };
      }
    }

    // Slow path: token-only rows (no recorded ad account). Ask Meta which of the
    // caller's own tokens can see this account.
    const { MetaAdsAPI } = await import('../services/meta/index.js');
    for (const row of rows) {
      const token = row.credentials?.access_token || row.access_token;
      if (!token) continue;
      try {
        const accounts = await MetaAdsAPI.withToken(token).getAdAccounts();
        const found = accounts.find((a) => normalize(a.id) === wanted);
        if (found) return { accountId: `act_${wanted}`, currency: found.currency || null };
      } catch { /* try the next token */ }
    }
    return null;
  };

  /** Shared prologue: resolve ownership, 404 otherwise. */
  const withOwnedAccount = (handler) => async (req, res) => {
    try {
      const owned = await resolveOwned(req);
      if (!owned) return res.status(404).json({ success: false, error: 'Account not found' });
      const data = await handler(owned, req);
      res.json({ success: true, data });
    } catch (err) {
      res.status(err.status || 500).json({ success: false, error: err.message });
    }
  };

  // GET /api/campaign-monitor/:accountId/status
  router.get('/:accountId/status', requireAuth, withOwnedAccount(
    ({ accountId }, req) => campaignMonitorService.getAccountStatus(accountId, req.user.id)
  ));

  // GET /api/campaign-monitor/:accountId/health
  router.get('/:accountId/health', requireAuth, withOwnedAccount(
    ({ accountId }, req) => campaignMonitorService.getAccountHealth(accountId, req.user.id)
  ));

  // GET /api/campaign-monitor/:accountId/alerts
  router.get('/:accountId/alerts', requireAuth, withOwnedAccount(
    ({ accountId }, req) => campaignMonitorService.getAlerts(accountId, req.user.id)
  ));

  // GET /api/campaign-monitor/:accountId/trend?days=7
  router.get('/:accountId/trend', requireAuth, withOwnedAccount(
    ({ accountId }, req) => campaignMonitorService.getPerformanceTrend(accountId, parseInt(req.query.days) || 7, req.user.id)
  ));

  // POST /api/campaign-monitor/:accountId/auto-pause-check
  router.post('/:accountId/auto-pause-check', requireAuth, withOwnedAccount(
    ({ accountId }, req) => campaignMonitorService.autoPauseCheck(accountId, req.user.id)
  ));

  return router;
}
