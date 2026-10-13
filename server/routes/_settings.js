import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createSettingsRouter } from './settings.js';
import { createPaymentsRouter } from './payments.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

/**
 * Per-user throttle for the AI probe endpoints under /settings/ai.
 * These call the shared upstream LLM gateway with the deployment key, so an
 * unthrottled loop by one user would burn the shared quota for everyone.
 * Keyed by user id (falls back to IP). 15/min is ample for the admin UI.
 */
function aiProbeLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { success: false, error: 'Terlalu banyak percobaan AI — tunggu sebentar lalu coba lagi.' },
    validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  });
}

export function createSettingsGroupRouter({ repos, services }) {
  const router = Router();
  const settingsRouter = createSettingsRouter(repos.settingsRepo, services.llmClient, repos.db, services.metaApi, services.nangoAuth);

  // LLM provider config (URL + api key) is a GLOBAL singleton shared by every
  // tenant — llmClient.updateConfig() redirects ALL AI traffic, so a non-admin
  // changing it would leak other tenants' prompts to their own endpoint.
  // The whole /api/settings/ai surface is therefore admin-only + throttled.
  // Every other /settings route stays self-serve for authenticated users.
  router.use('/settings/ai', requireAuth, requireAdmin, aiProbeLimiter());

  router.use('/settings', requireAuth, settingsRouter);
  router.use('/payments', requireAuth, createPaymentsRouter(services.paymentService));
  return router;
}
