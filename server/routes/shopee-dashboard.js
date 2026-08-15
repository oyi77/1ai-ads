/**
 * Shopee Dashboard Routes — Thin wiring layer.
 * Handlers + helpers extracted to _handlers/shopee-dashboard-handlers.js.
 */

import { Router } from 'express';
import {
  handleListAccounts,
  handleListOrders,
  handleGetSummary,
  handleUpload,
  handleListUploads,
  handleDeleteUpload,
} from './_handlers/shopee-dashboard-handlers.js';

export function createShopeeDashboardRouter(shopeeAdapter, settingsRepo, commissionsRepo) {
  const router = Router();

  // GET /api/shopee/accounts — list configured Shopee seller accounts
  router.get('/accounts', handleListAccounts(settingsRepo));

  // GET /api/shopee/accounts/:accountId/orders — fetch orders for an account
  router.get('/accounts/:accountId/orders', handleListOrders(shopeeAdapter, settingsRepo));

  // GET /api/shopee/accounts/:accountId/summary — order summary
  router.get('/accounts/:accountId/summary', handleGetSummary(shopeeAdapter, settingsRepo, commissionsRepo));

  // POST /api/shopee/upload — accept CSV file upload, parse, and store
  router.post('/upload', handleUpload(settingsRepo, commissionsRepo));

  // GET /api/shopee/uploads — list uploaded files
  router.get('/uploads', handleListUploads(settingsRepo));

  // DELETE /api/shopee/uploads/:fileId — delete uploaded file
  router.delete('/uploads/:fileId', handleDeleteUpload(settingsRepo));

  return router;
}
