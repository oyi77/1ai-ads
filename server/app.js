import { createAuthRouter } from '../routes/auth.js';
import { createTrendingRouter } from '../routes/trending.js';
import { createCompetitorSpyRouter } from '../routes/competitor-spy.js';
import { createPaymentsRouter } from '../routes/payments.js';
import { createTemplatesRouter } from '../routes/templates.js';
import { createLearningRouter } from '../routes/learning.js';
import { createAdsLibraryRouter } from '../routes/ads-library.js';
import { createAdpirerRouter } from '../routes/adspirer.js';
import { createAiAgentRouter } from '../routes/ai-agent.js';
import { createScheduleRouter } from '../routes/schedule.js';
import { createMetaAccountsRouter } from '../routes/meta-accounts.js';
import rateLimit from 'express-rate-limit';
import { validateConfig } from '../config/index.js';
import config from '../config/index.js';

// Import repositories
import { createUsersRepository } from '../repositories/users.js';
import { createRefreshTokensRepository } from '../repositories/refresh-tokens.js';
import { createSettingsRepository } from '../repositories/settings.js';
import { createLandingPagesRepository } from '../repositories/landing.js';
import { createCampaignsRepository } from '../repositories/campaigns.js';
import { createAdsRepository } from '../repositories/ads.js';
import { createTemplatesRepository } from '../repositories/templates.js';
import { createCompetitorsRepository } from '../repositories/competitors.js';
import { createPlatformAccountsRepository } from '../repositories/platform-accounts.js';
import { createAiSuggestionsRepository } from '../repositories/ai-suggestions.js';
import { createWebhookEventsRepository } from '../repositories/webhook-events.js';

// Import services
import { LLMClient } from '../services/llm-client.js';
import { createAdspirerClient } from '../services/adspirer-client.js';
import { TrendingService } from '../services/trending.js';
import { CompetitorSpyService } from '../services/competitor-spy.js';
import { LearningService } from '../services/learning.js';
import { createPaymentService } from '../services/payments.js';
import { createCampaignsService } from '../services/campaigns.js';
import { createAdsService } from '../services/ads.js';

// Import middleware
import { requireAuth } from '../middleware/require-auth.js';

// Import database
import { createDatabase } from '../db/index.js';

export function createApp() {
  const db = createDatabase(config.dbPath);
  
  // Create repositories
  const usersRepo = createUsersRepository(db);
  const refreshTokensRepo = createRefreshTokensRepository(db);
  const settingsRepo = createSettingsRepository(db);
  const landingRepo = createLandingPagesRepository(db);
  const campaignsRepo = createCampaignsRepository(db);
  const adsRepo = createAdsRepository(db);
  const templatesRepo = createTemplatesRepository(db);
  const competitorsRepo = createCompetitorsRepository(db);
  const platformAccountsRepo = createPlatformAccountsRepository(db);
  const aiSuggestionsRepo = createAiSuggestionsRepository(db);
  const webhookEventsRepo = createWebhookEventsRepository(db);

  // Create services
  const llmClient = new LLMClient({
    url: config.llm.url,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    timeout: config.llm.timeout,
  });
  
  const adspirerClient = createAdspirerClient(config);
  const trendingService = new TrendingService(campaignsRepo);
  const paymentService = createPaymentService(db);
  const learningService = new LearningService(campaignsRepo, adsRepo, landingRepo);

  // Create app
  const app = require('express')();
  
  // Set up JSON body parser
  app.use(require('cors')({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  app.use(require('express.json')());
  
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
  const adsLibraryRouter = createAdsLibraryRouter();
  const adspirerRouter = createAdspirerRouter(adspirerClient, platformAccountsRepo, settingsRepo);
  const aiAgentRouter = createAiAgentRouter(aiAgent, settingsRepo, adsRepo, campaignsRepo, llmClient, adsRepo, landingRepo);
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
  app.use('/api/ai-agent', requireAuth, aiAgentRouter);
  app.use('/api/schedule', requireAuth, scheduleRouter);
  app.use('/api/meta', requireAuth, metaAccountsRouter);

  // Frontend routes (SPA)
  app.get('/login', publicRateLimit, (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });

  app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });

  // Catch-all for SPA routing
  app.get('*', publicRateLimit, (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });

  // Health check
  app.get('/health', publicRateLimit, (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
