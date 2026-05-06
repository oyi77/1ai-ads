import { createDatabase } from './db/index.js';
import { createApp } from './server/app.js';
import { LLMClient } from './server/services/llm-client.js';
import { MCPClientManager } from './server/services/mcp-client.js';
import { seedDemoData } from './db/seed.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env FIRST before any imports (manual parse to avoid dotenv overwrite)
const envPath = join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');
for (const line of lines) {
  const eqIndex = line.indexOf('=');
  if (eqIndex > 0) {
    const key = line.substring(0, eqIndex).trim();
    const value = line.substring(eqIndex + 1).trim();
    process.env[key] = value;
  }
}

console.log('.env loaded:', Object.keys(process.env).filter(k => k.startsWith('FB_') || k === 'JWT_SECRET'));

// Validate config (re-read from process.env)
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is required. Set it in .env before starting the server.');
}

// Now create config object
const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  dbPath: process.env.DB_PATH || './db/adforge.db',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET,
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
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
};

const db = createDatabase(config.dbPath);
if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA === 'true') {
  seedDemoData(db);
}

const llmClient = new LLMClient();
const mcpClient = new MCPClientManager();

const app = createApp({ db, llmClient, mcpClient });
const PORT = config.port;

const server = app.listen(PORT, () => console.log(`AdForge running on ${PORT}`));

// Graceful shutdown
function shutdown() {
  console.log('Starting graceful shutdown...');
  
  // Step 1: Stop AI agent scheduler FIRST (before any other operations)
  if (app.locals.aiAgent) {
    console.log('Stopping AI agent scheduler...');
    app.locals.aiAgent.stopScheduler();
  }
  
  // Step 2: Give a small grace period for any pending scheduler callbacks
  setTimeout(() => {
    console.log('Closing HTTP server...');
    server.close(() => {
      console.log('HTTP server closed');
      
      // Step 3: Close database AFTER server is closed
      console.log('Closing database...');
      db.close();
      console.log('Database closed. Shutdown complete.');
      process.exit(0);
    });
  }, 100);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
