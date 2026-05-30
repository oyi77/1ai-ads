import fs from 'fs';
import { createAuthRouter } from './routes/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { createTrendingRouter } from './routes/trending.js';
import { createCompetitorSpyRouter } from './routes/competitor-spy.js';
import { createPaymentsRouter } from './routes/payments.js';
import { PaymentsRepository } from './repositories/payments.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createLearningRouter } from './routes/learning.js';
import { createAdsLibraryRoutes } from './routes/ads-library.js';
import { createAdspirerRouter } from './routes/adspirer.js';

import { createScheduleRouter } from './routes/schedule.js';
import { ScheduleRepository } from './repositories/schedule.js';
import { createMetaAccountsRouter } from './routes/meta-accounts.js';
import { createMetaContentRouter } from './routes/meta-content.js';
import { createGoogleAdsRouter } from './routes/google-ads.js';
import { createTikTokAdsRouter } from './routes/tiktok-ads.js';
import { createAutonomousRouter } from './routes/autonomous.js';
import { createAiAgentRouter } from './routes/ai-agent.js';
import createAudienceRouter from './routes/audiences.js';
import createPixelRouter from './routes/pixels.js';
import createBatchRouter from './routes/batch.js';
import createTokenRouter from './routes/tokens.js';
import createWebhookRouter from './routes/webhooks.js';
import { createABTestsRouter } from './routes/ab-tests.js';
import createTrackRouter from './routes/track.js';
import { AdUtmMapRepository } from './repositories/ad-utm-map.js';
import { UtmTaggerService } from './services/utm-tagger.js';
import { createRealtimeRouter } from './routes/realtime.js';
import { RealtimeService } from './services/realtime-service.js';
import { AiAgent } from './services/ai-agent.js';
import { MetaVideoService } from './services/meta-video-service.js';
import { ContentScheduler } from './services/content-scheduler.js';
import { AdResearchService } from './services/ad-research.js';
import rateLimit from 'express-rate-limit';
import express from 'express';
import cors from 'cors';
import config from './config/index.js';

// Import repositories
import { UsersRepository } from './repositories/users.js';
import { RefreshTokensRepository } from './repositories/refresh-tokens.js';
import { SettingsRepository } from './repositories/settings.js';
import { LandingRepository } from './repositories/landing.js';
import { CampaignsRepository } from './repositories/campaigns.js';
import { AdsRepository } from './repositories/ads.js';
import { TemplatesRepository } from './repositories/templates.js';
import { CompetitorsRepository } from './repositories/competitors.js';
import { PlatformAccountsRepository } from './repositories/platform-accounts.js';
import { AiSuggestionsRepository } from './repositories/ai-suggestions.js';
import { WebhookEventsRepository } from './repositories/webhook-events.js';

// Import services
import { RulesRepository } from './repositories/rules.js';
import { LLMClient } from './services/llm-client.js';
import { AdspirerMcpClient } from './services/adspirer-mcp-client.js';
import { TrendingService } from './services/trending.js';
import { LearningService } from './services/learning.js';
import { PaymentService } from './services/payments.js';

import { AutonomousAgent } from './services/autonomous-agent.js';
import { AutoOptimizer } from './services/auto-optimizer.js';
import { CampaignOrchestrator } from './services/campaign-orchestrator.js';
import { CreativeStudio } from './services/creative-studio.js';
import { MetaAdsAPI } from './services/meta-api.js';

import { createCampaignsRouter } from './routes/campaigns.js';
import { createAdsRouter } from './routes/ads.js';
import { createLandingRouter } from './routes/landing.js';
import { createSettingsRouter } from './routes/settings.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createResearchRouter } from './routes/research.js';
import { createMcpRouter } from './routes/mcp.js';
import { ScalevService } from './services/scalev.js';
import { ShopeeAdapter } from './services/shopee-adapter.js';
import { AttributionService } from './services/attribution-service.js';

import { AttributionRepository } from './repositories/attribution.js';
import createAttributionRouter from './routes/attribution.js';



// Import middleware
import { requireAuth } from './middleware/auth.js';


