import { Router } from 'express';
import { createAutomationRouter } from './automation.js';
import { createScheduleRouter } from './schedule.js';
import { createAutonomousRouter } from './autonomous.js';
import { createOptimizerRouter } from './optimizer.js';
import { createLearningRouter } from './learning.js';
import { createTrendingRouter } from './trending.js';
import { createResearchRouter } from './research.js';
import { createAgencyRouter } from './agency.js';
import { createCapiRouter } from './capi.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePlan } from '../middleware/rbac.js';

export function createAutomationGroupRouter({ repos, services, publicRateLimit }) {
  const router = Router();
  router.use('/automation', requireAuth, requirePlan('pro'), createAutomationRouter({ rulesRepo: repos.rulesRepo }));
  router.use('/schedule', requireAuth, createScheduleRouter(repos.db));
  router.use('/autonomous', requireAuth, createAutonomousRouter(repos.settingsRepo, repos.platformAccountsRepo, repos.campaignsRepo, repos.rulesRepo, services.autonomousAgent));
  router.use('/optimizer', requireAuth, createOptimizerRouter(repos.rulesRepo, services.autoOptimizer));
  router.use('/learning', requireAuth, createLearningRouter(services.learningService));
  router.use('/trending', publicRateLimit, createTrendingRouter(services.trendingService));
  router.use('/research', requireAuth, createResearchRouter(services.adResearchService));
  router.use('/agency', requireAuth, createAgencyRouter(services.whiteLabelService));
  router.use('/agency/capi', requireAuth, createCapiRouter(services.capiMonitor));
  return router;
}
