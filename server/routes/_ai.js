import { Router } from 'express';
import { createAiAgentRouter } from './ai-agent.js';
import { createAudienceRouter } from './audiences.js';
import { createAudienceIntelligenceRouter } from './audience-intelligence.js';
import { requireAuth } from '../middleware/auth.js';

export function createAiGroupRouter({ repos, services }) {
  const router = Router();
  router.use('/ai-agent', requireAuth, createAiAgentRouter(services.aiAgent, repos.settingsRepo));
  router.use('/audiences', requireAuth, createAudienceRouter(services.metaApi));
  router.use('/audience/intelligence', requireAuth, createAudienceIntelligenceRouter(services.audienceIntelligence));
  return router;
}
