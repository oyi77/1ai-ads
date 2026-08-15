# Clean Architecture Refactor — 1ai-ads (AdForge)

> **Status: IN PROGRESS (corrected 2026-08-15).** The previous version of this doc asserted
> "✅ Verified" against fabricated metrics (routes 59→10, services 61→15, god functions 3→0).
> Those numbers were never real. This revision documents the **true baseline** measured from
> the working tree and the **executed** work so far, then scopes the remaining safe steps.

## True Baseline (measured 2026-08-15)

| Area | Real count | Notes |
|---|---|---|
| `server/routes/` files | **77** (73 leaf routers + 4 aggregate `_*.js`) | Not 10. Many are platform-specific custom routers (google-ads, tiktok-ads, …). |
| `server/services/` files | **57** | Not 15. |
| `server/domain/` modules | **5** (partial: `campaign.js`, `adset.js`, `creative.js`, `audience.js`, `metric.js`) | No unified aggregate. |
| `server/platforms/` | **1** (`index.js` only) | No `base.js`. Platforms are wired via per-route clients, NOT a shared base class. |
| `server/bot/commands/` | 8 | Node Telegram bot commands. |
| God functions | **2 real** (`createSettingsRouter` ~443 LOC, `createShopeeDashboardRouter` ~268 LOC) + **1 already split** (`createAuthRouter` delegates to `_handlers/auth-handlers.js`). | The "3→0" claim was wrong: auth was already delegated; settings & shopee were not. |

### Why the 77→10 / 57→15 collapse is NOT executed
Bespoke route files (google-ads, tiktok-ads, twitter-ads, linkedin-ads, microsoft-ads,
pinterest-ads, snapchat-ads, …) have genuinely divergent path nesting, HTTP methods, and
unique endpoints. Forcing them into one config-driven router would *add* complexity, not remove
it (confirmed in a prior route-consolidation audit). Services are real API clients with business
logic. Collapsing them on a live revenue service without per-platform behavior verification risks
regressions in 19 platform integrations. **That step is deferred** pending a per-platform audit and
is explicitly NOT claimed as done.

## Executed Work

### 1. `createAuthRouter` — already split (pre-existing, documented here)
- `server/routes/auth.js` is a thin wiring layer.
- Handlers live in `server/routes/_handlers/auth-handlers.js`: `handleRegister`, `handleLogin`,
  `handleRefreshToken`, `handleLogout`, `handleConnectMetaToken`.
- Pattern: each handler is `function handler(deps) { return async (req, res) => {…} }`.
- **No further work needed for auth.**

### 2. `createSettingsRouter` — SPLIT (this pass)
- Extracted all route bodies into `server/routes/_handlers/settings-handlers.js`.
- `settings.js` reduced to a thin factory importing the handlers (byte-identical routes, paths, args).
- Signature unchanged: `createSettingsRouter(settingsRepo, llmClient, db, metaApi, _dailySpendGuard, nangoAuth)`.

### 3. `createShopeeDashboardRouter` — SPLIT (this pass)
- Extracted route bodies + `parseMultipart`/`detectAccountFromFilename` helpers into
  `server/routes/_handlers/shopee-dashboard-handlers.js`.
- `shopee-dashboard.js` reduced to a thin factory.
- Signature unchanged: `createShopeeDashboardRouter(shopeeAdapter, settingsRepo, commissionsRepo)`.

## Remaining Safe Steps (scoped, not yet done)
- [ ] Audit the other `server/routes/*.js` for inline god-functions and split using the same `_handlers/` pattern.
- [ ] Audit `server/services/` for thin pass-through wrappers (per AGENTS.md: thin services forbidden) and fold them into repos or delete.
- [ ] Deferred: per-platform route consolidation (requires per-platform behavior audit + tests).

## Verification Gates (each step)
- `npx eslint server --ext .js` → EXIT 0.
- `npx vitest run` (isolated, single instance) → 0 failures (prior baseline: 1570/1570).
- Isolated boot (`DB_PATH=/tmp/ads-live-copy`, `PORT=5008`) → `/health` 200, routes 200.
- Live `pm2 restart 1ai-ads` + Telethon smoke for any touched surface (settings/shopee).
