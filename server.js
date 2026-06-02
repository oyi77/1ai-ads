import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

import { createDatabase } from './db/index.js';
import { backupDatabase } from './db/backup.js';
import { createApp, startServices } from './server/app.js';
import { LLMClient } from './server/services/llm-client.js';
import { MCPClientManager } from './server/services/mcp-client.js';
import { seedDemoData } from './db/seed.js';
import config from './server/config/index.js';

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

app.locals.realtimeService.attach(server);

startServices(app);

process.on('SIGTERM', () => {
  console.log('SIGTERM received (ignored)');
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
