# Service Architecture Diagrams (SDD)

> **Refreshed:** 2026-08-28. Replaces stale diagrams that referenced a Python `scheduler/` + `config/satpam.py` (not in this repo) and `server/platforms/index.js` shapes that no longer match. Verified against `server/`, `client/`, `server/domain/`, `server/bot/`.

---

## 1. Request Flow (layered, current)
```
Browser (React SPA) / Telegram Bot
        │  HTTP (api.ts, X-CSRF-Token pending T1)
        ▼
server.js → app.js (CSP + audit middleware BEFORE routes)
        │
        ▼
server/routes/<platform>-ads.js  (validation, ownership 404)
        │
        ▼
server/services/  (83 services; e.g. meta/index.js, auto-optimizer.js)
        │  ├─ resolve-owner-platform → per-user token
        │  ├─ domain/optimization.js (pure decisions: dayparting, stoploss)
        │  └─ lib/platform-client.js (rate limiter per platform)
        ▼
server/repositories/  →  db/ (SQLite, 24 tables)
        ▼
Platform APIs (22 adapters via BasePlatformApiClient)
```

## 2. Platform Registry (auto-discovery)
```
server/platforms/index.js  (scans services/*/manifest.js)
   ├─ getPlatform(platform, settingsRepo) → class bound to owner token
   ├─ getAllPlatforms(settingsRepo)
   └─ validatePlatform(instance)  ← enforces platform-interface.js (5 methods)
        │
        ▼  each manifest.js declares:
server/services/<platform>/
   ├─ index.js   (class extends BasePlatformApiClient)
   └─ manifest.js (key, name, auth, capabilities)
```
> 22 adapters: meta, google, tiktok, linkedin, twitter, snapchat, pinterest, microsoft, amazon, apple, baidu, criteo, kakao, line, reddit, spotify, taboola, thetradedesk, whatsapp, yandex, shopee, +.

## 3. Automation / Autonomous Decision Path
```
user rule (compound {all}/{any})  →  rule-evaluator.js
        │
        ▼  (approval-first DEFAULT)
draft action → Telegram/bot notify → owner approve → auto-optimizer.js
   ├─ pause  → meta.updateCampaign(status:PAUSED)
   ├─ budget → meta.updateCampaign(dailyBudget)
   └─ (autonomous tier) → autonomous-agent.js runAutonomousMode() executes directly
        │
        ▼  audit-log (every mutation, body+redaction)
```

## 4. Optimization Engine (domain/optimization.js)
```
evaluateDayparting(campaign, hourOfDay)   ← peak-hours gate
evaluateStoploss({roas, prevRoas, drops}) ← WAIT/REDUCE/KILL
scaleManager.evaluateScaleEligibility()   ← SCALE_UP / HOLD
        │ all pure functions, no I/O → unit-testable
        ▼
auto-optimizer.js wires results to real API calls
```

## 5. Multi-Platform Fan-Out (unified reporting)
```
GET /api/reporting/unified
   → account-report-service.js
   → for each connected platform: getPlatformSync(p).getCampaigns()
   → normalize (metrics-normalizer.js) → single schema
```

## 6. Cross-Repo Integration (1ai ecosystem)
```
┌──────────────┐  POST /api/...   ┌──────────────┐
│   1ai-ads    │ ───────────────▶│  1ai-content │ (video/ebook gen)
│ (Express :5000)│◀───────────────│ (Node)       │
└──────┬───────┘                  └──────────────┘
       │ MCP  /api/mcp/*
       ▼
┌──────────────┐  agents / tools  ┌──────────────┐
│ 1ai-hub (brain)│◀──────────────▶│ OmniRoute LLM │
└──────────────┘                  └──────────────┘
```
> Communication between repos is via HTTP/MCP only (no cross-imports per ecosystem rules).

## 7. Local Deployment (Docker Compose)
```
┌──────────────────────────────────────────┐
│ docker-compose.yml                          │
│  ┌──────────┐   ┌──────────┐                │
│  │ 1ai-ads  │   │ 1ai-ads  │  (PM2 in container)│
│  │ :5000    │   │ db vol   │  db/1ai-ads.db   │
│  └────┬─────┘   └──────────┘                │
│       │                                      │
│  ┌────┴───────────────────────────┐         │
│  │ Telegram Bot (webhook) + Mini App │       │
│  └──────────────────────────────────┘        │
└──────────────────────────────────────────┘
```
> Single Express process (not microservices). SQLite default; Postgres path documented (`MIGRATION-POSTGRES.md`).

## 8. Bot Cron Topology (server/bot/scheduler.js — 11 jobs)
```
initScheduler(bot, deps)
 ├─ 0 */6 * * *   token health fan-out (multi-platform)
 ├─ */5 * * * *   campaign monitor / anomaly
 ├─ 0 0 * * *     daily billing expiry check
 ├─ 0 18 * * *    daily digest → Telegram
 ├─ 0 */6 * * *   backup
 └─ (autonomous)  auto-scale triggered by monitor
```
