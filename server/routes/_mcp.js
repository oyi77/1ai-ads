import { Router } from 'express';
import { createMcpRouter } from './mcp.js';
import { requireAuth } from '../middleware/auth.js';

export function createMcpGroupRouter({ repos, services }) {
  const router = Router();
  router.use('/mcp', requireAuth, createMcpRouter(repos.settingsRepo, repos.campaignsRepo, repos.adsRepo, repos.landingRepo, repos.platformAccountsRepo, services));
  return router;
}
