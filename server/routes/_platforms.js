/**
 * Platform routes — dynamically registered from the platform registry.
 *
 * Each platform in PLATFORM_REGISTRY gets a route at /<routePath>.
 * Platforms with a custom routeModule use that module's factory;
 * platforms without one get the generic router (accounts, campaigns, sync).
 *
 * Non-platform integrations (Meta AI, Shopee, Adspirer, Ads Library)
 * are still registered explicitly below.
 */

import { Router } from 'express';
import { PLATFORM_REGISTRY } from '../platforms/index.js';
import { createGenericPlatformRouter } from './platform-generic.js';
import { requireAuth } from '../middleware/auth.js';

// Custom route modules for non-generic platforms
import { createMetaContentRouter } from './meta-content.js';
import { createMetaAiRouter } from './meta-ai.js';
import { createFacebookSystemUserRouter } from './facebook-system-user.js';
import { createSelowRouter } from './selow.js';
import { createShopeeDashboardRouter } from './shopee-dashboard.js';
import { createAdspirerRouter } from './adspirer.js';
import { createAdsLibraryRouter } from './ads-library.js';
import { createAdsLibraryAiRouter } from './ads-library-ai.js';

// Cache for dynamically imported route factories
const routeModuleCache = new Map();

async function getRouteFactory(routeModule, routeFactory) {
  const cacheKey = `${routeModule}#${routeFactory}`;
  if (routeModuleCache.has(cacheKey)) return routeModuleCache.get(cacheKey);
  const mod = await import(routeModule);
  const factory = mod[routeFactory];
  routeModuleCache.set(cacheKey, factory);
  return factory;
}

export function createPlatformsGroupRouter({ repos, services, publicRateLimit }) {
  const router = Router();

  // ── Platform metadata endpoint (for frontend) ───────────────
  router.get('/platforms', (_req, res) => {
    const platforms = Object.entries(PLATFORM_REGISTRY).map(([, cfg]) => ({
      key: cfg.key,
      label: cfg.label,
      color: cfg.color,
      desc: cfg.desc,
      icon: cfg.icon,
      routePath: cfg.routePath,
    }));
    res.json({ success: true, data: platforms });
  });


  // ── Registry-driven platform routes ────────────────────────────
  // We register routes synchronously using the registry. For platforms with
  // custom route modules, we dynamically import them on first request (lazy).
  for (const [key, cfg] of Object.entries(PLATFORM_REGISTRY)) {
    const routePath = `/${cfg.routePath}`;

    if (cfg.routeModule && cfg.routeFactory) {
      // Custom route module — lazy-load on first request
      let resolved = false;
      let cachedRouter = null;

      router.use(routePath, requireAuth, async (req, res, next) => {
        if (!resolved) {
          try {
            const factory = await getRouteFactory(cfg.routeModule, cfg.routeFactory);
          cachedRouter = factory(repos.settingsRepo, repos.platformAccountsRepo);
            resolved = true;
          } catch (err) {
            next(err);
            return;
          }
        }
      cachedRouter(req, res, next);
      });
    } else {
      router.use(routePath, requireAuth, createGenericPlatformRouter(key, cfg.label, repos.settingsRepo, repos.platformAccountsRepo));
    }
  }

  // ── Meta extensions (content, AI, system user) ─────────────────
  router.use('/meta/content', requireAuth, createMetaContentRouter(services.videoService, services.contentScheduler));
  router.use('/meta-ai', requireAuth, createMetaAiRouter(repos.settingsRepo));
  router.use('/meta-system', createFacebookSystemUserRouter(services.facebookSystemUserService));

  // ── Non-platform integrations ──────────────────────────────────
  router.use('/selow', requireAuth, createSelowRouter(repos.settingsRepo));
  router.use('/shopee', requireAuth, createShopeeDashboardRouter(services.shopeeAdapter, repos.settingsRepo, repos.shopeeCommissionsRepo));
  router.use('/adspirer', requireAuth, createAdspirerRouter(services.adspirerClient, repos.platformAccountsRepo, repos.settingsRepo));
  router.use('/ads-library', publicRateLimit, createAdsLibraryRouter());
  router.use('/ads-library-ai', publicRateLimit, createAdsLibraryAiRouter(repos.settingsRepo));

  return router;
}
