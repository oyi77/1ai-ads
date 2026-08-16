import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

/**
 * Build the campaign-monitor router.
 * @param {object} campaignMonitorService
 * @param {object} [repos] - { platformAccountsRepo }
 */
export function createCampaignMonitorRouter(campaignMonitorService, repos = {}) {
  const router = Router();
  const platformAccountsRepo = repos.platformAccountsRepo || null;

  // Per-user ownership guard: the Meta ad account id is the platform_accounts.id
  // column, owned by req.user.id. Any other user MUST get 404 (no cross-user leak).
  const ensureOwned = async (req, res, next) => {
    if (!platformAccountsRepo) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    const account = await platformAccountsRepo.findById(req.params.accountId);
    if (!account || account.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    next();
  };

  // GET /api/campaign-monitor/:accountId/status
  router.get('/:accountId/status', requireAuth, ensureOwned, async (req, res) => {
    try {
      const data = await campaignMonitorService.getAccountStatus(req.params.accountId, req.user.id);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/campaign-monitor/:accountId/health
  router.get('/:accountId/health', requireAuth, ensureOwned, async (req, res) => {
    try {
      const data = await campaignMonitorService.getAccountHealth(req.params.accountId, req.user.id);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/campaign-monitor/:accountId/alerts
  router.get('/:accountId/alerts', requireAuth, ensureOwned, async (req, res) => {
    try {
      const data = await campaignMonitorService.getAlerts(req.params.accountId, req.user.id);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/campaign-monitor/:accountId/trend?days=7
  router.get('/:accountId/trend', requireAuth, ensureOwned, async (req, res) => {
    try {
      const days = parseInt(req.query.days) || 7;
      const data = await campaignMonitorService.getPerformanceTrend(req.params.accountId, days, req.user.id);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/campaign-monitor/:accountId/auto-pause-check
  router.post('/:accountId/auto-pause-check', requireAuth, ensureOwned, async (req, res) => {
    try {
      const data = await campaignMonitorService.autoPauseCheck(req.params.accountId, req.user.id);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
