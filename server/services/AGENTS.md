<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# services

## Purpose
Business logic layer for the Adforge backend. Services orchestrate between repositories, external APIs, and AI/LLM integrations. Contains the core domain logic for ad generation, campaign management, and platform integrations.

## Key Files
| File | Description |
|------|-------------|
| `ad-generator.js` | AI-powered ad creative generation — hooks, body, CTA copy |
| `ad-research.js` | Ad research and market intelligence service |
| `ai.js` | AI/LLM integration hub — coordinates generation requests |
| `auto-optimizer.js` | Automated ad optimization rules engine |
| `campaign-orchestrator.js` | Campaign creation and management orchestration |
| `competitor-spy.js` | Competitor ad monitoring and analysis |
| `creative-studio.js` | Creative asset generation (images, copy variations) |
| `google-ads-api.js` | Google Ads API client — campaign metrics, ad management |
| `landing-generator.js` | AI-powered landing page generation |
| `learning.js` | Learning/feedback loop — improves ad performance over time |
| `llm-client.js` | LLM provider client — abstracts AI model calls |
| `mcp-client.js` | MCP (Model Context Protocol) client for external tool integration |
| `mcp-server.js` | MCP server implementation — exposes Adforge tools to external clients |
| `meta-api.js` | Meta/Facebook Ads API client — campaign, ad set, creative management |
| `scalev.js` | Scalev integration service |
| `templates.js` | Ad and landing page template management |
| `tiktok-api.js` | TikTok Ads API client — campaign and ad management |
| `trending.js` | Trending ads service — internal metrics vs. external market data |

## For AI Agents

### Working In This Directory
- Services should be pure functions where possible — no direct DB access
- DB access goes through `../repositories/`
- External API calls go through `./meta-api.js`, `./google-ads-api.js`, `./tiktok-api.js`
- AI generation uses `./llm-client.js` as the abstraction layer
- `./mcp-client.js` and `./mcp-server.js` handle MCP protocol integration

### Testing Requirements
- Unit tests in `tests/unit/services/` — mock repositories and external APIs
- Integration tests in `tests/integration/` test full service chains

### Common Patterns
- Service receives dependencies (db, config) as parameters
- Returns structured result objects: `{ success, data }` or `{ success: false, error }`
- Platform API clients normalize responses to common format
- LLM prompts managed in `./templates.js`

## Dependencies

### Internal
- `../repositories/` — Database access
- `../lib/` — Shared utilities
- `../middleware/auth.js` — User context

### External
- LLM provider APIs (via `llm-client.js`)
- Meta Ads API, Google Ads API, TikTok Ads API

<!-- MANUAL: Custom project notes can be added below -->
