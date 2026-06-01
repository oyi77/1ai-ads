import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDatabase } from './db/index.js';
import { CampaignsRepository } from './server/repositories/campaigns.js';
import { LandingRepository } from './server/repositories/landing.js';
import { AdsRepository } from './server/repositories/ads.js';
import { AiSuggestionsRepository } from './server/repositories/ai-suggestions.js';
import { AutomationRulesRepository } from './server/repositories/automation-rules.js';
import { create1aiAdsMCPServer } from './server/services/mcp-server.js';
import { AdGenerator } from './server/services/ad-generator.js';
import { CreativeStudio } from './server/services/creative-studio.js';
import { AiAgent } from './server/services/ai-agent.js';
import { CompetitorSpy } from './server/services/competitor-spy.js';
import { AutoOptimizer } from './server/services/auto-optimizer.js';
import { LLMClient } from './server/services/llm-client.js';
import { SettingsRepository } from './server/repositories/settings.js';

const db = createDatabase(process.env.DB_PATH || './db/adforge.db');

// Initialize repositories
const campaignsRepo = new CampaignsRepository(db);
const landingRepo = new LandingRepository(db);
const adsRepo = new AdsRepository(db);
const suggestionsRepo = new AiSuggestionsRepository(db);
const rulesRepo = new AutomationRulesRepository(db);
const settingsRepo = new SettingsRepository(db);

// Initialize services
const llmClient = new LLMClient();
const adGenerator = new AdGenerator(llmClient);
const creativeStudio = new CreativeStudio(llmClient);
const aiAgent = new AiAgent(settingsRepo, adsRepo, campaignsRepo, llmClient, suggestionsRepo, landingRepo);
const competitorSpy = new CompetitorSpy(llmClient);
const autoOptimizer = new AutoOptimizer(settingsRepo, rulesRepo, campaignsRepo);

const server = create1aiAdsMCPServer(
  campaignsRepo,
  landingRepo,
  adsRepo,
  {
    adGenerator,
    creativeStudio,
    aiAgent,
    competitorSpy,
    autoOptimizer,
    llmClient
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
