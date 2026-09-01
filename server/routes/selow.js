/**
 * SELOW Routes — Ad Account Management API
 *
 * Endpoints:
 * GET  /api/selow/accounts        — List all accounts
 * GET  /api/selow/accounts/:id    — Get account detail
 * POST /api/selow/accounts/:id/topup — Initiate topup
 * GET  /api/selow/summary          — Portfolio summary
 */

import { Router } from 'express';
import { SelowAPI } from '../services/selow-api.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('routes:selow');

export function createSelowRouter(settingsRepo) {
  const router = Router();

  // Cache the SELOW API instance; only recreate when cookies change
  let cachedClient = null;
  let cachedCookies = null;

  function getSelowClient() {
    const creds = settingsRepo?.getCredentials?.('selow');
    if (!creds?.cookies) {
      cachedClient = null;
      cachedCookies = null;
      return null;
    }
    if (cachedClient && cachedCookies === creds.cookies) {
      return cachedClient;
    }
    cachedClient = new SelowAPI(creds.cookies);
    cachedCookies = creds.cookies;
    return cachedClient;
  }

  // GET /api/selow/accounts
  router.get('/accounts', async (req, res, next) => {
    try {
      const client = getSelowClient();
      if (!client) return res.status(401).json({ error: 'SELOW not configured. Set cookies in Settings.' });

      const { search, status, page, pageSize } = req.query;
      const result = await client.listAccounts({
        search: search || '',
        status: status || '',
        current: parseInt(page) || 1,
        pageSize: parseInt(pageSize) || 10,
      });

      res.json(result);
    } catch (err) {
      log.error('Failed to list SELOW accounts', { error: err.message });
      next(err);
    }
  });

  // GET /api/selow/accounts/:id
  router.get('/accounts/:id', async (req, res, next) => {
    try {
      const client = getSelowClient();
      if (!client) return res.status(401).json({ error: 'SELOW not configured' });

      const account = await client.getAccount(req.params.id);
      res.json({ success: true, data: account });
    } catch (err) {
      log.error('Failed to get SELOW account', { id: req.params.id, error: err.message });
      next(err);
    }
  });

  // POST /api/selow/accounts/:id/topup
  router.post('/accounts/:id/topup', async (req, res, next) => {
    try {
      const client = getSelowClient();
      if (!client) return res.status(401).json({ error: 'SELOW not configured' });

      const { amount, merchant } = req.body;
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return res.status(400).json({ error: 'Amount must be a positive number' });
      }

      const result = await client.topupBalance(req.params.id, amt, merchant || 'bri');
      res.json(result);
    } catch (err) {
      log.error('Failed to topup SELOW account', { id: req.params.id, error: err.message });
      next(err);
    }
  });

  // GET /api/selow/summary
  router.get('/summary', async (_req, res, next) => {
    try {
      const client = getSelowClient();
      if (!client) return res.status(401).json({ error: 'SELOW not configured' });

      const summary = await client.getPortfolioSummary();
      res.json({ success: true, data: summary });
    } catch (err) {
      log.error('Failed to get SELOW summary', { error: err.message });
      next(err);
    }
  });

  return router;
}
