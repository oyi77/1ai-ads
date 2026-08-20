/**
 * WhatsApp Business Ads — custom platform router.
 *
 * WhatsApp is a messaging/template platform, NOT a campaign-buying platform.
 * It intentionally does NOT implement the 5-method BasePlatformApiClient campaign
 * contract (getCampaigns / createCampaign / updateCampaign are unsupported by the
 * WhatsApp Cloud API). Mounting it on the generic campaign router would fail
 * validatePlatform on every request, so it gets its own surface here:
 *   - business accounts
 *   - message templates (list + create)
 *   - account sync (templates per account)
 *
 * Per-request client is bound to the REQUESTING USER's token (SaaS), matching
 * the generic router's isolation model. No fallback to a shared system token.
 */

import { Router } from 'express';
import { WhatsAppAdsAPI } from '../services/whatsapp/index.js';
import { resolveUserPlatformToken } from '../lib/resolve-user-platform.js';
import { ValidationError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('whatsapp-ads');

export function createWhatsAppAdsRouter(settingsRepo, platformAccountsRepo) {
  const router = Router();

  // Build a WhatsApp client bound to the REQUESTING USER's token (SaaS).
  // Direct instantiation bypasses getPlatform() so the campaign-method gate
  // (validatePlatform) is not enforced — WhatsApp legitimately lacks campaigns.
  function clientFor(req) {
    const api = new WhatsAppAdsAPI(settingsRepo);
    const token = resolveUserPlatformToken('whatsapp', req, platformAccountsRepo, settingsRepo);
    if (!token) {
      throw new ValidationError('WhatsApp account not connected. Please connect your account in Settings.');
    }
    api.setActiveAccount(null, token, true);
    return api;
  }

  // GET /accounts — list WhatsApp Business Accounts
  router.get('/accounts', async (req, res) => {
    try {
      const api = clientFor(req);
      const accounts = await api.getAccounts();
      res.json({ success: true, data: { accounts, total: accounts.length } });
    } catch (err) {
      log.error('WhatsApp accounts fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // GET /templates?accountId= — list message templates for an account
  router.get('/templates', async (req, res) => {
    try {
      const api = clientFor(req);
      const { accountId } = req.query;
      if (!accountId) {
        return res.status(400).json({ success: false, error: 'accountId is required' });
      }
      const templates = await api.getMessageTemplates(accountId);
      res.json({ success: true, data: { templates, total: templates.length } });
    } catch (err) {
      log.error('WhatsApp templates fetch failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /templates — create a message template
  router.post('/templates', async (req, res) => {
    try {
      const api = clientFor(req);
      const { accountId, ...body } = req.body;
      if (!accountId) {
        return res.status(400).json({ success: false, error: 'accountId is required' });
      }
      const result = await api.createMessageTemplate(accountId, body);
      res.json({ success: true, data: result });
    } catch (err) {
      log.error('WhatsApp template creation failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // POST /sync — sync all business accounts (templates per account)
  router.post('/sync', async (req, res) => {
    try {
      const api = clientFor(req);
      const results = await api.syncAllAccounts();
      res.json({ success: true, data: { results, total: results.length } });
    } catch (err) {
      log.error('WhatsApp sync failed', { error: err.message });
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
