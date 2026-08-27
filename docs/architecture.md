# AdForge Architecture

> **Refreshed:** 2026-08-27. Verified against `server/`, `client/`, `db/`. Corrects stale claims (vanilla-JS frontend, 8 platforms, Scalev.id, `meta-api.js` filenames, 17 tables).

## Stack (CORRECTED)
| Layer | Technology |
|-------|-----------|
| Frontend | **React 18 + TypeScript + Vite**, `react-router-dom`, `@tanstack/react-query`, `lucide-react` (NOT vanilla JS / hash routing) |
| Backend | Express 5 (ESM), Node.js |
| Database | SQLite (better-sqlite3) current; PostgreSQL migration path documented (`MIGRATION-POSTGRES.md`) |
| Auth | JWT + bcrypt + refresh tokens; **ENCRYPTION_KEY + JWT_SECRET required at boot** (throws if unset) |
| AI/LLM | OmniRoute proxy (multi-model routing) |
| Payments | Configurable gateway — **midtrans default**, duitku supported (`server/services/payments.js:27`) |
| Realtime | WebSocket (`ws`) — `realtime-service.js` |
| Bot | Telegram (`node-telegram-bot-api` / grammy) — `server/bot/` |

## Integrated Platforms — 22 adapters (NOT 8)
`server/services/` contains **22 platform adapter directories** (meta, google, tiktok, linkedin, twitter, snapchat, pinterest, microsoft, **amazon**, apple, baidu, criteo, kakao, line, reddit, spotify, taboola, thetradedesk, whatsapp, yandex, shopee, +). Amazon adapter (`amazon/index.js`, `AmazonAdsAPI`) provides **partial retail-media** coverage.

Each adapter follows the **BasePlatformApiClient** pattern:
```js
class XAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) { super('platform', settingsRepo, { baseUrl }); }
  _getToken() { /* resolve per-user token or throw ConfigurationError */ }
  async getCampaigns(accountId, opts) { ... }
  async createCampaign(accountId, params) { ... }
  async syncAllAccounts() { /* → standardized {account, campaigns, insights, syncedAt} */ }
}
```
**Filename convention (CORRECTED):** `server/services/<platform>/index.js` + `manifest.js` (e.g. `server/services/meta/index.js`, `server/services/google/index.js`) — NOT `meta-api.js`.

## Layered Architecture (CORRECTED)
```
client/src/ (React SPA)
   ↓ HTTP (api.ts, X-CSRF-Token pending T1)
server.js → app.js
   → server/routes/        Express routers (validation, formatting, ownership 404)
   → server/services/      Business logic + 22 platform clients + AI/automation
   → server/domain/        Pure decision logic (optimization.js, creative.js) ← was omitted
   → server/repositories/  SQLite/PG data access
   → server/lib/           base-platform-api, rate-limiter, auth, crypto, validate
   → server/middleware/    auth, audit (✅), rbac  ← CSRF missing (T1)
   → server/bot/           Telegram commands + 11 cron jobs ← was omitted
```

- **Routes** (`server/routes/`): routers + validation + per-user ownership checks.
- **Services** (`server/services/`): 83 services; platform clients, AI, automation, reporting.
- **Domain** (`server/domain/`): framework-agnostic rules — Dayparting engine (`optimization.js:223`), creative fatigue/scoring. Unit-testable, no I/O.
- **Bot** (`server/bot/`): Telegram-native UX — unique differentiator. 11 cron jobs (scheduler.js).
- **Lib** (`server/lib/`): shared — `base-platform-api.js`, `platform-client.js` (rate limiters), `crypto.js` (AES-256-GCM), `validate.js`.

## Wiring
- `server.js` — entry; attaches `realtime-service`, starts server.
- `server/app.js` — mounts middleware (audit BEFORE routes), routers, services, CSP.
- `server/app/services.js` — instantiates services (incl. `ImageGenerator`).
- `server/app/routers.js` — mounts route handlers.

## Database — 24 tables (NOT 17)
`db/schema.sql` defines **24 tables** (users, campaigns, ads, platform_accounts, automation_rules, autonomous_rules, audit_log, performance_history, payments, webhook_events, creative_library, audiences, …). Migrations in `db/migrations/`. Current default DB file: `1ai-ads.db` (root); path via `DB_PATH`.

## Security (CORRECTED)
- JWT + refresh tokens; **boot refuses without `JWT_SECRET` + `ENCRYPTION_KEY`**.
- **AES-256-GCM** credential encryption at rest (`crypto.js`).
- **Audit log** — every mutation logged with request body + redaction (`middleware/audit.js`, mounted before routes).
- Rate limiting — per-platform (`platform-client.js`).
- Input validation — `validate.js`.
- ⚠️ **CSRF protection MISSING** — `middleware/` has no `csrf.js`. Tracked as **T1** (must ship before Meta review).
- ⚠️ CORS — restrict `CORS_ORIGIN` to production domain.

## Multi-Tenant SaaS
Single AdForge instance serves many users; all resources scoped by `user_id` (`server/lib/resolve-owner-platform.js`, `resolve-user-platform.js`). System/global token only for fan-out sync, never to read stored creds.
