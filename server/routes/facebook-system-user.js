import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { requireAuth } from '../middleware/auth.js';

const log = createLogger('meta-system-user');

export function createFacebookSystemUserRouter(fbSystemUserService) {
  const router = Router();

  // All routes require auth
  router.use(requireAuth);

  /** GET /api/meta-system/businesses */
  router.get('/businesses', async (req, res) => {
    try {
      const data = await fbSystemUserService.getBusinesses();
      res.json({ success: true, data: data.data });
    } catch (err) {
      log.error('Failed to fetch businesses', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** GET /api/meta-system/businesses/:businessId/ad-accounts */
  router.get('/businesses/:businessId/ad-accounts', async (req, res) => {
    try {
      const data = await fbSystemUserService.getOwnedAdAccounts(req.params.businessId);
      res.json({ success: true, data: data.data });
    } catch (err) {
      log.error('Failed to fetch owned ad accounts', { businessId: req.params.businessId, error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** GET /api/meta-system/businesses/:businessId/pages */
  router.get('/businesses/:businessId/pages', async (req, res) => {
    try {
      const data = await fbSystemUserService.getOwnedPages(req.params.businessId);
      res.json({ success: true, data: data.data });
    } catch (err) {
      log.error('Failed to fetch owned pages', { businessId: req.params.businessId, error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** GET /api/meta-system/ad-accounts */
  router.get('/ad-accounts', async (req, res) => {
    try {
      const data = await fbSystemUserService.getAdAccounts();
      res.json({ success: true, data: data.data });
    } catch (err) {
      log.error('Failed to fetch ad accounts', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** GET /api/meta-system/ad-accounts/:accountId */
  router.get('/ad-accounts/:accountId', async (req, res) => {
    try {
      const data = await fbSystemUserService.getAdAccountDetails(req.params.accountId);
      res.json({ success: true, data });
    } catch (err) {
      log.error('Failed to fetch ad account details', { accountId: req.params.accountId, error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /** POST /api/meta-system/ad-accounts/:accountId/campaigns */
  router.post('/ad-accounts/:accountId/campaigns', async (req, res) => {
    try {
      const data = await fbSystemUserService.createCampaign(req.params.accountId, req.body);
      res.json({ success: true, data });
    } catch (err) {
      log.error('Failed to create campaign', { accountId: req.params.accountId, error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
