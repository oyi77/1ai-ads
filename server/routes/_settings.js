import { Router } from 'express';
import { createSettingsRouter } from './settings.js';
import { createPaymentsRouter } from './payments.js';
import { requireAuth } from '../middleware/auth.js';

export function createSettingsGroupRouter({ repos, services }) {
  const router = Router();
  router.use('/settings', requireAuth, createSettingsRouter(repos.settingsRepo, services.llmClient, repos.db, services.metaApi, services.dailySpendGuard));
  router.use('/payments', requireAuth, createPaymentsRouter(services.paymentService));
  return router;
}
