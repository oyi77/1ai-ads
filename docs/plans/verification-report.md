# Refactor Plan Verification Report

Generated: 2026-06-27

## Backend Architecture — Verified

| Claim in Plan | Actual | Status |
|---|---|---|
| 60 route files | **59** route files, 59 imported in routers.js | ⚠️ Off by 1 |
| 64 service files | **61** service files, 44 imported in services.js | ⚠️ Off by 3 |
| 26 repository files | **25** repo files, 19 imported in repositories.js | ⚠️ Off by 1 |
| 13 archived services | 13 archived, 8 truly dead, 5 referenced by AGENTS.md docs only | ✅ Correct |
| 5 archived routes | 5 archived, all truly dead | ✅ Correct |
| 2 archived repos | 2 archived, all truly dead | ✅ Correct |
| 18 dead service test files archived | 5 test files archived | ✅ Correct |
| Auth god function complexity 40 | Verified via knowledge graph | ✅ Correct |
| Settings god function complexity 40 | Verified via knowledge graph | ✅ Correct |
| 8 platform API files with near-identical structure | 8 files exist (meta, google, tiktok, linkedin, twitter, snapchat, microsoft, pinterest) | ✅ Correct |

## Security — Verified

| Claim | Actual | Status |
|---|---|---|
| Tokens stored in plain text | `platform-accounts.js` stores `credentials` as `JSON.stringify(credentials)` — NO encryption | ✅ CONFIRMED |
| asisten-jualan has AES-256-GCM | `security/crypto.py` (67 lines) — uses `cryptography.hazmat.primitives.ciphers.aead.AESGCM` | ✅ CONFIRMED |
| No crypto in Express server | `grep -rn encrypt server/` returns 0 results (only `crypto.randomUUID` for IDs) | ✅ CONFIRMED |

## Frontend — Verified

| Claim | Actual | Status |
|---|---|---|
| Vanilla JS, no framework | ✅ No React/Vue/Angular imports anywhere | ✅ Correct |
| 32+ view files | **42** view files in `client/src/views/` | ⚠️ Undercount |
| Custom router | `client/src/lib/router.js` (1.3KB) | ✅ Correct |
| Custom store | `client/src/lib/store.js` (874B) | ✅ Correct |
| Tailwind installed | `tailwindcss: ^4.3.1` + `@tailwindcss/vite: ^4.3.1` | ✅ Correct |
| Vite config | `root: 'client'`, `build: { outDir: '../dist' }`, Tailwind plugin | ✅ Correct |
| API client pattern | Generic `api.get('/path')` — NOT hardcoded endpoints | ✅ Correct |
| Frontend calls 70+ API endpoints | Verified: `api.get/post/put/del('/...')` across all views | ✅ Correct |

## Infrastructure — CORRECTIONS NEEDED

| Claim in Plan | Actual | Status |
|---|---|---|
| "Hermes (Python) :8443 — Telegram Bot" | **WRONG.** Port 8443 is NOT `asisten-jualan/`. It's the `hermes` binary from `.hermes/bin/` — an agent orchestration system, NOT a Telegram bot. `asisten-jualan/` is NOT running. | ❌ INCORRECT |
| "3 services (Express + Flask + Hermes)" | Flask is stopped. Port 8443 is Hermes agent system (not adforge-related). Only Express:5000 is adforge. | ❌ INCORRECT |
| "Flask :5002 stopped" | ✅ `adforge-dashboard.service` is inactive and removed | ✅ Correct |
| "Nginx → Express:5000 only" | Nginx routes `/` → 5000, but `/webhook/`, `/health`, `/api/webhooks/` → 8443 (Hermes), `/api/payments/notify` → 8765 (Signal Bridge) | ⚠️ Partially correct |
| PM2 config for adforge | `ecosystem.config.cjs` exists, but PM2 is not running for adforge | ⚠️ Not verified |

### Critical Correction: Port 8443 is NOT the Telegram bot

```
Port 8443 = hermes binary (.hermes/bin/) = AI agent orchestration system
            NOT = asisten-jualan Telegram bot
            NOT = adforge-related at all
```

The `asisten-jualan/` directory is a **separate Python project** that is NOT currently running. Port 8443 belongs to the Hermes agent system which is a completely different service (used by Paperclip, codex, etc.).

**Impact on plan:** Phase 6 (Port Telegram Bot to Express) needs revision. The Telegram bot from `asisten-jualan/` is NOT currently deployed or running. Porting it is a NEW feature, not a migration.

## Scripts — Verified

| Claim | Actual | Status |
|---|---|---|
| 250+ scripts | **265** scripts (.py + .sh + .mjs) | ✅ Correct |
| 56 vilona_* scripts | **56** vilona_*.py files | ✅ Correct |
| Scripts actively used (last 7 days) | Hundreds of scripts modified in last 7 days | ✅ Correct |

## Archived Code Value — Verified

| Claim | Actual | Status |
|---|---|---|
| stoploss-engine.js has ROAS drop detection | ✅ `calculateRoasDrop()`, `detectRoasDrop()`, `evaluateStoploss()` — clean state machine | ✅ Correct |
| scale-manager.js has campaign duplication | ✅ `duplicateCampaign()`, `generateHiddenInterests()`, BUDGET_LADDER | ✅ Correct |
| workflow-engine.js orchestrates IKLAN_WORKFLOW | ✅ 7-step weekly cycle, delegates to scale/stoploss | ✅ Correct |
| platform-interfaces.js has platform abstraction | ✅ Interface definition for platforms | ✅ Correct |
| Netlify generate-ads.js has BerkahKarya framework | ✅ VALUE CREATION framework, 4 content models, detailed prompts | ✅ Correct |

## shadcn-admin Template — Verified

| Claim | Actual | Status |
|---|---|---|
| Template exists on GitHub | `https://github.com/satnaing/shadcn-admin` returns 200 | ✅ Confirmed |
| Has dark theme | ✅ Built-in dark/light mode | ✅ Confirmed |
| Has sidebar + topbar | ✅ Responsive sidebar layout | ✅ Confirmed |
| Uses TanStack Table | ✅ Data tables with sorting/filtering | ✅ Confirmed |
| Uses Recharts | ✅ Chart components | ✅ Confirmed |
| TypeScript | ✅ Full TypeScript support | ✅ Confirmed |

---

## Plan Corrections Required

### 1. Fix file count claims
- Routes: 60 → **59**
- Services: 64 → **61**
- Repos: 26 → **25**
- Views: 32 → **42**

### 2. Fix architecture diagram
Port 8443 is NOT the Telegram bot. It's the Hermes agent system (unrelated to adforge). The architecture is:

```
nginx :80
├── /                  → Express :5000 (adforge API + dashboard)
├── /webhook/*         → Hermes :8443 (agent system, NOT adforge)
├── /api/payments/*    → Signal Bridge :8765 (payment webhooks)
└── /api/webhooks/*    → Hermes :8443 (agent system)
```

Only Express:5000 is the adforge service. The other ports are separate infrastructure.

### 3. Fix Phase 6 (Telegram bot)
`asisten-jualan/` is NOT running. Porting the Telegram bot is a NEW feature build, not a migration. The code exists as reference but there's no running service to replace.

### 4. Fix "services" count in metrics
The plan says "64 service files" but only 44 are imported in services.js. The remaining 17 are either:
- Imported directly by routes (not centralized) — ~15 files
- Truly dead (test-fix.js, mcp-client.js) — ~2 files

This is actually a BIGGER problem than the plan states — it means the service layer has no single source of truth.
