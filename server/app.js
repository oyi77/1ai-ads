import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AdsRepository } from './repositories/ads.js';
import { LandingRepository } from './repositories/landing.js';
import { CampaignsRepository } from './repositories/campaigns.js';
import { UsersRepository } from './repositories/users.js';
import { RefreshTokensRepository } from './repositories/refresh-tokens.js';
import { SettingsRepository } from './repositories/settings.js';
import { WebhookEventsRepository } from './repositories/webhook-events.js';
import { CompetitorsRepository } from './repositories/competitors.js';
import { TemplatesRepository } from './repositories/templates.js';
import { AdGenerator } from './services/ad-generator.js';
import { LandingGenerator } from './services/landing-generator.js';
import { MCPClientManager } from './services/mcp-client.js';
import { requireAuth } from './middleware/auth.js';
import { createAdsRouter } from './routes/ads.js';
import { createLandingRouter } from './routes/landing.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { createMcpRouter } from './routes/mcp.js';
import { createSettingsRouter } from './routes/settings.js';
import { createResearchRouter } from './routes/research.js';
import { AdResearchService } from './services/ad-research.js';
import { ScalevService } from './services/scalev.js';
import { createScalevRouter } from './routes/scalev.js';
import { MetaAdsAPI } from './services/meta-api.js';
import { createMetaRouter } from './routes/meta.js';
import { TikTokAdsAPI } from './services/tiktok-api.js';
import { GoogleAdsAPI } from './services/google-ads-api.js';
import { createPlatformsRouter } from './routes/platforms.js';
import { createCampaignsRouter } from './routes/campaigns.js';
import { CampaignOrchestrator } from './services/campaign-orchestrator.js';
import { CreativeStudio } from './services/creative-studio.js';
import { AutomationRulesRepository } from './repositories/automation-rules.js';
import { AutoOptimizer } from './services/auto-optimizer.js';
import { createOptimizerRouter } from './routes/optimizer.js';
import { renderLandingPage } from './services/templates.js';
import { createAuthRouter } from './routes/auth.js';
import { createTrendingRouter } from './routes/trending.js';
import { createAdsLibraryRoutes } from './routes/ads-library.js';
import { createCompetitorSpyRouter } from './routes/competitor-spy.js';
import { TrendingService } from './services/trending.js';
import { createPaymentsRouter } from './routes/payments.js';
import { PaymentsRepository } from './repositories/payments.js';
import { PaymentService } from './services/payments.js';
import { LearningService } from './services/learning.js';
import { createLearningRouter } from './routes/learning.js';
import { createTemplatesRouter } from './routes/templates.js';
import { AdspirerMcpClient } from './services/adspirer-mcp-client.js';
import { createAdspirerRouter } from './routes/adspirer.js';
import { PlatformAccountsRepository } from './repositories/platform-accounts.js';
import { AiAgent } from './services/ai-agent.js';
import { AiSuggestionsRepository } from './repositories/ai-suggestions.js';
import { createAiAgentRouter } from './routes/ai-agent.js';
import rateLimit from 'express-rate-limit';
import config from './config/index.js';
import { createLogger } from './lib/logger.js';

const log = createLogger('app');
const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp({ db, llmClient, mcpClient } = {}) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));

  // Rate limiting for public endpoints
  const publicRateLimit = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Repositories
  const adsRepo = new AdsRepository(db);
  const landingRepo = new LandingRepository(db);
  const campaignsRepo = new CampaignsRepository(db);
  const usersRepo = new UsersRepository(db);
  const refreshTokensRepo = new RefreshTokensRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const webhookEventsRepo = new WebhookEventsRepository(db);
  const competitorsRepo = new CompetitorsRepository(db);
  const paymentsRepo = new PaymentsRepository(db);
  const templatesRepo = new TemplatesRepository(db);
  const platformAccountsRepo = new PlatformAccountsRepository(db);
  const adspirerClient = new AdspirerMcpClient(platformAccountsRepo);

  const llmConfig = settingsRepo.get('llm_config');
  if (llmConfig && llmClient) {
    llmClient.updateConfig(llmConfig);
  }

  // Services
  const adGenerator = new AdGenerator(llmClient);
  const landingGenerator = new LandingGenerator(llmClient);
  const mcp = mcpClient || new MCPClientManager();

