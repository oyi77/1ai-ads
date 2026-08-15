import config from '../config/index.js';
import { LLMClient } from '../services/llm-client.js';
import { AdspirerMcpClient } from '../services/adspirer-mcp-client.js';
import { TrendingService } from '../services/trending.js';
import { PaymentService } from '../services/payments.js';
import { LearningService } from '../services/learning.js';
import { MetaAdsAPI } from '../services/meta/index.js';
import { GoogleAdsAPI } from '../services/google/index.js';
import { TikTokAdsAPI } from '../services/tiktok/index.js';
import { LinkedInAdsAPI } from '../services/linkedin/index.js';
import { TwitterAdsAPI } from '../services/twitter/index.js';
import { SnapchatAdsAPI } from '../services/snapchat/index.js';
import { MicrosoftAdsAPI } from '../services/microsoft/index.js';
import { PinterestAdsAPI } from '../services/pinterest/index.js';
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
import { AutonomousAgent } from '../services/autonomous-agent.js';
import { AutoOptimizer } from '../services/auto-optimizer.js';
import { WebhookProcessor } from '../services/webhook-processor.js';
import { DataCleanup } from '../services/data-cleanup.js';
import { UtmTaggerService } from '../services/utm-tagger.js';
import { AdIntelligenceService } from '../services/ad-intelligence.js';
import { CompetitorSpyService } from '../services/competitor-spy.js';
import { DraftService } from '../services/draft-service.js';
import { FacebookSystemUserService } from '../services/facebook-system-user.js';
import { CampaignMonitorService } from '../services/campaign-monitor.js';
import { ABTestService } from '../services/ab-test-service.js';
import { FatigueDetector } from '../services/fatigue-detector.js';
import { UnifiedReporter } from '../services/unified-reporter.js';
import { BulkOperations } from '../services/bulk-operations.js';
import { ImageGenerator } from '../services/image-generator.js';
import { AudienceIntelligence } from '../services/audience-intelligence.js';
import { CreativeScorer } from '../services/creative-scorer.js';
import { WhiteLabelService } from '../services/white-label.js';
import { CapiMonitor } from '../services/capi-monitor.js';
import { WhatsAppIntelligenceService } from '../services/whatsapp-intelligence.js';
import { WhatsAppAdsAPI } from '../services/whatsapp/index.js';
import { BoostApprovalService } from '../services/boost-approval.js';
import { TargetingService } from '../services/targeting.js';

