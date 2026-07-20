## [1.4.0] - 2026-07-20

### Removed
- **Thin service wrappers**: `InvoiceService`, `AudienceManager` — routes use repos directly
- **3 orphan files**: `repositories/creative-performance.js`, `services/mcp-client.js`, `services/ai.js`
- **6 dead config keys**: `fbConfigId`, `adSpireApiKey`, `adSpireApiUrl`, `notificationWebhooks`, plus 4 BigQuery keys and 22 platform credential getters
- **2 dead dependencies**: `@google-cloud/bigquery` (~40MB), `mcp-meta-ads`
- **`node-fetch` dependency** — only import replaced with global fetch + `AbortSignal.timeout`
- **`scripts/test-bq.js`** — would crash on import of removed module

### Fixed
- **CRITICAL**: `server.js` missing `llmClient` instantiation — server failed to boot
- **HIGH**: MCP services pass-through — `_mcp.js` → `routes/mcp.js` → `mcp-server.js` now correctly receives services; `competitorSpy` destructuring fixed (enables 6 MCP tools)
- **3 pre-existing crashes**: `boostApproval`/`targeting` missing from services.js instantiations; `capiMonitor` missing from services.js return
- **`learning.js`**: replaced unmaintainable `node-fetch` with native global fetch
- **Invalid `package.json` JSON** after prior edit — restored valid structure
- **`@tailwindcss/vite` and `tailwindcss`** moved to devDependencies (not runtime deps)

### Changed
- **Phase 1 cleanup**: 18 files changed (+160 −647), 14 packages removed from `node_modules`
- **Server boots cleanly** — all 9 background services start without crashes


## [1.3.0] - 2026-06-28

### Added
- **Open source SDK adoption**: `facebook-nodejs-business-sdk` (Meta), `google-ads-api` (Google), `@nangohq/node` (Nango OAuth)
- **Nango OAuth layer**: centralized token management (optional, env-gated via `NANGO_SECRET_KEY`)
- **ESLint flat config**: migrated from `.eslintrc.json` to `eslint.config.js` for ESLint v10
- **308 new unit tests** across 20 new test files (coverage 53% → 70%+)
- **Error states** added to 7 frontend pages (dashboard, campaigns, ads, competitors, audience-intelligence, creative-fatigue, trending)
- **AI Configuration section** in Settings page (endpoint, model, test connection)
- **Comprehensive demo data seeding**: 8 campaigns, 15 ads, 5 landing pages, 2 platform accounts, 56 performance history rows
- **Multi-platform account connection**: Settings page now supports Meta, Google, TikTok, LinkedIn, Twitter, Snapchat, Pinterest, Microsoft

### Fixed
- **CRITICAL**: `routes/capi.js` called non-existent `monitorQuality()` → fixed to `checkHealth()`
- **CRITICAL**: `routes/agency.js` — 3 wrong-signature service calls fixed
- **CRITICAL**: 7 frontend broken API paths fixed (ab-tests, drafts, audience-intelligence, attribution, reporting)
- **HIGH**: `routes/campaigns.js` — `GET /sync/ads` route shadowed by `GET /:id`
- **HIGH**: `services/batch-service.js` — access token removed from URL query string (security)
- **HIGH**: `services/tiktok-api.js` — duplicate `_post` method removed
- **HIGH**: `services/webhook-processor.js` — stub event handlers now implement actual DB updates
- **HIGH**: `services/fatigue-detector.js` — R² calculation bug (ssTot undefined)
- **HIGH**: `services/creative-scorer.js` — variable shadowing (hook vs _hook)
- **HIGH**: `services/base-scraper.js` — proxy support implemented via undici.ProxyAgent
- **HIGH**: Frontend missing error states on 8 pages
- **HIGH**: Frontend landing-pages missing product_name field
- **HIGH**: Frontend widgets toggle had no onClick handler
- `server.js` — seed data now runs in all environments (was gated behind NODE_ENV !== 'production')
- `nango-auth.js` — fixed import to use named export
- `meta-api.js` — removed dead logger line
- Systemd service config fixed (removed EnvironmentFile that caused exit-code 127)
- Removed all dead imports across frontend pages

### Changed
- **169 ESLint diagnostics → 0**: eqeqeq (7), prefer-const (14), no-console (49), no-unused-vars (98), no-undef (1)
- Seed data wrapped in `BEGIN IMMEDIATE TRANSACTION` for WAL atomicity
- Systemd service uses NVM Node.js binary instead of system `/usr/bin/node`
- `.eslintrc.json` removed (replaced by `eslint.config.js`)