// --- Auth routes (public) ---
app.use('/api/auth', createAuthRouter(usersRepo, refreshTokensRepo));

  // --- Protected routes ---
  app.use('/api/ads', requireAuth, createAdsRouter(adsRepo, adGenerator));
  app.use('/api/landing', requireAuth, createLandingRouter(landingRepo, landingGenerator));
  app.use('/api/analytics', requireAuth, createAnalyticsRouter(campaignsRepo));
  app.use('/api/mcp', requireAuth, createMcpRouter(mcp, settingsRepo, campaignsRepo, adsRepo, landingRepo));
  app.use('/api/settings', requireAuth, createSettingsRouter(settingsRepo, llmClient, db));
  const scalevService = new ScalevService(settingsRepo);
  const paymentService = new PaymentService(paymentsRepo, usersRepo, scalevService);
  app.use('/api/research', requireAuth, createResearchRouter(new AdResearchService(settingsRepo)));
  app.use('/api/scalev', requireAuth, createScalevRouter(scalevService));
  const metaApi = new MetaAdsAPI(settingsRepo);
  const tiktokApi = new TikTokAdsAPI(settingsRepo);
  const googleApi = new GoogleAdsAPI(settingsRepo);
  app.use('/api/meta', requireAuth, createMetaRouter(metaApi, campaignsRepo));
  app.use('/api/platforms', requireAuth, createPlatformsRouter({ meta: metaApi, tiktok: tiktokApi, google: googleApi }, campaignsRepo));

  // AI Creative Studio + Campaign Orchestrator
  const creativeStudio = new CreativeStudio(llmClient);
  const orchestrator = new CampaignOrchestrator(metaApi, creativeStudio);
  app.use('/api/campaigns', requireAuth, createCampaignsRouter(orchestrator, metaApi, creativeStudio, campaignsRepo));

  // Auto-Optimizer
  const rulesRepo = new AutomationRulesRepository(db);
  const optimizer = new AutoOptimizer(metaApi, rulesRepo, campaignsRepo);
  app.use('/api/optimizer', requireAuth, createOptimizerRouter(rulesRepo, optimizer));

  // Trending Dashboard
  const trendingService = new TrendingService(campaignsRepo);
  app.use('/api/trending', requireAuth, createTrendingRouter(trendingService));

  app.use('/api/competitor-spy', requireAuth, createCompetitorSpyRouter(competitorsRepo));

  // Payment webhook endpoint (public - must be before requireAuth router)
  app.post('/api/payments/webhook', publicRateLimit, async (req, res) => {
    try {
      const result = await paymentService.processWebhookEvent(req.body);
      res.json(result);
    } catch (err) {
      log.error('Webhook processing failed', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Payment Gateway (protected)
  const paymentsRouter = createPaymentsRouter(paymentService);
  app.use('/api/payments', requireAuth, paymentsRouter);

  // Learning Service (sync insights to bk-hub KB)
  const learningService = new LearningService(campaignsRepo, adsRepo, landingRepo);
  app.use('/api/learning', requireAuth, createLearningRouter(learningService));

  // Templates Management
  app.use('/api/templates', requireAuth, createTemplatesRouter(templatesRepo));

  // Adspirer MCP Integration
  app.use('/api/adspirer', requireAuth, createAdspirerRouter(adspirerClient, platformAccountsRepo, settingsRepo));

  // AI Agent
  const aiSuggestionsRepo = new AiSuggestionsRepository(db);
  const aiAgent = new AiAgent(settingsRepo, adsRepo, campaignsRepo, llmClient, aiSuggestionsRepo, landingRepo);
  app.use('/api/ai-agent', requireAuth, createAiAgentRouter(aiAgent, settingsRepo));
  aiAgent.startScheduler(() => usersRepo.findAll ? usersRepo.findAll().map(u => u.id) : []);
  app.locals.aiAgent = aiAgent;

  // Unified Ads Library (public - no auth required for research)
  app.use('/api/ads-library', publicRateLimit, createAdsLibraryRoutes());

  // Landing Page Live Deployment (public - no auth, served to end users)
  app.get('/lp/:slug', (req, res) => {
    const page = landingRepo.findBySlug(req.params.slug);
    if (!page) return res.status(404).send('Page not found');
    const html = page.html_output || renderLandingPage({
      theme: page.theme, product_name: page.product_name, price: page.price,
      benefits: page.benefits, pain_points: page.pain_points,
      cta_primary: page.cta_primary, cta_secondary: page.cta_secondary,
      wa_link: page.wa_link, checkout_link: page.checkout_link,
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // Scalev webhook (public - no auth, called by Scalev servers)
  app.post('/api/webhooks/scalev', publicRateLimit, express.json(), async (req, res) => {
    log.info('Scalev webhook received', { body: req.body });
    webhookEventsRepo.create({ source: 'scalev', eventType: req.body.type || 'unknown', payload: req.body });
    try {
      await paymentService.processWebhookEvent({ source: 'scalev', eventType: req.body.type, payload: req.body });
    } catch (err) {
      log.error('Scalev webhook processing failed', { error: err.message });
    }
    res.json({ success: true });
  });

  // Serve static files (Production or if dist exists)
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));

  // Global error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'Invalid JSON in request body' });
    }
    const status = err.status || (err.name === 'ValidationError' ? 400 : err.name === 'AuthError' ? 401 : err.name === 'NotFoundError' ? 404 : 500);
    log.error('Unhandled error', { message: err.message, name: err.name, stack: err.stack });
    res.status(status).json({ success: false, error: err.message || 'Internal server error' });
  });

  return app;
}
