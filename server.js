import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env BEFORE any application imports — ESM hoists static imports
const { default: dotenv } = await import('dotenv');
dotenv.config({ path: join(__dirname, '.env') });

const { createDatabase } = await import('./db/index.js');
const { backupDatabase } = await import('./db/backup.js');
const { createApp, startServices } = await import('./server/app.js');
const { LLMClient } = await import('./server/services/llm-client.js');
const { MCPClientManager } = await import('./server/services/mcp-client.js');
const { seedDemoData } = await import('./db/seed.js');
const { default: config, validateConfig } = await import('./server/config/index.js');

// Validate required configuration before starting
validateConfig();

backupDatabase(config.dbPath, __dirname);

const db = createDatabase(config.dbPath);
if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO_DATA === 'true') {
  seedDemoData(db);
}

const llmClient = new LLMClient();
const mcpClient = new MCPClientManager();

const app = createApp({ db, llmClient, mcpClient });
const PORT = config.port;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`1ai-ads running on ${PORT}`);
});

startServices(app);

// Attach realtime service after services are started
if (app.locals.realtimeService) {
  app.locals.realtimeService.attach(server);
}

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
