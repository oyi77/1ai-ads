import { requireAuth } from '../middleware/auth.js';
import { Router } from 'express';
import { createAiAgentRouter } from './ai-agent.js';
import { createAudienceRouter } from './audiences.js';
import { createAudienceIntelligenceRouter } from './audience-intelligence.js';
import { createSavedAudiencesRouter } from './saved-audiences.js';
import { requirePlan } from '../middleware/rbac.js';

export function createAiGroupRouter({ repos, services }) {
  const router = Router();
  router.use('/ai-agent', requireAuth, requirePlan('pro'), createAiAgentRouter(services.aiAgent, repos.settingsRepo));
  router.use('/audiences', requireAuth, createAudienceRouter(services.metaApi));
  router.use('/audience/intelligence', requireAuth, requirePlan('pro'), createAudienceIntelligenceRouter(services.audienceIntelligence));
  router.use('/audiences/saved', requireAuth, createSavedAudiencesRouter(repos.savedAudiencesRepo));
  return router;
}
