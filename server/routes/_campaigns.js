import { requireAuth } from '../middleware/auth.js';
import { Router } from 'express';
import { createCampaignsRouter } from './campaigns.js';
import { createAdsRouter } from './ads.js';
import { createLandingRouter } from './landing.js';
import { createDraftRouter } from './drafts.js';
import { createTemplatesRouter } from './templates.js';
import { createBatchRouter } from './batch.js';
import { createBulkRouter } from './bulk.js';
import { createPixelRouter } from './pixels.js';
import { createAdsetsRouter } from './adsets.js';
import { createInvoicesRouter } from './invoices.js';

export function createCampaignsGroupRouter({ repos, services }) {
  const router = Router();
  router.use('/campaigns', requireAuth, createCampaignsRouter(services.orchestrator, services.metaApi, services.creativeStudio, repos.campaignsRepo, repos.adsRepo, repos.adsetsRepo, repos.draftsRepo, repos.platformAccountsRepo));
  router.use('/ads', requireAuth, createAdsRouter(repos.adsRepo, services.creativeStudio));
  router.use('/landing', requireAuth, createLandingRouter(repos.landingRepo, services.llmClient));
  router.use('/drafts', requireAuth, createDraftRouter(services.draftService));
  router.use('/adsets', requireAuth, createAdsetsRouter(repos.adsetsRepo));
  router.use('/invoices', requireAuth, createInvoicesRouter(repos.invoicesRepo));
  router.use('/templates', requireAuth, createTemplatesRouter(repos.templatesRepo));
  router.use('/ops/bulk', requireAuth, createBulkRouter(services.bulkOperations, repos));
  router.use('/batch', requireAuth, createBatchRouter(services.metaApi));
  router.use('/pixels', requireAuth, createPixelRouter(services.metaApi));
  return router;
}