export function createServices({ db, repos, params }) {
  const llmClient = (params && params.llmClient) || new LLMClient({
    url: config.llm.url,
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    timeout: config.llm.timeout,
  });

  const adspirerClient = new AdspirerMcpClient(repos.platformAccountsRepo);
  const trendingService = new TrendingService(repos.campaignsRepo);
  const paymentService = new PaymentService(repos.paymentsRepo, repos.usersRepo);
  const learningService = new LearningService(repos.campaignsRepo, repos.adsRepo, repos.landingRepo);
  const utmTagger = new UtmTaggerService(repos.adUtmMapRepo);

  const metaApi = new MetaAdsAPI(repos.settingsRepo);
  const whatsappApi = new WhatsAppAdsAPI(repos.settingsRepo);
  const creativeStudio = new CreativeStudio(llmClient);
  const videoService = new MetaVideoService(metaApi);
  const contentScheduler = new ContentScheduler({ videoService, llmClient, queueRepo: repos.contentSchedulerQueueRepo });
  const adResearchService = new AdResearchService({ metaApi, db });
  const orchestrator = new CampaignOrchestrator(metaApi, creativeStudio);
  const realtimeService = new RealtimeService(metaApi, repos.campaignsRepo);

  const contentBridgeUrl = repos.settingsRepo.getKey?.('content_bridge_url') || config.contentBridgeUrl;
  const contentBridgeApiKey = repos.settingsRepo.getKey?.('content_bridge_api_key') || config.contentBridgeApiKey;
  const contentBridge = new ContentBridge(contentBridgeUrl, contentBridgeApiKey);

  const socialBridgeUrl = repos.settingsRepo.getKey?.('social_bridge_url') || config.socialBridgeUrl;
  const socialBridgeApiKey = repos.settingsRepo.getKey?.('social_bridge_api_key') || config.socialBridgeApiKey;
  const socialBridge = new SocialBridge(socialBridgeUrl, socialBridgeApiKey);
  const draftService = new DraftService(repos.draftsRepo, null);

  const aiAgent = new AiAgent(repos.settingsRepo, repos.adsRepo, repos.campaignsRepo, llmClient, repos.suggestionsRepo, repos.landingRepo, draftService);

  const shopeeAdapter = new ShopeeAdapter();
  const attributionService = new AttributionService(repos.attributionRepo, shopeeAdapter, repos.campaignsRepo, repos.adsRepo);
  const tiktokAdsAPI = new TikTokAdsAPI(repos.settingsRepo);
  const linkedinAdsAPI = new LinkedInAdsAPI(repos.settingsRepo);
  const twitterAdsAPI = new TwitterAdsAPI(repos.settingsRepo);
  const microsoftAdsAPI = new MicrosoftAdsAPI(repos.settingsRepo);
  const snapchatAdsAPI = new SnapchatAdsAPI(repos.settingsRepo);
  const pinterestAdsAPI = new PinterestAdsAPI(repos.settingsRepo);

  const googleAdsAPI = new GoogleAdsAPI(repos.settingsRepo);

  const autonomousAgent = new AutonomousAgent(
    repos.settingsRepo, repos.platformAccountsRepo, repos.campaignsRepo,
    repos.rulesRepo, llmClient, undefined,
    { metaAdsAPI: metaApi, googleAdsAPI, tiktokAdsAPI, linkedinAdsAPI, twitterAdsAPI, snapchatAdsAPI, microsoftAdsAPI, pinterestAdsAPI }
  );

  const autoOptimizer = new AutoOptimizer(metaApi, repos.rulesRepo, repos.campaignsRepo, draftService);
  const webhookProcessor = new WebhookProcessor(repos.webhookEventsRepo, repos.campaignsRepo);
  const dataCleanup = new DataCleanup(db);
  const adIntelligenceService = new AdIntelligenceService(db, repos.competitorsRepo);
  const competitorSpyService = new CompetitorSpyService(db, adIntelligenceService, null, repos.competitorsRepo);
  const facebookSystemUserService = new FacebookSystemUserService({
    systemToken: config.fbSystemToken,
    apiVersion: config.metaApiVersion,
  });

  const campaignMonitorService = new CampaignMonitorService(metaApi, repos.campaignsRepo, repos.settingsRepo);

  // Phase 1-4 new services
  const abTestService = new ABTestService(metaApi, db);
  const fatigueDetector = new FatigueDetector(metaApi, db, { creativeStudio, abTestService });
  const platformApis = { meta: metaApi, google: googleAdsAPI, tiktok: tiktokAdsAPI, linkedin: linkedinAdsAPI, twitter: twitterAdsAPI, microsoft: microsoftAdsAPI, snapchat: snapchatAdsAPI, pinterest: pinterestAdsAPI };
  const unifiedReporter = new UnifiedReporter(platformApis, repos.campaignsRepo, db);
  const bulkOperations = new BulkOperations(metaApi, repos.campaignsRepo, repos.adsRepo);
  const imageGenerator = new ImageGenerator(llmClient);
  const audienceIntelligence = new AudienceIntelligence(metaApi, db);
  const creativeScorer = new CreativeScorer(db, llmClient, repos.settingsRepo);
  const whiteLabelService = new WhiteLabelService(db, llmClient);
  const capiMonitor = new CapiMonitor(metaApi, db);
  const waIntelligence = new WhatsAppIntelligenceService({
    waConversationsRepo: repos.waConversationsRepo,
    metaApi,
    whatsappApi,
    llmClient,
    db,
    settingsRepo: repos.settingsRepo,
    config,
  });
  const boostApproval = new BoostApprovalService(repos.boostRecommendationsRepo, repos.settingsRepo);
  const mcpClient = params?.mcpClient;
  const targeting = new TargetingService(repos.targetingSuggestionsRepo, repos.boostRecommendationsRepo);

  return {
    llmClient, mcpClient, adspirerClient, trendingService, paymentService,
    learningService, utmTagger, metaApi, creativeStudio, videoService,
    contentScheduler, adResearchService, orchestrator, realtimeService,
    contentBridge, socialBridge, aiAgent, shopeeAdapter, attributionService,
    googleAdsAPI, tiktokAdsAPI, linkedinAdsAPI, twitterAdsAPI, snapchatAdsAPI, microsoftAdsAPI, pinterestAdsAPI,
    capiMonitor, waIntelligence, autonomousAgent, autoOptimizer,
    webhookProcessor, dataCleanup, adIntelligenceService, competitorSpyService,
    draftService, facebookSystemUserService, campaignMonitorService,
    abTestService, fatigueDetector, unifiedReporter, bulkOperations,
    imageGenerator, audienceIntelligence, creativeScorer, whiteLabelService,
    boostApproval, targeting,
  };
}
