import { requireAuth } from '../middleware/auth.js';
import { Router } from 'express';
import { createWhatsappWebhookRouter, createWhatsappApiRouter } from './whatsapp-intelligence.js';

export function createWhatsappIntelligenceGroupRouter({ services }) {
  const router = Router();

  // Public webhook endpoint — no auth required (called by Meta)
  router.use('/whatsapp-intelligence/webhook', createWhatsappWebhookRouter(services.waIntelligence));

  // Authenticated API endpoints
  router.use('/whatsapp-intelligence', requireAuth, createWhatsappApiRouter(services.waIntelligence));

  return router;
}
