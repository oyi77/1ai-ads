import { Router } from 'express';
import { createMcpRouter } from './mcp.js';
import { requireAuth } from '../middleware/auth.js';
import { createActiveUserGate } from '../middleware/active-user-gate.js';

export function createMcpGroupRouter({ repos, services }) {
  const router = Router();
  // DEF-11: MCP write tools are the highest-blast-radius surface — a banned
  // user must be blocked here even inside the JWT's 15-minute lifetime.
  const requireActiveUser = createActiveUserGate(repos.usersRepo);
  router.use('/mcp', requireAuth, requireActiveUser, createMcpRouter(repos.settingsRepo, repos.campaignsRepo, repos.adsRepo, repos.landingRepo, repos.platformAccountsRepo, services));
  return router;
}
