# 1ai-ads Architecture (Hermes Context)

## System Overview
```
┌─────────────────────────────────────────────────────────────┐
│                     1ai-ads Platform                        │
├─────────────────────────────────────────────────────────────┤
│  Client (Vite/React SPA)                                    │
│  └── /api/* → Express 5 Backend                             │
├─────────────────────────────────────────────────────────────┤
│  Server (Express 5 + ESM)                                   │
│  ├── Routes (48 files)     → Thin handlers                  │
│  ├── Services (74 files)   → Business logic                 │
│  ├── Repositories (23)     → Parameterized SQL              │
│  ├── Lib (12 modules)      → Shared utilities               │
│  └── Middleware            → Auth, validation, rate-limit   │
├─────────────────────────────────────────────────────────────┤
│  Database (SQLite + better-sqlite3)                         │
│  ├── WAL mode, parameterized queries                        │
│  └── JSON fields as TEXT (parsed in repos)                  │
├─────────────────────────────────────────────────────────────┤
│  Scripts (Meta Ads Automation)                              │
│  └── vilona_trakpro_engine.py — Single source of truth      │
├─────────────────────────────────────────────────────────────┤
│  External Integrations (via MCP)                            │
│  ├── Ads Library (Meta, Google, TikTok)                     │
│  ├── Competitor Spy                                         │
│  └── Web Scraping                                           │
└─────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### Routes (`server/routes/`)
- **Only**: Validate input, delegate to service, return JSON
- **Never**: Business logic, raw SQL, external API calls
- **Pattern**: Factory function accepting service instance

### Services (`server/services/`)
- **Only**: Business logic, orchestration, data transformation
- **Dependencies**: Injected repositories (constructor DI)
- **Never**: Raw SQL, HTTP handling

### Repositories (`server/repositories/`)
- **Only**: Database access, parameterized queries
- **Return**: `null` for missing, never `undefined`
- **Never**: Business logic, HTTP concerns

### Lib (`server/lib/`)
| Module | Purpose |
|--------|---------|
| `errors.js` | `ApiError`, `NotFoundError`, `ValidationError` |
| `validate.js` | `validateBody(schema, body)` with Zod |
| `auth.js` | JWT verify, token refresh |
| `logger.js` | Structured logging (pino) |
| `rate-limiter.js` | Express rate limiting |
| `api-response.js` | Standardized JSON responses |
| `safe-parse.js` | Safe JSON.parse with defaults |
| `operators.js` | Query operators for filters |

---

## Meta Ads Engine (`scripts/vilona_trakpro_engine.py`)

### Single Source of Truth For:
- Meta Graph API calls (`fb_get`, `fb_post`)
- Token management (`ACCESS_TOKEN` from `/tmp/fb_token.txt` → env)
- Account configs (`ACCOUNTS` dict)
- Workspace paths (`WORKSPACE`, `DATA_DIR`)
- Logging (`log` function)
- Telegram alerts

### Accounts Managed:
| Account | ID | Name |
|---------|-----|------|
| 0858 | `act_435670549443081` | Kakriput |
| 1041 | `act_380721031313330` | Nyamiresep |
| 1208 | `act_1439536310038458` | Herbal |
| 1134 | `act_2125021885010866` | Glowscent |
| 1340 | `act_1181078009580337` | Selow |

---

## MCP Integrations

### Ads Library (`server/services/ads-library/`)
- `base-adapter.js` → Interface
- `meta-adapter.js` → Meta Ads Library API
- `google-adapter.js` → Google Ads API
- `tiktok-adapter.js` → TikTok Ads API

### Competitor Spy (`server/services/competitor-spy.js`)
- Tracks competitor ad strategies
- Uses MCP for external data

### Web Scraper (`server/services/web-scraper/`)
- `base-scraper.js` → Interface
- `google-scraper.js`, `meta-scraper.js`, `tiktok-scraper.js`

---

## Data Flow Example: Create Campaign

```
POST /api/campaigns
    │
    ▼
Route: validateBody(schema) → campaignService.create(data)
    │
    ▼
Service: business logic → campaignRepo.create(data)
    │
    ▼
Repository: INSERT INTO campaigns (...) VALUES (?, ?, ...)
    │
    ▼
SQLite: Returns lastInsertRowid
    │
    ▼
Service: Returns created campaign
    │
    ▼
Route: res.json({ campaign })
```

---

## Testing Strategy
| Type | Location | Tool |
|------|----------|------|
| Unit | `tests/unit/` | Vitest |
| Integration | `tests/integration/` | Vitest + supertest |
| E2E | `tests/e2e/` | Playwright |
| Smoke | `tests/smoke/` | Vitest |
| Functional | `tests/functional/` | Vitest |

---

## Key Files for Reference
| Purpose | File |
|---------|------|
| App factory | `server/app.js` |
| Route registration | `server/app/routers.js` |
| Service factory | `server/app/services.js` |
| Repo factory | `server/app/repositories.js` |
| DB setup | `db/index.js` |
| MCP server | `mcp.js` |
| Meta Ads engine | `scripts/vilona_trakpro_engine.py` |