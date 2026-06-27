const config = {
  get port() { return parseInt(process.env.PORT || '5000', 10); },
  get dbPath() { return process.env.DB_PATH || './db/1ai-ads.db'; },
  get corsOrigin() { return process.env.CORS_ORIGIN || 'http://localhost:5173'; },
  get jwtSecret() { return process.env.JWT_SECRET || ''; },
  get nodeEnv() { return process.env.NODE_ENV || 'development'; },
  get metaApiVersion() { return process.env.META_API_VERSION || 'v22.0'; },
  // Meta AI (MAIBA)
  get metaAi() {
    return {
      endpoint: process.env.META_AI_ENDPOINT || 'https://adsmanager.facebook.com/api/graphql/',
      docId: process.env.META_AI_DOC_ID || '26667472482923907',
      friendlyName: process.env.META_AI_FRIENDLY_NAME || 'MAIBAGraphQLSendMessageV2QueryMutation',
    };
  },
  // Ads Library AI
  get adsLibraryAi() {
    return {
      endpoint: process.env.ADS_LIBRARY_AI_ENDPOINT || 'https://www.facebook.com/api/graphql/',
      docId: process.env.ADS_LIBRARY_AI_DOC_ID || '29650582277919185',
    };
  },
  // Hermes bot proxy
  get hermesBotUrl() { return process.env.HERMES_BOT_URL || 'http://127.0.0.1:8443'; },
  // Meta Ad Library public URLs
  get metaAdLibrary() {
    return {
      url: process.env.META_AD_LIBRARY_URL || 'https://www.facebook.com/ads/library/',
      apiUrl: process.env.META_AD_LIBRARY_API_URL || 'https://www.facebook.com/ads/library/async/',
    };
  },
  // Service intervals (ms)
  get intervals() {
    return {
      cleanupInitialDelay: parseInt(process.env.CLEANUP_INITIAL_DELAY_MS || '60000', 10),
      optimizerInitialDelay: parseInt(process.env.OPTIMIZER_INITIAL_DELAY_MS || '30000', 10),
      dailyReporterCheck: parseInt(process.env.DAILY_REPORTER_INTERVAL_MS || '300000', 10),
      webhookProcessor: parseInt(process.env.WEBHOOK_PROCESSOR_INTERVAL_MS || '60000', 10),
      autonomousAgent: parseInt(process.env.AUTONOMOUS_AGENT_INTERVAL_MS || '900000', 10),
      realtimePoll: parseInt(process.env.REALTIME_POLL_INTERVAL_MS || '30000', 10),
      aiAgentScheduler: parseInt(process.env.AI_AGENT_SCHEDULER_INTERVAL_MS || '300000', 10),
      cacheCleanup: parseInt(process.env.CACHE_CLEANUP_INTERVAL_MS || '300000', 10),
    };
  },
  get fbAppId() { return process.env.FB_APP_ID || ''; },
  get fbAppSecret() { return process.env.FB_APP_SECRET || ''; },
  get fbSystemToken() { return process.env.FB_SYSTEM_TOKEN || ''; },
  get fbConfigId() { return process.env.FB_CONFIG_ID || ''; },
  get llm() {
    return {
      url: process.env.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions',
      model: process.env.OMNIROUTE_MODEL || 'auto/pro-fast',
      apiKey: process.env.OMNIROUTE_API_KEY || '',
      timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
    };
  },
  get bkHubUrl() { return process.env.BK_HUB_URL || 'http://localhost:9099'; },
  get competitorUrls() { return process.env.COMPETITOR_URLS || ''; },
  get trendingExternalSource() { return process.env.TRENDING_EXTERNAL_SOURCE || 'api'; },
  get externalTrendingApi() {
    return {
      url: process.env.EXTERNAL_TRENDING_API_URL || '',
      apiKey: process.env.EXTERNAL_TRENDING_API_KEY || '',
      cacheTTL: parseInt(process.env.TRENDING_CACHE_TTL || '3600', 10),
    };
  },
  get logLevel() { return process.env.LOG_LEVEL || 'info'; },
  get adSpireApiKey() { return process.env.AD_SPIRE_API_KEY || ''; },
  get adSpireApiUrl() { return process.env.AD_SPIRE_API_URL || 'https://api.adspire.io/v1'; },
  get adspirerClientId() { return process.env.ADSPIRER_CLIENT_ID || ''; },
  get adspirerRedirectUri() { return process.env.ADSPIRER_REDIRECT_URI || 'http://localhost:5173/api/adspirer/auth/callback'; },
  get similarwebApiKey() { return process.env.SIMILARWEB_API_KEY || ''; },
  get rateLimitWindowMs() { return parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); },
  get rateLimitMax() { return parseInt(process.env.RATE_LIMIT_MAX || '100', 10); },
  get contentBridgeUrl() { return process.env.CONTENT_BRIDGE_URL || 'http://localhost:3000'; },
  get contentBridgeApiKey() { return process.env.CONTENT_BRIDGE_API_KEY || ''; },
  get socialBridgeUrl() { return process.env.SOCIAL_BRIDGE_URL || 'http://localhost:8200'; },
  get socialBridgeApiKey() { return process.env.SOCIAL_BRIDGE_API_KEY || ''; },
  get metaAiCookies() { return process.env.META_AI_COOKIES || null; },
  get adsLibraryAiCookies() { return process.env.ADS_LIBRARY_AI_COOKIES || null; },
 get telegramBotToken() { return process.env.TELEGRAM_BOT_TOKEN || ''; },
 get telegramChatId() { return process.env.TELEGRAM_CHAT_ID || ''; },
 get notificationWebhooks() { return process.env.NOTIFICATION_WEBHOOKS || ''; },
 get webhookVerifyToken() { return process.env.WEBHOOK_VERIFY_TOKEN || ''; },
 get aiPipelineDirectUrl() { return process.env.AI_PIPELINE_DIRECT_URL || ''; },
 get aiPipelineDirectApiKey() { return process.env.AI_PIPELINE_DIRECT_API_KEY || ''; },
 get aiPipelineDefaultModel() { return process.env.AI_PIPELINE_DEFAULT_MODEL || ''; },
 get gcpServiceAccount() { return process.env.GCP_SERVICE_ACCOUNT || ''; },
 get gcpProjectId() { return process.env.GCP_PROJECT_ID || ''; },
 get bigqueryDataset() { return process.env.BIGQUERY_DATASET || 'adforge_reports'; },
 get gcpServiceAccountEmail() { return process.env.GCP_SERVICE_ACCOUNT_EMAIL || ''; },
  // Platform: LinkedIn Ads
  get linkedinAccessToken() { return process.env.LINKEDIN_ACCESS_TOKEN || ''; },
  get linkedinClientId() { return process.env.LINKEDIN_CLIENT_ID || ''; },
  get linkedinClientSecret() { return process.env.LINKEDIN_CLIENT_SECRET || ''; },
  // Platform: Pinterest Ads
  get pinterestAccessToken() { return process.env.PINTEREST_ACCESS_TOKEN || ''; },
  get pinterestAdAccountId() { return process.env.PINTEREST_AD_ACCOUNT_ID || ''; },
  // Platform: Snapchat Ads
  get snapchatAccessToken() { return process.env.SNAPCHAT_ACCESS_TOKEN || ''; },
  get snapchatRefreshToken() { return process.env.SNAPCHAT_REFRESH_TOKEN || ''; },
  // Platform: Twitter/X Ads
  get twitterAccessToken() { return process.env.TWITTER_ACCESS_TOKEN || ''; },
  get twitterAccountId() { return process.env.TWITTER_ACCOUNT_ID || ''; },
  // Platform: Microsoft/Bing Ads
  get microsoftAccessToken() { return process.env.MICROSOFT_ACCESS_TOKEN || ''; },
  get microsoftDevToken() { return process.env.MICROSOFT_DEVELOPER_TOKEN || ''; },
  get microsoftCustomerId() { return process.env.MICROSOFT_CUSTOMER_ID || ''; },
  // Platform: Shopee
  get shopeeSellerIds() { return process.env.SHOPEE_SELLER_IDS || ''; },
  get shopeeApiUrl() { return process.env.SHOPEE_API_URL || ''; },
  get nangoSecretKey() { return process.env.NANGO_SECRET_KEY || ''; },
};

export function validateConfig() {
  if (!config.jwtSecret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required. Set it in .env before starting the server.');
  }
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 64) {
    throw new Error('FATAL: ENCRYPTION_KEY must be a 64-char hex string (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
}

export default config;
