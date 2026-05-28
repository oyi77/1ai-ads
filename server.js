import 'dotenv/config';
import { createDatabase } from './db/index.js';
import { createApp } from './server/app.js';
import { LLMClient } from './server/services/llm-client.js';
import { MCPClientManager } from './server/services/mcp-client.js';
import { AutonomousAgent } from './server/services/autonomous-agent.js';
import { DailyReporter } from './server/services/daily-reporter.js';
import { seedDemoData } from './db/seed.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('.env loaded successfully');

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  dbPath: process.env.DB_PATH || './db/adforge.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV || 'development',
  llm: {
    url: process.env.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions',
    model: process.env.OMNIROUTE_MODEL || 'auto/pro-reasoning',
    apiKey: process.env.OMNIROUTE_API_KEY || '',
    timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
  },
  fbSystemToken: process.env.FB_SYSTEM_TOKEN || '',
  bkHubUrl: process.env.BK_HUB_URL || 'http://localhost:9099',
  competitorUrls: process.env.COMPETITOR_URLS || '',
  trendingExternalSource: process.env.TRENDING_EXTERNAL_SOURCE || 'mock',
  externalTrendingApi: {
    url: process.env.EXTERNAL_TRENDING_API_URL || 'https://api.example.com/trending',
    apiKey: process.env.EXTERNAL_TRENDING_API_KEY || 'placeholder-key',
    cacheTTL: parseInt(process.env.TRENDING_CACHE_TTL || '3600', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  adSpireApiKey: process.env.AD_SPIRE_API_KEY || '',
  adSpireApiUrl: process.env.AD_SPIRE_API_URL || 'https://api.adspire.io/v1',
  adspirerClientId: process.env.ADSPIRER_CLIENT_ID || '',
  adspirerRedirectUri: process.env.ADSPIRER_REDIRECT_URI || 'http://localhost:5173/api/adspirer/auth/callback',
  similarwebApiKey: process.env.SIMILARWEB_API_KEY || '',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  privacyPolicyUrl: process.env.PRIVACY_POLICY_URL || '',
  termsOfServiceUrl: process.env.TERMS_OF_SERVICE_URL || '',
};

// Start server
const db = createDatabase(config.dbPath);
if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA === 'true') {
  seedDemoData(db);
}

const llmClient = new LLMClient();
const mcpClient = new MCPClientManager();

const app = createApp({ db, llmClient, mcpClient });
const PORT = config.port;

const server = app.listen(PORT, () => console.log(`1ai-ads running on ${PORT}`));

// Attach WebSocket realtime service
app.locals.realtimeService.attach(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
