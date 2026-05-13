import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from './db/index.js';
import { CampaignsRepository } from './server/repositories/campaigns.js';
import { LandingRepository } from './server/repositories/landing.js';
import { AdsRepository } from './server/repositories/ads.js';
import { create1ai-adsMCPServer } from './server/services/mcp-server.js';

const db = createDatabase(process.env.DB_PATH || './db/1ai-ads.db');
const server = create1ai-adsMCPServer(
  new CampaignsRepository(db),
  new LandingRepository(db),
  new AdsRepository(db)
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("1ai-ads MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
