# Changelog

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
