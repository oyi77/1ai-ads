import { Router } from 'express';
import { MetaAdsAPI } from '../services/meta/index.js';
import { resolveOwnerPlatformToken } from '../lib/resolve-owner-platform.js';
import { requireAuth } from '../middleware/auth.js';

/**
 * @param {Object} capiMonitor
 * @param {Object} [platformAccountsRepo] - scoped to the requesting user
 * @param {Object} [settingsRepo]
 */
export function createCapiRouter(capiMonitor, platformAccountsRepo, settingsRepo) {
  const router = Router();

  // Resolve the platform account that owns `accountId`, verify it belongs to
  // the authenticated user, and run the health check with the OWNER's own
  // Meta token — never a system token and never another user's account.
  // `platform_accounts.id` for the `meta` platform is the Meta ad account id
  // (act_<id> / numeric), so findById scopes the lookup to the owner.
  async function scopedHealth(req, accountId) {
    const account = platformAccountsRepo?.findById?.(accountId);
    if (!account || account.user_id !== req.user.id) {
      const err = new Error('Account not found');
      err.statusCode = 404;
      throw err;
    }
    const token = resolveOwnerPlatformToken('meta', req.user.id, { platformAccountsRepo, settingsRepo });
    if (!token) {
      const err = new Error('No Meta token bound to this account');
      err.statusCode = 403;
      throw err;
    }
    const ownerApi = MetaAdsAPI.withToken(token);
    return capiMonitor.checkHealth(accountId, { api: ownerApi });
  }

  router.get('/health/:accountId', requireAuth, async (req, res) => {
    try {
      const data = await scopedHealth(req, req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  });

  router.get('/quality/:accountId', requireAuth, async (req, res) => {
    try {
      const data = await scopedHealth(req, req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
  });

  return router;
}
