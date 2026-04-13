import { createDatabase } from './db/index.js';
import { createApp } from './server/app.js';
import { LLMClient } from './server/services/llm-client.js';
import { MCPClientManager } from './server/services/mcp-client.js';
import { seedDemoData } from './db/seed.js';
import config, { validateConfig } from './server/config/index.js';

validateConfig();

const db = createDatabase(config.dbPath);
seedDemoData(db);

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
