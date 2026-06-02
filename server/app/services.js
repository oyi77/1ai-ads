import config from '../config/index.js';
import { LLMClient } from '../services/llm-client.js';
import { AdspirerMcpClient } from '../services/adspirer-mcp-client.js';
import { TrendingService } from '../services/trending.js';
import { ScalevService } from '../services/scalev.js';
import { PaymentService } from '../services/payments.js';
import { LearningService } from '../services/learning.js';
import { MetaAdsAPI } from '../services/meta-api.js';
import { CreativeStudio } from '../services/creative-studio.js';
import { MetaVideoService } from '../services/meta-video-service.js';
import { ContentScheduler } from '../services/content-scheduler.js';
import { AdResearchService } from '../services/ad-research.js';
import { CampaignOrchestrator } from '../services/campaign-orchestrator.js';
import { RealtimeService } from '../services/realtime-service.js';
import { ContentBridge } from '../services/content-bridge.js';
import { SocialBridge } from '../services/social-bridge.js';
import { AiAgent } from '../services/ai-agent.js';
import { ShopeeAdapter } from '../services/shopee-adapter.js';
import { AttributionService } from '../services/attribution-service.js';
import { GoogleAdsAPI } from '../services/google-ads-api.js';
import { TikTokAdsAPI } from '../services/tiktok-api.js';
import { AutonomousAgent } from '../services/autonomous-agent.js';
import { AutoOptimizer } from '../services/auto-optimizer.js';
import { WebhookProcessor } from '../services/webhook-processor.js';
import { DataCleanup } from '../services/data-cleanup.js';
import { UtmTaggerService } from '../services/utm-tagger.js';
import { AdIntelligenceService } from '../services/ad-intelligence.js';
import { CompetitorSpyService } from '../services/competitor-spy.js';

export function createServices({ db, repos, params }) {
  const llmClient = (params && params.llmClient) || new LLMClient({
    url: config.llm.url,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    timeout: config.llm.timeout,
  });

  const adspirerClient = new AdspirerMcpClient(repos.platformAccountsRepo);
  const trendingService = new TrendingService(repos.campaignsRepo);
  const scalevService = (params && params.scalevService) || new ScalevService(repos.settingsRepo);
  const paymentService = new PaymentService(repos.paymentsRepo, repos.usersRepo, scalevService);
  const learningService = new LearningService(repos.campaignsRepo, repos.adsRepo, repos.landingRepo);
  const utmTagger = new UtmTaggerService(repos.adUtmMapRepo);

  const metaApi = new MetaAdsAPI(repos.settingsRepo);
  const creativeStudio = new CreativeStudio(llmClient);
  const videoService = new MetaVideoService(metaApi);
  const contentScheduler = new ContentScheduler({ videoService, llmClient, queueRepo: repos.contentSchedulerQueueRepo });
  const adResearchService = new AdResearchService({ metaApi, db });
  const orchestrator = new CampaignOrchestrator(metaApi, creativeStudio);
  const realtimeService = new RealtimeService(metaApi, repos.campaignsRepo);

  const contentBridgeUrl = repos.settingsRepo.getKey?.('content_bridge_url') || process.env.CONTENT_BRIDGE_URL || 'http://localhost:3000';
  const contentBridgeApiKey = repos.settingsRepo.getKey?.('content_bridge_api_key') || process.env.CONTENT_BRIDGE_API_KEY || '';
  const contentBridge = new ContentBridge(contentBridgeUrl, contentBridgeApiKey);

  const socialBridgeUrl = repos.settingsRepo.getKey?.('social_bridge_url') || process.env.SOCIAL_BRIDGE_URL || 'http://localhost:8200';
  const socialBridgeApiKey = repos.settingsRepo.getKey?.('social_bridge_api_key') || process.env.SOCIAL_BRIDGE_API_KEY || '';
  const socialBridge = new SocialBridge(socialBridgeUrl, socialBridgeApiKey);

  const aiAgent = new AiAgent(repos.settingsRepo, repos.adsRepo, repos.campaignsRepo, llmClient, repos.suggestionsRepo, repos.landingRepo);

  const shopeeAdapter = new ShopeeAdapter();
  const attributionService = new AttributionService(repos.attributionRepo, shopeeAdapter, repos.campaignsRepo, repos.adsRepo);

  const googleAdsAPI = new GoogleAdsAPI(repos.settingsRepo);
  const tiktokAdsAPI = new TikTokAdsAPI(repos.settingsRepo);

  const autonomousAgent = new AutonomousAgent(
    repos.settingsRepo, repos.platformAccountsRepo, repos.campaignsRepo,
    repos.rulesRepo, llmClient, undefined,
    { metaAdsAPI: metaApi, googleAdsAPI, tiktokAdsAPI }
  );

  const autoOptimizer = new AutoOptimizer(metaApi, repos.rulesRepo, repos.campaignsRepo);
  const webhookProcessor = new WebhookProcessor(repos.webhookEventsRepo, repos.campaignsRepo);
  const dataCleanup = new DataCleanup(db);
  const adIntelligenceService = new AdIntelligenceService(db, repos.competitorsRepo);
  const competitorSpyService = new CompetitorSpyService(db, adIntelligenceService, null, repos.competitorsRepo);

  return {
    llmClient, adspirerClient, trendingService, scalevService, paymentService,
    learningService, utmTagger, metaApi, creativeStudio, videoService,
    contentScheduler, adResearchService, orchestrator, realtimeService,
    contentBridge, socialBridge, aiAgent, shopeeAdapter, attributionService,
    googleAdsAPI, tiktokAdsAPI, autonomousAgent, autoOptimizer,
    webhookProcessor, dataCleanup, adIntelligenceService, competitorSpyService,
    mcpClient: params && params.mcpClient,
  };
}
