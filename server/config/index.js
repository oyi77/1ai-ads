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
  get fbThreadsId() { return process.env.FB_THREADS_ID || ''; },
  get fbThreadsSecret() { return process.env.FB_THREADS_SECRET || ''; },
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
  get adspirerClientId() { return process.env.ADSPIRER_CLIENT_ID || ''; },
  get adspirerRedirectUri() { return process.env.ADSPIRER_REDIRECT_URI || 'http://localhost:5173/api/adspirer/auth/callback'; },
  get similarwebApiKey() { return process.env.SIMILARWEB_API_KEY || ''; },
  get rateLimitWindowMs() { return parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); },
  get rateLimitMax() { return parseInt(process.env.RATE_LIMIT_MAX || '100', 10); },
  get contentBridgeUrl() { return process.env.CONTENT_BRIDGE_URL || 'http://localhost:3000'; },
  get contentBridgeApiKey() { return process.env.CONTENT_BRIDGE_API_KEY || ''; },
  get socialBridgeUrl() { return process.env.SOCIAL_BRIDGE_URL || 'http://localhost:8200'; },
  get socialBridgeApiKey() { return process.env.SOCIAL_BRIDGE_API_KEY || ''; },
  get socialScoringUrl() { return process.env.SOCIAL_SCORING_URL || 'http://localhost:8008/v1/intelligence/score-conversation'; },
  get metaAiCookies() { return process.env.META_AI_COOKIES || null; },
  get adsLibraryAiCookies() { return process.env.ADS_LIBRARY_AI_COOKIES || null; },
 get telegramBotToken() { return process.env.TELEGRAM_BOT_TOKEN || ''; },
 get telegramChatId() { return process.env.TELEGRAM_CHAT_ID || ''; },
 get webhookVerifyToken() { return process.env.WEBHOOK_VERIFY_TOKEN || ''; },
 get scalevWebhookSecret() { return process.env.SCALEV_WEBHOOK_SECRET || ''; },
 get aiPipelineDirectUrl() { return process.env.AI_PIPELINE_DIRECT_URL || ''; },
 get aiPipelineDirectApiKey() { return process.env.AI_PIPELINE_DIRECT_API_KEY || ''; },
 get aiPipelineDefaultModel() { return process.env.AI_PIPELINE_DEFAULT_MODEL || ''; },
 get nangoSecretKey() { return process.env.NANGO_SECRET_KEY || ''; },
 get approvalRequired() { return process.env.APPROVAL_REQUIRED === 'true' || process.env.APPROVAL_REQUIRED === '1'; },
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
