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
import { LLMClient } from './services/llm-client.js';
import { AdspirerMcpClient } from './services/adspirer-mcp-client.js';
import { TrendingService } from './services/trending.js';
import { CompetitorSpyService } from './services/competitor-spy.js';
import { LearningService } from './services/learning.js';
import { PaymentService } from './services/payments.js';
import { BigQueryExportService } from './services/bigquery-export.js';



// Import middleware
import { requireAuth } from './middleware/auth.js';

// Import database
import { createDatabase } from '../db/index.js';

export function createApp() {
  const db = createDatabase(config.dbPath);
  
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
  const aiSuggestionsRepo = new AiSuggestionsRepository(db);
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
  
  // Create BigQuery export service (for Looker Studio)
  const bigQueryExport = new BigQueryExportService();

  // Create app
  const app = express();
  
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

  // API routers
  const authRouter = createAuthRouter(usersRepo, refreshTokensRepo);
  const trendingRouter = createTrendingRouter(trendingService);
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
  app.use('/api/competitor-spy', requireAuth, competitorSpyRouter);
  app.use('/api/payments', requireAuth, paymentsRouter);
  app.use('/api/templates', requireAuth, templatesRouter);
  app.use('/api/learning', requireAuth, learningRouter);
  app.use('/api/ads-library', publicRateLimit, adsLibraryRouter);
  app.use('/api/adspirer', requireAuth, adspirerRouter);

  app.use('/api/schedule', requireAuth, scheduleRouter);
  app.use('/api/meta', requireAuth, metaAccountsRouter);


  // Autonomous campaign monitor
  const autonomousRouter = createAutonomousRouter(settingsRepo, platformAccountsRepo, campaignsRepo);
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
