const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  dbPath: process.env.DB_PATH || './db/adforge.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET, // REQUIRED - no fallback
  nodeEnv: process.env.NODE_ENV || 'development',
  llm: {
    url: process.env.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions',
    model: process.env.OMNIROUTE_MODEL || 'auto/pro-fast',
    apiKey: process.env.OMNIROUTE_API_KEY || '',
    timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
  },
  fbSystemToken: process.env.FB_SYSTEM_TOKEN || '',
  bkHubUrl: process.env.BK_HUB_URL || 'http://localhost:9099',
  competitorUrls: process.env.COMPETITOR_URLS || '',
  trendingExternalSource: process.env.TRENDING_EXTERNAL_SOURCE || 'mock',
  logLevel: process.env.LOG_LEVEL || 'info',
};

export function validateConfig() {
  if (!config.jwtSecret) {
    throw new Error('FATAL: JWT_SECRET environment variable is required. Set it before starting the server.');
  }
}

export default config;
