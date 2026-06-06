const config = {
  get port() { return parseInt(process.env.PORT || '5000', 10); },
  get dbPath() { return process.env.DB_PATH || './db/1ai-ads.db'; },
  get corsOrigin() { return process.env.CORS_ORIGIN || 'http://localhost:5173'; },
  get jwtSecret() { return process.env.JWT_SECRET || ''; },
  get nodeEnv() { return process.env.NODE_ENV || 'development'; },
  get metaApiVersion() { return 'v22.0'; },
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
  get trendingExternalSource() { return process.env.TRENDING_EXTERNAL_SOURCE || 'mock'; },
  get externalTrendingApi() {
    return {
      url: process.env.EXTERNAL_TRENDING_API_URL || 'https://api.example.com/trending',
      apiKey: process.env.EXTERNAL_TRENDING_API_KEY || 'placeholder-key',
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
};

export function validateConfig() {
  if (!config.jwtSecret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required. Set it in .env before starting the server.');
  }
}

export default config;