export function createApp(params) {
  // Support both direct db and { db, llmClient, mcpClient } pattern
  const db = params && typeof params === 'object' && params.db ? params.db : params;
  // Create repositories
  const usersRepo = new UsersRepository(db);
  const refreshTokensRepo = new RefreshTokensRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const landingRepo = new LandingRepository(db);
  const campaignsRepo = new CampaignsRepository(db);
  const adsRepo = new AdsRepository(db);
  const templatesRepo = new TemplatesRepository(db);
  const competitorsRepo = new CompetitorsRepository(db);
  const platformAccountsRepo = new PlatformAccountsRepository(db);

  // Rules repository for autonomous campaign manager
  const rulesRepo = new RulesRepository(db);
  const webhookEventsRepo = new WebhookEventsRepository(db);
  const adUtmMapRepo = new AdUtmMapRepository(db);
  const utmTagger = new UtmTaggerService(adUtmMapRepo);
  const scheduleRepo = new ScheduleRepository(db);
  scheduleRepo.ensureTable();

  // Create services
  const llmClient = (params && params.llmClient) || new LLMClient({
    url: config.llm.url,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    timeout: config.llm.timeout,
  });

  const adspirerClient = new AdspirerMcpClient(platformAccountsRepo);
  const trendingService = new TrendingService(campaignsRepo);
  const paymentsRepo = new PaymentsRepository(db);
  const scalevService = (params && params.scalevService) || new ScalevService(settingsRepo);
  const paymentService = new PaymentService(paymentsRepo, usersRepo, scalevService);
  const learningService = new LearningService(campaignsRepo, adsRepo, landingRepo);
  
  const metaApi = new MetaAdsAPI(settingsRepo);
  const creativeStudio = new CreativeStudio(llmClient);
  const videoService = new MetaVideoService(metaApi);
  const contentScheduler = new ContentScheduler({ videoService, llmClient, db });
  const adResearchService = new AdResearchService({ metaApi, db });
  const orchestrator = new CampaignOrchestrator(metaApi, creativeStudio);
  const realtimeService = new RealtimeService(metaApi, campaignsRepo);

  const suggestionsRepo = new AiSuggestionsRepository(db);
  const aiAgent = new AiAgent(settingsRepo, adsRepo, campaignsRepo, llmClient, suggestionsRepo, landingRepo);

  // Attribution service for Shopee order matching
  const attributionRepo = new AttributionRepository(db);
  const shopeeAdapter = new ShopeeAdapter();
  const attributionService = new AttributionService(attributionRepo, shopeeAdapter, campaignsRepo, adsRepo);

  // Create app
  const app = express();

  // Set repositories in app locals for access in routes
  app.locals.usersRepo = usersRepo;
  app.locals.settingsRepo = settingsRepo;
  app.locals.campaignsRepo = campaignsRepo;
  app.locals.rulesRepo = rulesRepo;
  app.locals.platformAccountsRepo = platformAccountsRepo;
  app.locals.adResearchService = adResearchService;
  app.locals.db = db;
  
  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (config.nodeEnv === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Set up JSON body parser
  app.use(cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  app.use(express.json());
  
  // Serve frontend static files (SPA)
  const clientPath = path.join(process.cwd(), 'dist');
  app.use(express.static(clientPath));
  

  // Rate limiting
  const publicRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authRouter = createAuthRouter(usersRepo, refreshTokensRepo);
  const trendingRouter = createTrendingRouter(trendingService);
  const campaignsRouter = createCampaignsRouter(orchestrator, metaApi, creativeStudio, campaignsRepo);
  const adsRouter = createAdsRouter(adsRepo, creativeStudio);
  const landingRouter = createLandingRouter(landingRepo, llmClient);
  const settingsRouter = createSettingsRouter(settingsRepo, llmClient, db);
  const aiAgentRouter = createAiAgentRouter(aiAgent, settingsRepo);
  const competitorSpyRouter = createCompetitorSpyRouter(competitorsRepo);
  const paymentsRouter = createPaymentsRouter(paymentService);
  const templatesRouter = createTemplatesRouter(templatesRepo);
  const learningRouter = createLearningRouter(learningService);
  const adsLibraryRouter = createAdsLibraryRoutes();
  const adspirerRouter = createAdspirerRouter(adspirerClient, platformAccountsRepo, settingsRepo);

  const scheduleRouter = createScheduleRouter(db);
  const metaAccountsRouter = createMetaAccountsRouter(settingsRepo);
  const metaContentRouter = createMetaContentRouter(videoService, contentScheduler);

  // Mount routers
  app.use('/api/auth', publicRateLimit, authRouter);
  app.use('/api/trending', publicRateLimit, trendingRouter);
  app.use('/api/campaigns', requireAuth, campaignsRouter);
  app.use('/api/ads', requireAuth, adsRouter);
  app.use('/api/landing', requireAuth, landingRouter);
  app.use('/api/settings', requireAuth, settingsRouter);
  app.use('/api/competitor-spy', requireAuth, competitorSpyRouter);
  app.use('/api/payments', requireAuth, paymentsRouter);
  app.use('/api/templates', requireAuth, templatesRouter);
  app.use('/api/learning', requireAuth, learningRouter);
  app.use('/api/ads-library', publicRateLimit, adsLibraryRouter);
  app.use('/api/adspirer', requireAuth, adspirerRouter);
  app.use('/api/ai-agent', requireAuth, aiAgentRouter);

  app.use('/api/schedule', requireAuth, scheduleRouter);
  app.use('/api/meta', requireAuth, metaAccountsRouter);
  app.use('/api/meta/content', requireAuth, metaContentRouter);
  app.use('/api/google-ads', requireAuth, createGoogleAdsRouter(settingsRepo));
  app.use('/api/tiktok-ads', requireAuth, createTikTokAdsRouter(settingsRepo));


  // Autonomous campaign monitor
  const autonomousAgent = new AutonomousAgent(settingsRepo, platformAccountsRepo, campaignsRepo, rulesRepo, llmClient);
  autonomousAgent.runAutonomousMode();

  // Auto-optimizer: evaluates rules every 6 hours
  const autoOptimizer = new AutoOptimizer(metaApi, rulesRepo, campaignsRepo);
  autoOptimizer.start();

  // AI agent scheduler: generates suggestions every 5 minutes
  aiAgent.startScheduler(() => usersRepo.findAll().map(u => u.id));

  const autonomousRouter = createAutonomousRouter(settingsRepo, platformAccountsRepo, campaignsRepo, rulesRepo, autonomousAgent);
  app.use('/api/autonomous', requireAuth, autonomousRouter);

  // New consolidated services
  app.use('/api/audiences', requireAuth, createAudienceRouter(metaApi));
  app.use('/api/pixels', requireAuth, createPixelRouter(metaApi));
  app.use('/api/batch', requireAuth, createBatchRouter(metaApi));
  app.use('/api/tokens', requireAuth, createTokenRouter());
  app.use('/api/webhooks', createWebhookRouter(webhookEventsRepo));
  app.use('/api/ab-tests', requireAuth, createABTestsRouter(metaApi));

  app.use('/api/attribution', requireAuth, createAttributionRouter(attributionService, attributionRepo));
  app.use('/api/realtime', requireAuth, createRealtimeRouter(realtimeService));
  app.locals.realtimeService = realtimeService;

  const mcpClient = (params && params.mcpClient) || { getStatus: () => ({}), connect: () => ({}), disconnect: () => ({}), callTool: () => ({}), getTools: () => [] };
  app.use('/api/analytics', requireAuth, createAnalyticsRouter(campaignsRepo));
  app.use('/api/research', requireAuth, createResearchRouter(adResearchService));
  app.use('/api/mcp', requireAuth, createMcpRouter(mcpClient, settingsRepo, campaignsRepo, adsRepo, landingRepo));

  app.get('/api/cf-health', publicRateLimit, (_req, res) => {
    res.json({ status: 'ok', service: 'adforge', timestamp: new Date().toISOString() });
  });

  app.get('/health', publicRateLimit, (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Public tracking redirect (no auth — click tracking for ads)
  app.use('/t', createTrackRouter(adUtmMapRepo, utmTagger));

  // Frontend routes (SPA) - Catch-all for SPA routing
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') ||
        req.path.startsWith('/assets') ||
        req.path.startsWith('/t/') ||
        req.path.startsWith('/favicon.ico')) {
      return next();
    }
    const indexPath = path.join(clientPath, 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
      if (err) {
        console.error('Failed to read index.html:', err);
        return res.status(500).send('Internal Server Error');
      }
      res.set('Content-Type', 'text/html');
      res.send(data);
    });
  });

  // Global error handler with logging
  app.use((err, req, res, _next) => {
    const timestamp = new Date().toISOString();
    const status = err.status || err.statusCode || 500;
    const logEntry = {
      timestamp,
      method: req.method,
      path: req.path,
      status,
      error: err.message,
      ...(config.nodeEnv === 'development' && { stack: err.stack }),
    };
    console.error('[ERROR]', JSON.stringify(logEntry));

    if (status >= 500) {
      console.error('[ERROR_STACK]', err.stack);
    }

    res.status(status).json({
      success: false,
      error: config.nodeEnv === 'production' ? 'Internal Server Error' : err.message,
    });
  });

  return app;
}
