import { Router } from 'express';
import { createMcpRouter } from './mcp.js';
import { requireAuth } from '../middleware/auth.js';

export function createMcpGroupRouter({ repos, services }) {
  const mcpClient = services.mcpClient;
  const router = Router();
  router.use('/mcp', requireAuth, createMcpRouter(mcpClient, repos.settingsRepo, repos.campaignsRepo, repos.adsRepo, repos.landingRepo));
  return router;
}
