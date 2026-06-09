# AdForge Architecture

## Overview

AdForge is a full-stack ad management platform built with Express 5 (backend) and Vite/vanilla JS (frontend). It integrates with 8 advertising platforms through a unified architecture.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite 8 + vanilla JS SPA, hash-based routing |
| Backend | Express 5, ESM |
| Database | SQLite via better-sqlite3 |
| Auth | JWT + bcrypt + refresh tokens |
| AI/LLM | OmniRoute proxy (configurable provider) |
| Payments | Scalev.id integration |
| Realtime | WebSocket (ws) |

## Integrated Ad Platforms

| Platform | Service | API Version | Auth |
|----------|---------|-------------|------|
| Meta/Facebook | `meta-api.js` | Graph API v22.0 | Access token (query param) |
| Google Ads | `google-ads-api.js` | REST API v18 | OAuth 2.0 + developer token |
| TikTok Ads | `tiktok-api.js` | Business API v1.3 | Access token (header) |
| LinkedIn Ads | `linkedin-ads-api.js` | Marketing REST API | OAuth 2.0 Bearer + version headers |
| Pinterest Ads | `pinterest-ads-api.js` | Marketing API v5 | OAuth 2.0 Bearer |
| Snapchat Ads | `snapchat-ads-api.js` | Marketing API v1 | OAuth 2.0 Bearer |
| Twitter/X Ads | `twitter-ads-api.js` | Ads API v12 | OAuth 2.0 Bearer |
| Microsoft/Bing Ads | `microsoft-ads-api.js` | Advertising API v13 | OAuth 2.0 + developer token |

## Layered Architecture

```
client/src/views/  →  HTTP calls  →  server/routes/  →  server/services/  →  server/repositories/  →  db/
```

- **Routes** (`server/routes/`): Express router factories. Input validation, response formatting.
- **Services** (`server/services/`): Business logic. Platform API clients, AI integration, automation.
- **Repositories** (`server/repositories/`): SQLite data access layer.
- **Lib** (`server/lib/`): Shared utilities — base platform API, error types, logger, rate limiter, auth.

## Platform Integration Pattern

All platform API clients extend `BasePlatformApiClient` (`server/lib/base-platform-api.js`):

```javascript
class MyPlatformAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('platformName', settingsRepo, { baseUrl: '...' });
  }
  _getToken() { /* resolve from settingsRepo or throw ConfigurationError */ }
  async getCampaigns(accountId, opts) { /* ... */ }
  async createCampaign(accountId, params) { /* ... */ }
  async syncAllAccounts() { /* returns standardized { account, campaigns, insights, syncedAt } */ }
}
```

Each platform has:
1. **Service** (`server/services/<platform>-api.js`) — API client extending BasePlatformApiClient
2. **Route** (`server/routes/<platform>-ads.js`) — Express router factory
3. **Tests** (`tests/unit/services/<platform>-api.test.js`) — Vitest unit tests

## Wiring

- `server/app/services.js` — instantiates all service classes
- `server/app/routers.js` — mounts all route handlers
- `server/app/repositories.js` — creates all repository instances

## Frontend

- `client/src/app.js` — SPA router, route registration, nav
- `client/src/views/` — view renderers (one per page)
- `client/src/lib/` — shared utilities (api client, router, store, escape)
- `client/src/components/` — reusable UI components

Key views: Dashboard, Campaigns, Ads, Landing Pages, Analytics, Settings (with per-platform account management), Platforms Hub, Research, Optimizer, Trending, Competitor Spy, AI Suggestions.

## Database

17 tables in `db/schema.sql` with migrations in `db/migrations/`. Key tables: users, campaigns, ads, platform_accounts, automation_rules, performance_history, payments, webhook_events.

## Security

- JWT authentication with refresh tokens
- Rate limiting on public endpoints
- CORS configuration
- Input validation via `server/lib/validate.js`
- Password hashing via bcryptjs
