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