### Infrastructure
- Production seed data now runs on startup (INSERT OR IGNORE is safe)
- Systemd `EnvironmentFile` removed (caused parsing issues with .env format)
- SPA rebuilt with all frontend fixes


# Changelog

## [1.2.0] - 2026-06-27

### Changed
- **Scheduler wired to real domain functions** — all 10 cron jobs now call optimization/reporting/creative modules instead of placeholder stubs
- Campaign monitor calls `evaluateStoploss`, `evaluateScaleEligibility`, `generateReport`
- Bid Satpam enforces configurable bid caps via `BID_SATPAM_MIN/MAX/TARGET` env vars
- Daily dashboard sends formatted report via Telegram (`formatDailyReport`)
- Token health check verifies Meta tokens and alerts on expiry
- Spend guard compares campaigns against automation rules
- Subscription check monitors payment expiry
- Follow-up engine flags WINNING campaigns not yet scaled
- Meta campaign sync pulls remote campaigns to local DB
- Daily eval guard evaluates all active campaigns with `evaluateMetrics`

### Added
- **Dayparting**: time-of-day budget adjustment (peak/off-peak hours, configurable via env vars)
- **Creative rotation**: auto-detect when creatives need refresh based on fatigue + age
- **Audit logging**: `audit_log` table + middleware logs all POST/PUT/DELETE to `/api/`
- **Helmet middleware**: security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- **API client rewrite**: full auth lifecycle (login, register, refreshToken, logout, 401 retry)
- **Settings page**: functional with connected accounts display and disconnect
- **CSV export**: `GET /api/reports/export/csv` downloads campaign data
- **Domain constants configurable**: all optimization thresholds backed by env vars with defaults
- 22 new environment variables documented in `.env.example`


### Infrastructure
- **Docker Compose** deployment — single container, auto-restart on crash/reboot
- **Removed hermes-bot** — old Python/FastAPI Telegram bot (Docker `asisten-jualan-app`) killed and replaced
- **Stopped adforge.service** — old systemd service disabled, Docker manages lifecycle
- **Nginx routing fixed** — `adforge.aitradepulse.com` now routes to port 5000 (was 8443)
- **MCP server** accessible via SSE at `GET /api/mcp/sse` (13 tools for agent access)

### Security
- Added Helmet middleware for security headers
- Added `audit_log` table and audit middleware (logs all mutating API requests)
- All domain constants (ROAS thresholds, stoploss config, bid caps, budget ladder) configurable via env vars


## [1.1.0] - 2026-06-09

### Added
- **LinkedIn Ads** integration: campaigns, analytics, audiences, creatives (service + route + tests)
- **Pinterest Ads** integration: campaigns, analytics, ad groups, targeting keywords (service + route + tests)
- **Snapchat Ads** integration: organizations, campaigns, stats, ad squads, audiences (service + route + tests)
- **Twitter/X Ads** integration: campaigns, stats, line items, targeting criteria (service + route + tests)
- **Microsoft/Bing Ads** integration: accounts, campaigns, performance, ad groups, keywords (service + route + tests)
- Platforms Hub dashboard view (`/platforms`) — unified view of all 8 connected platforms
- Platform credential management for all 5 new platforms in Settings > Connected Accounts
- Architecture documentation (`docs/architecture.md`)
- API reference documentation (`docs/api.md`)
- Operations guide (`docs/ops.md`)
- ADR-001: Multi-Platform Integration architecture decision record

### Fixed
- MetaVideoService test `_resolveToken` now properly mocks config to prevent env token leakage

### Changed
- All 5 new platform services available in `server/app/services.js`
- All 5 new platform routes mounted in `server/app/routers.js`
- Autonomous agent now receives all 8 platform API clients
- `.env.example` updated with all new platform environment variables
- Navigation includes Platforms hub link

## [1.0.0] - 2026-06-01

### Initial Release
- Meta/Facebook Ads integration
- Google Ads integration
- TikTok Ads integration
- Campaign management (CRUD, activate, pause)
- Ad creative management
- Landing page builder
- Analytics dashboard
- AI-powered ad generation
- Automation rules engine
- Competitor spy tool
- Content scheduling
- Scalev.id payment integration
- JWT authentication with refresh tokens
- WebSocket real-time updates
- MCP server integration
