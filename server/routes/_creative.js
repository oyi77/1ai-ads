import { Router } from 'express';
import { createCreativeLibraryRouter } from './creative-library.js';
import { createScoringRouter } from './scoring.js';
import { createFatigueRouter } from './fatigue.js';
import { createABTestsRouter } from './ab-tests.js';
import { createImagesRouter } from './images.js';
import { requireAuth } from '../middleware/auth.js';

export function createCreativeGroupRouter({ repos: _repos, services }) {
  const router = Router();
  router.use('/creative/library', requireAuth, createCreativeLibraryRouter(services.creativeLibraryRepo));
  router.use('/creative/scoring', requireAuth, createScoringRouter(services.creativeScorer));
  router.use('/creative/fatigue', requireAuth, createFatigueRouter(services.fatigueDetector));
  router.use('/testing/ab-tests', requireAuth, createABTestsRouter(services.abTestService));
  router.use('/creative/images', requireAuth, createImagesRouter(services.imageGenerator));
  return router;
}
