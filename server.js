import { createDatabase } from './db/index.js';
import { createApp } from './server/app.js';
import { LLMClient } from './server/services/llm-client.js';
import { MCPClientManager } from './server/services/mcp-client.js';
import { seedDemoData } from './db/seed.js';

const db = createDatabase(process.env.DB_PATH || './db/adforge.db');
seedDemoData(db);

const llmClient = new LLMClient();
const mcpClient = new MCPClientManager();

const app = createApp({ db, llmClient, mcpClient });
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => console.log(`AdForge running on ${PORT}`));

// Graceful shutdown
process.on('SIGTERM', () => { server.close(); db.close(); });
process.on('SIGINT', () => { server.close(); db.close(); });

export default app;
