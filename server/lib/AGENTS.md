<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# lib

## Purpose
Core utility library for the Adforge backend. Contains platform API adapters, AI/LLM clients, generators, and shared helpers. This is the largest server directory with 20 modules.

## Key Files
| File | Description |
|------|-------------|
| `meta-api.js` | Meta/Facebook Ads API adapter — campaign CRUD, creative upload, metrics (~12KB) |
| `google-ads-api.js` | Google Ads API adapter — campaign management, reporting |
| `tiktok-api.js` | TikTok Ads API adapter — campaign and ad operations |
| `mcp-client.js` | MCP client — connects to external MCP servers for tool use |
| `mcp-server.js` | MCP server — exposes Adforge capabilities to MCP clients |
| `llm-client.js` | LLM client abstraction — manages AI model API calls |
| `ad-generator.js` | Ad copy generation using LLM (hooks, body, CTA) |
| `ad-research.js` | Market and competitor research via APIs |
| `creative-studio.js` | Creative asset generation — variations, formats (~7KB) |
| `campaign-orchestrator.js` | Campaign workflow orchestration (~6KB) |
| `auto-optimizer.js` | Automated optimization rules evaluation |
| `learning.js` | Performance learning loop — tracks and improves ad outcomes (~6KB) |
| `templates.js` | Prompt and content templates for generation |
| `trending.js` | Trending data aggregation — internal/external split |
| `competitor-spy.js` | Competitor monitoring and ad analysis |
| `landing-generator.js` | Landing page HTML generation |
| `ai.js` | AI orchestration — coordinates LLM + templates |
| `scalev.js` | Scalev platform integration |

## For AI Agents

### Working In This Directory
- Platform API adapters (`meta-api.js`, `google-ads-api.js`, `tiktok-api.js`) handle auth, rate limits, and response normalization
- `llm-client.js` is the single point for all LLM calls — do not call AI APIs directly
- `mcp-client.js`/`mcp-server.js` implement the Model Context Protocol
- Generators (`ad-generator.js`, `landing-generator.js`) use templates + LLM
- These are utility modules, not services — they export functions, not classes

### Testing Requirements
- Unit tests in `tests/unit/lib/` — mock external API calls
- Key test files: `auth.test.js`, `escape.test.js`, `validate.test.js`

### Common Patterns
- API adapters export `{ createClient(config) }` factory pattern
- LLM calls return structured objects with error handling
- Platform responses normalized to common format
- Templates use string interpolation for variable injection

## Dependencies

### Internal
- Used by `../services/` and `../routes/`

### External
- @modelcontextprotocol/sdk — MCP protocol
- meta-ads-mcp — Meta Ads MCP bridge
- External LLM provider APIs

<!-- MANUAL: Custom project notes can be added below -->
