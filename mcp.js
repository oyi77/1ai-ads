import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from './db/index.js';
import { createRepositories } from './server/app/repositories.js';
import { create1aiAdsMCPServer } from './server/services/mcp-server.js';
// NOTE 2026-09-14: this entrypoint had rotted — it imported a deleted
// module (ad-generator.js) and a renamed class (CompetitorSpy vs
// CompetitorSpyService), so `npm run mcp` crashed on boot. Constructors
// below mirror server/app/services.js (the live wiring). adGenerator stays
// null: the generate_ad_copy tool guards `if (!adGenerator)`.
import { CreativeStudio } from './server/services/creative-studio.js';
import { AiAgent } from './server/services/ai-agent.js';
import { CompetitorSpyService } from './server/services/competitor-spy.js';
import { AutoOptimizer } from './server/services/auto-optimizer.js';
import { LLMClient } from './server/services/llm-client.js';
import { ContentBridge } from './server/services/content-bridge.js';
import { SocialBridge } from './server/services/social-bridge.js';
import { AdIntelligenceService } from './server/services/ad-intelligence.js';

const db = createDatabase(process.env.DB_PATH || './db/adforge.db');

// Initialize repositories via factory (DIP-compliant)
const repos = createRepositories(db);

const llmClient = new LLMClient();
const adGenerator = null;
const creativeStudio = new CreativeStudio(llmClient);
const aiAgent = new AiAgent(repos.settingsRepo, repos.adsRepo, repos.campaignsRepo, llmClient, repos.suggestionsRepo, repos.landingRepo);
const adIntelligenceService = new AdIntelligenceService(db, repos.competitorsRepo);
const competitorSpyService = new CompetitorSpyService(db, adIntelligenceService, null, repos.competitorsRepo);
const autoOptimizer = new AutoOptimizer(repos.settingsRepo, repos.rulesRepo, repos.campaignsRepo);

// .env.example documents CONTENT_BRIDGE_URL / SOCIAL_BRIDGE_URL (server config
// names). Accept both spellings so an env configured per docs still works.
const contentBridge = new ContentBridge(
  process.env.CONTENT_SERVICE_URL || process.env.CONTENT_BRIDGE_URL || 'http://localhost:3000',
  process.env.CONTENT_API_KEY || process.env.CONTENT_BRIDGE_API_KEY || ''
);

const socialBridge = new SocialBridge(
  process.env.SOCIAL_SERVICE_URL || process.env.SOCIAL_BRIDGE_URL || 'http://localhost:8200',
  process.env.SOCIAL_WEBHOOK_SECRET || ''
);

const server = create1aiAdsMCPServer(
  repos.campaignsRepo,
  repos.landingRepo,
  repos.adsRepo,
  {
    adGenerator,
    creativeStudio,
    aiAgent,
    competitorSpyService,
    autoOptimizer,
    llmClient,
    contentBridge,
    socialBridge
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("1ai-ads MCP Server v2.0 running on stdio with 13 tools");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});