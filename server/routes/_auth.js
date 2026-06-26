import { Router } from 'express';
import { createAuthRouter } from './auth.js';
import { createAdminRouter } from './admin.js';
import { createTokenRouter } from './tokens.js';
import { createEventsRouter } from './events.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

export function createAuthGroupRouter({ repos, services, publicRateLimit }) {
  const router = Router();
  router.use('/auth', publicRateLimit, createAuthRouter(repos.usersRepo, repos.refreshTokensRepo, repos.settingsRepo));
  router.use('/admin', requireAuth, requireAdmin, createAdminRouter(repos.usersRepo, repos.settingsRepo));
  router.use('/tokens', requireAuth, createTokenRouter());
  router.use('/events', requireAuth, createEventsRouter());
  return router;
}
