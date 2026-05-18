import { createAuthRouter } from './routes/auth.js';
import { createTrendingRouter } from './routes/trending.js';
import { createCompetitorSpyRouter } from './routes/competitor-spy.js';
import { createPaymentsRouter } from './routes/payments.js';
import { createTemplatesRouter } from './routes/templates.js';
import { createLearningRouter } from './routes/learning.js';
import { createAdsLibraryRoutes } from './routes/ads-library.js';
import { createAdspirerRouter } from './routes/adspirer.js';

import { createScheduleRouter } from './routes/schedule.js';
import { createMetaAccountsRouter } from './routes/meta-accounts.js';
import { createAutonomousRouter } from './routes/autonomous.js';
import { createAiAgentRouter } from './routes/ai-agent.js';
import { AiAgent } from './services/ai-agent.js';
import rateLimit from 'express-rate-limit';
import express from 'express';
import cors from 'cors';
import { validateConfig } from './config/index.js';
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
import { CompetitorSpyService } from './services/competitor-spy.js';
import { LearningService } from './services/learning.js';
import { PaymentService } from './services/payments.js';
import { BigQueryExportService } from './services/bigquery-export.js';
import { AutonomousAgent } from './services/autonomous-agent.js';
import { CampaignOrchestrator } from './services/campaign-orchestrator.js';
import { CreativeStudio } from './services/creative-studio.js';
import { MetaAdsAPI } from './services/meta-api.js';

import { createCampaignsRouter } from './routes/campaigns.js';
import { createAdsRouter } from './routes/ads.js';
import { createLandingRouter } from './routes/landing.js';
import { createSettingsRouter } from './routes/settings.js';



// Import middleware
import { requireAuth } from './middleware/auth.js';

// Import database
import { createDatabase } from '../db/index.js';

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

  // Create services
  const llmClient = new LLMClient({
    url: config.llm.url,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    timeout: config.llm.timeout,
  });
  
  const adspirerClient = new AdspirerMcpClient(platformAccountsRepo);
  const trendingService = new TrendingService(campaignsRepo);
  const paymentService = new PaymentService(db);
  const learningService = new LearningService(campaignsRepo, adsRepo, landingRepo);
  
  const metaApi = new MetaAdsAPI(settingsRepo);
  const creativeStudio = new CreativeStudio(llmClient);
  const orchestrator = new CampaignOrchestrator(metaApi, creativeStudio);
  
  const suggestionsRepo = new AiSuggestionsRepository(db);
  const aiAgent = new AiAgent(settingsRepo, adsRepo, campaignsRepo, llmClient, suggestionsRepo, landingRepo);

  // Create BigQuery export service (for Looker Studio)
  const bigQueryExport = new BigQueryExportService();

  // Create app
  const app = express();

  // Set repositories in app locals for access in routes
  app.locals.usersRepo = usersRepo;
  app.locals.settingsRepo = settingsRepo;
  app.locals.campaignsRepo = campaignsRepo;
  app.locals.rulesRepo = rulesRepo;
  app.locals.platformAccountsRepo = platformAccountsRepo;
  app.locals.db = db;
  
  // Set up JSON body parser
  app.use(cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  app.use(express.json());
  
  // Serve frontend static files (SPA)
  const clientPath = '/home/openclaw/projects/adforge/dist';
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

  const scheduleRouter = createScheduleRouter();
  const metaAccountsRouter = createMetaAccountsRouter(settingsRepo);

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


  // Autonomous campaign monitor
  const autonomousAgent = new AutonomousAgent(settingsRepo, platformAccountsRepo, campaignsRepo, rulesRepo, llmClient);
  autonomousAgent.runAutonomousMode();

  const autonomousRouter = createAutonomousRouter(settingsRepo, platformAccountsRepo, campaignsRepo, rulesRepo, autonomousAgent);
  app.use('/api/autonomous', requireAuth, autonomousRouter);
  // Frontend routes (SPA)
  app.get('/', publicRateLimit, (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
  app.get('/login', publicRateLimit, (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });

  app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });

  app.get('/health', publicRateLimit, (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
