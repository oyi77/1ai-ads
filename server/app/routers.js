import config from '../config/index.js';
import rateLimit from 'express-rate-limit';
import { createAuthRouter } from '../routes/auth.js';
import { createTrendingRouter } from '../routes/trending.js';
import { createCompetitorSpyRouter } from '../routes/competitor-spy.js';
import { createPaymentsRouter } from '../routes/payments.js';
import { createTemplatesRouter } from '../routes/templates.js';
import { createLearningRouter } from '../routes/learning.js';
import { createAdsLibraryRouter } from '../routes/ads-library.js';
import { createAdspirerRouter } from '../routes/adspirer.js';
import { createScheduleRouter } from '../routes/schedule.js';
import { createMetaAccountsRouter } from '../routes/meta-accounts.js';
import { createMetaContentRouter } from '../routes/meta-content.js';
import { createGoogleAdsRouter } from '../routes/google-ads.js';
import { createTikTokAdsRouter } from '../routes/tiktok-ads.js';
import { createLinkedInAdsRouter } from '../routes/linkedin-ads.js';
import { createPinterestAdsRouter } from '../routes/pinterest-ads.js';
import { createSnapchatAdsRouter } from '../routes/snapchat-ads.js';
import { createTwitterAdsRouter } from '../routes/twitter-ads.js';
import { createMicrosoftAdsRouter } from '../routes/microsoft-ads.js';
import { createOptimizerRouter } from '../routes/optimizer.js';
import { createAutonomousRouter } from '../routes/autonomous.js';
import { createAiAgentRouter } from '../routes/ai-agent.js';
import { createAudienceRouter } from '../routes/audiences.js';
import { createPixelRouter } from '../routes/pixels.js';
import { createBatchRouter } from '../routes/batch.js';
import { createMetaAiRouter } from '../routes/meta-ai.js';
import { createAdsLibraryAiRouter } from '../routes/ads-library-ai.js';
import { createTokenRouter } from '../routes/tokens.js';
import { createWebhookRouter } from '../routes/webhooks.js';
import { createABTestsRouter } from '../routes/ab-tests.js';
import { createTrackRouter } from '../routes/track.js';
import { createRealtimeRouter } from '../routes/realtime.js';
import { createCampaignsRouter } from '../routes/campaigns.js';
import { createAdsRouter } from '../routes/ads.js';
import { createLandingRouter } from '../routes/landing.js';
import { createSettingsRouter } from '../routes/settings.js';
import { createAnalyticsRouter } from '../routes/analytics.js';
import { createResearchRouter } from '../routes/research.js';
import { createMcpRouter } from '../routes/mcp.js';
import { createSelowRouter } from '../routes/selow.js';
import { createAttributionRouter } from '../routes/attribution.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { createAdminRouter } from '../routes/admin.js';
import { createDraftRouter } from '../routes/drafts.js';
import { createShopeeDashboardRouter } from '../routes/shopee-dashboard.js';
import { createFacebookSystemUserRouter } from '../routes/facebook-system-user.js';
import { createCampaignMonitorRouter } from '../routes/campaign-monitor.js';

