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
import { AdGenerator } from './services/ad-generator.js';
import { LandingGenerator } from './services/landing-generator.js';
import { MCPClientManager } from './services/mcp-client.js';
import { hashPassword, verifyPassword, generateToken } from './lib/auth.js';
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
import { TrendingService } from './services/trending.js';
import { createPaymentsRouter } from './routes/payments.js';
import { LearningService } from './services/learning.js';
import { createLearningRouter } from './routes/learning.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp({ db, llmClient, mcpClient } = {}) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json({ limit: '2mb' }));

  // Repositories
  const adsRepo = new AdsRepository(db);
  const landingRepo = new LandingRepository(db);
  const campaignsRepo = new CampaignsRepository(db);
  const usersRepo = new UsersRepository(db);
  const refreshTokensRepo = new RefreshTokensRepository(db);
  const settingsRepo = new SettingsRepository(db);

  const llmConfig = settingsRepo.get('llm_config');
  if (llmConfig) {
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
  app.use('/api/settings', requireAuth, createSettingsRouter(settingsRepo, llmClient));
  const scalevService = new ScalevService(settingsRepo);
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

  // Payment Gateway (backlog/stub)
  app.use('/api/payments', requireAuth, createPaymentsRouter());

  // Learning Service (sync insights to bk-hub KB)
  const learningService = new LearningService(campaignsRepo, adsRepo, landingRepo);
  app.use('/api/learning', requireAuth, createLearningRouter(learningService));

  // Landing Page Live Deployment (public - no auth, served to end users)
  app.get('/lp/:slug', (req, res) => {
    const page = db.prepare('SELECT * FROM landing_pages WHERE slug = ? AND is_published = 1').get(req.params.slug);
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
  app.post('/api/webhooks/scalev', express.json(), (req, res) => {
    console.log('Scalev webhook:', JSON.stringify(req.body).substring(0, 200));
    res.json({ success: true });
  });

  // Serve static files (Production or if dist exists)
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));

  // Global error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'Invalid JSON in request body' });
    }
    console.error('Unhandled error:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message || 'Internal server error' });
  });

  return app;
}
