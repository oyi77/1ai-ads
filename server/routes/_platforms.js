import { Router } from 'express';
import { createMetaAccountsRouter } from './meta-accounts.js';
import { createMetaContentRouter } from './meta-content.js';
import { createMetaAiRouter } from './meta-ai.js';
import { createGoogleAdsRouter } from './google-ads.js';
import { createTikTokAdsRouter } from './tiktok-ads.js';
import { createLinkedInAdsRouter } from './linkedin-ads.js';
import { createTwitterAdsRouter } from './twitter-ads.js';
import { createSnapchatAdsRouter } from './snapchat-ads.js';
import { createMicrosoftAdsRouter } from './microsoft-ads.js';
import { createPinterestAdsRouter } from './pinterest-ads.js';
import { createAdsLibraryRouter } from './ads-library.js';
import { createAdsLibraryAiRouter } from './ads-library-ai.js';
import { createAdspirerRouter } from './adspirer.js';
import { createFacebookSystemUserRouter } from './facebook-system-user.js';
import { createSelowRouter } from './selow.js';
import { createShopeeDashboardRouter } from './shopee-dashboard.js';
import { requireAuth } from '../middleware/auth.js';

export function createPlatformsGroupRouter({ repos, services, publicRateLimit }) {
  const router = Router();
  router.use('/meta', requireAuth, createMetaAccountsRouter(repos.settingsRepo));
  router.use('/meta/content', requireAuth, createMetaContentRouter(services.videoService, services.contentScheduler));
  router.use('/meta-ai', requireAuth, createMetaAiRouter(repos.settingsRepo));
  router.use('/meta-system', createFacebookSystemUserRouter(services.facebookSystemUserService));
  router.use('/google-ads', requireAuth, createGoogleAdsRouter(repos.settingsRepo));
  router.use('/tiktok-ads', requireAuth, createTikTokAdsRouter(repos.settingsRepo));
  router.use('/linkedin-ads', requireAuth, createLinkedInAdsRouter(repos.settingsRepo));
  router.use('/pinterest-ads', requireAuth, createPinterestAdsRouter(repos.settingsRepo));
  router.use('/snapchat-ads', requireAuth, createSnapchatAdsRouter(repos.settingsRepo));
  router.use('/twitter-ads', requireAuth, createTwitterAdsRouter(repos.settingsRepo));
  router.use('/microsoft-ads', requireAuth, createMicrosoftAdsRouter(repos.settingsRepo));
  router.use('/selow', requireAuth, createSelowRouter(repos.settingsRepo));
  router.use('/shopee', requireAuth, createShopeeDashboardRouter(services.shopeeAdapter, repos.settingsRepo, repos.shopeeCommissionsRepo));
  router.use('/adspirer', requireAuth, createAdspirerRouter(services.adspirerClient, repos.platformAccountsRepo, repos.settingsRepo));
  router.use('/ads-library', publicRateLimit, createAdsLibraryRouter());
  router.use('/ads-library-ai', publicRateLimit, createAdsLibraryAiRouter(repos.settingsRepo));
  return router;
}