export function createRouters({ app, repos, services }) {
 const publicRateLimit = rateLimit({
 windowMs: config.rateLimitWindowMs,
 max: config.rateLimitMax,
 message: { success: false, error: 'Too many requests, please try again later.' },
 standardHeaders: true,
 legacyHeaders: false,
 validate: { xForwardedForHeader: false },
 });

 const mcpClient = services.mcpClient;

 app.use('/api/auth', publicRateLimit, createAuthRouter(repos.usersRepo, repos.refreshTokensRepo, repos.settingsRepo));
 app.use('/api/trending', publicRateLimit, createTrendingRouter(services.trendingService));
 app.use('/api/campaigns', requireAuth, createCampaignsRouter(services.orchestrator, services.metaApi, services.creativeStudio, repos.campaignsRepo));
 app.use('/api/ads', requireAuth, createAdsRouter(repos.adsRepo, services.creativeStudio));
 app.use('/api/landing', requireAuth, createLandingRouter(repos.landingRepo, services.llmClient));
 app.use('/api/settings', requireAuth, createSettingsRouter(repos.settingsRepo, services.llmClient, repos.db, services.metaApi));
 app.use('/api/competitor-spy', requireAuth, createCompetitorSpyRouter(repos.competitorsRepo, services.adIntelligenceService, services.competitorSpyService));
 app.use('/api/payments', requireAuth, createPaymentsRouter(services.paymentService));
 app.use('/api/templates', requireAuth, createTemplatesRouter(repos.templatesRepo));
 app.use('/api/learning', requireAuth, createLearningRouter(services.learningService));
 app.use('/api/ads-library', publicRateLimit, createAdsLibraryRouter());
 app.use('/api/adspirer', requireAuth, createAdspirerRouter(services.adspirerClient, repos.platformAccountsRepo, repos.settingsRepo));
 app.use('/api/ai-agent', requireAuth, createAiAgentRouter(services.aiAgent, repos.settingsRepo));
 app.use('/api/schedule', requireAuth, createScheduleRouter(repos.db));
 app.use('/api/meta', requireAuth, createMetaAccountsRouter(repos.settingsRepo));
 app.use('/api/meta/content', requireAuth, createMetaContentRouter(services.videoService, services.contentScheduler));
 app.use('/api/google-ads', requireAuth, createGoogleAdsRouter(repos.settingsRepo));
 app.use('/api/tiktok-ads', requireAuth, createTikTokAdsRouter(repos.settingsRepo));
 app.use('/api/linkedin-ads', requireAuth, createLinkedInAdsRouter(repos.settingsRepo));
 app.use('/api/pinterest-ads', requireAuth, createPinterestAdsRouter(repos.settingsRepo));
 app.use('/api/snapchat-ads', requireAuth, createSnapchatAdsRouter(repos.settingsRepo));
 app.use('/api/twitter-ads', requireAuth, createTwitterAdsRouter(repos.settingsRepo));
 app.use('/api/microsoft-ads', requireAuth, createMicrosoftAdsRouter(repos.settingsRepo));
 app.use('/api/selow', requireAuth, createSelowRouter(repos.settingsRepo));
 app.use('/api/optimizer', requireAuth, createOptimizerRouter(repos.rulesRepo, services.autoOptimizer));
 app.use('/api/autonomous', requireAuth, createAutonomousRouter(repos.settingsRepo, repos.platformAccountsRepo, repos.campaignsRepo, repos.rulesRepo, services.autonomousAgent));
 app.use('/api/audiences', requireAuth, createAudienceRouter(services.metaApi));
 app.use('/api/pixels', requireAuth, createPixelRouter(services.metaApi));
 app.use('/api/batch', requireAuth, createBatchRouter(services.metaApi));
 app.use('/api/tokens', requireAuth, createTokenRouter());
 app.use('/api/webhooks', createWebhookRouter(repos.webhookEventsRepo));
 app.use('/api/ab-tests', requireAuth, createABTestsRouter(services.metaApi));
 app.use('/api/attribution', requireAuth, createAttributionRouter(services.attributionService, repos.attributionRepo));
 app.use('/api/realtime', requireAuth, createRealtimeRouter(services.realtimeService));
 app.use('/api/analytics', requireAuth, createAnalyticsRouter(repos.campaignsRepo));
 app.use('/api/research', requireAuth, createResearchRouter(services.adResearchService));
 app.use('/api/mcp', requireAuth, createMcpRouter(mcpClient, repos.settingsRepo, repos.campaignsRepo, repos.adsRepo, repos.landingRepo));
 app.use('/api/meta-ai', requireAuth, createMetaAiRouter(repos.settingsRepo));
 app.use('/api/ads-library-ai', publicRateLimit, createAdsLibraryAiRouter(repos.settingsRepo));
  app.use('/api/admin', requireAuth, requireAdmin, createAdminRouter(repos.usersRepo, repos.settingsRepo));
  app.use('/api/drafts', requireAuth, createDraftRouter(services.draftService));
 app.use('/api/shopee', requireAuth, createShopeeDashboardRouter(services.shopeeAdapter, repos.settingsRepo, repos.shopeeCommissionsRepo));
 app.use('/api/meta-system', createFacebookSystemUserRouter(services.facebookSystemUserService));
 app.use('/api/campaign-monitor', requireAuth, createCampaignMonitorRouter(services.campaignMonitorService));
 app.use('/t', createTrackRouter(repos.adUtmMapRepo, services.utmTagger));
}
