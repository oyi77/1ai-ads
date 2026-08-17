import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createWhatsappWebhookRouter, createWhatsappApiRouter } from './whatsapp-intelligence.js';

export function createWhatsappIntelligenceGroupRouter({ services }) {
  const router = Router();

  // Public webhook endpoint — no auth required (called by Meta)
  router.use('/whatsapp-intelligence/webhook', createWhatsappWebhookRouter(services.waIntelligence));
  // Internal API endpoints (service-to-service, called by 1ai-hub) — require auth to close anonymous cross-user exposure
  router.use('/whatsapp-intelligence', requireAuth, createWhatsappApiRouter(services.waIntelligence));

  return router;
}
