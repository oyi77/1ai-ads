import { Router } from 'express';
import { createWhatsappWebhookRouter, createWhatsappApiRouter } from './whatsapp-intelligence.js';

export function createWhatsappIntelligenceGroupRouter({ services }) {
  const router = Router();

  // Public webhook endpoint — no auth required (called by Meta)
  router.use('/whatsapp-intelligence/webhook', createWhatsappWebhookRouter(services.waIntelligence));
  // Internal API endpoints (service-to-service, called by 1ai-hub)
  router.use('/whatsapp-intelligence', createWhatsappApiRouter(services.waIntelligence));

  return router;
}
