import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { createWhatsappWebhookRouter, createWhatsappApiRouter } from './whatsapp-intelligence.js';

export function createWhatsappIntelligenceGroupRouter({ services }) {
  const router = Router();

  // Public webhook endpoint — no auth required (called by Meta)
  router.use('/whatsapp-intelligence/webhook', createWhatsappWebhookRouter(services.waIntelligence));
  // Internal API endpoints (service-to-service, called by 1ai-hub).
  // WhatsApp conversations are single-tenant (one WABA per deployment, no
  // user_id column) — gate to ADMIN so any authenticated user cannot read
  // every tenant's conversations.
  router.use('/whatsapp-intelligence', requireAdmin, createWhatsappApiRouter(services.waIntelligence));

  return router;
}
