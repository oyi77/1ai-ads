# Adforge Comprehensive Improvement & Completion Plan

**Created**: 2026-04-08
**Primary Goal**: Feature completion
**Scope**: Security & config, incomplete features, architecture cleanup, test coverage

---

## Acceptance Criteria

| # | Criterion | How to Verify |
|---|-----------|---------------|
| AC1 | All payment routes return real responses (not 501) | `npm run test:integration` covers payment endpoints |
| AC2 | Competitor spy returns live data, not placeholder | E2E spec verifies competitor-spy page with real API call |
| AC3 | Trending external uses real API (or documented fallback with env flag) | Unit test for `trending.js` external path |
| AC4 | Scalev webhook processes and stores events | Integration test confirms DB writes on webhook |
| AC5 | Zero hardcoded secrets — JWT_SECRET required, no fallbacks | `grep -r "dev-secret" server/` returns nothing |
| AC6 | All env vars documented in `.env.example` | Every `process.env` read has corresponding entry |
| AC7 | Centralized config module — no scattered `process.env` reads | `grep -rn "process.env" server/` only in `server/config/index.js` |
| AC8 | Structured logging replaces all `console.log` in server code | `grep -rn "console.log" server/` returns nothing |
| AC9 | No direct DB queries outside repositories | `grep -rn "db.prepare\|db.exec" server/app.js server/routes/ server/services/` returns nothing |
| AC10 | Test coverage: all services, repositories, middleware have unit tests | `npm run test:unit` passes, all server modules covered |
| AC11 | Rate limiting on all public endpoints | Configurable via centralized config |
| AC12 | CORS origin configurable, no wildcard default | `server/config/index.js` enforces non-* origin |

---

## Stage 1: Foundation — Security & Configuration (No feature changes)

**Why first**: Every subsequent stage depends on safe config and auth. This is the foundation.

### 1.1 Centralized Config Module
- **Create** `server/config/index.js` — single source of truth for all env vars
- **Move** all `process.env` reads from: `server/lib/auth.js:4`, `server/app.js:51`, `server.js:7,14`, `server/services/llm-client.js:3-6`, `server/services/meta-api.js:12`, `server/services/learning.js:3`, `server/services/competitor-spy.js:49`
- **Validate** on startup: fail fast if required vars missing (JWT_SECRET, PORT, DB_PATH)
- **CORS**: require explicit origin, remove `*` default (`server/app.js:51`)

### 1.2 Auth Security Hardening
- **Remove** hardcoded JWT secret fallback in `server/lib/auth.js:4` — throw on missing JWT_SECRET
- **Add** rate limiting to all public endpoints (extend `server/routes/rate-limiter.js`)
- **Add** `.env.example` entries for: JWT_SECRET, BK_HUB_URL, COMPETITOR_URLS, FB_SYSTEM_TOKEN, LLM_API_KEY, LLM_BASE_URL, CORS_ORIGIN

### 1.3 Structured Logging
- **Create** `server/lib/logger.js` — lightweight wrapper (pino or console-with-levels)
- **Replace** all 21 `console.log/console.error` calls across server and client views:
  - `server/app.js:105,130`, `server/services/learning.js:23,28,31,48`, `server/services/llm-client.js:89,105,111`, `server/services/competitor-spy.js:20`, `server/routes/mcp.js:12`
  - Client views: `settings.js:38`, `competitor-spy.js:10`, `trending.js:22`, `campaigns-list.js:24`

**Verification**: `grep -rn "process.env" server/` only in config module; `grep -rn "dev-secret" server/` empty; `npm test` passes

---

## Stage 2: Architecture Cleanup

**Why second**: Clean architecture makes feature work and test writing predictable.

### 2.1 Repository Pattern Enforcement
- **Move** direct DB queries from `server/app.js:115-126` and `server/app.js:129-132` to appropriate repositories
- **Audit** all services for direct `db.prepare`/`db.exec` calls — relocate to repositories
- **Ensure** all repositories follow consistent factory pattern

### 2.2 Error Handling Standardization
- **Create** `server/lib/errors.js` — custom error classes (`ApiError`, `ValidationError`, `AuthError`, `NotFoundError`)
- **Add** `try/catch` to routes missing it: `server/routes/analytics.js:6-15`, `server/routes/landing.js:8-33`, `server/routes/ads.js:7-24`
- **Ensure** global error middleware in `server/app.js` catches all error types

### 2.3 Service Pattern Consistency
- **Standardize** service exports — all use factory functions with injected deps
- **Normalize** return format: `{ success, data }` / `{ success: false, error }` across all services
- **Verify**: services that currently use class pattern vs function pattern

**Verification**: `grep -rn "db.prepare\|db.exec" server/app.js server/routes/ server/services/` empty; all routes have error handling

---

## Stage 3: Feature Completion

**Why third**: With clean architecture and config, feature work is straightforward.

### 3.1 Payment System
- **Implement** `server/routes/payments.js` — replace 501 stubs with real payment processing
- **Create** `server/services/payments.js` — payment orchestration logic
- **Create** `server/repositories/payments.js` — transaction DB storage
- **Add** DB table for `payments` (id, user_id, amount, status, provider, metadata, timestamps)
- **Implement** Scalev webhook processing (`server/routes/scalev.js:68`) — store events in DB
- **Frontend**: Add payment status to relevant views

### 3.2 Competitor Spy
- **Replace** placeholder in `server/routes/competitor-spy.js:8` with full implementation
- **Implement** CRUD endpoints: list competitors, add/remove tracking URLs, refresh data
- **Create** `server/repositories/competitors.js` — store competitor snapshots
- **Add** DB table for `competitor_snapshots` (id, url, platform, ad_data, captured_at)
- **Frontend**: Enhance `client/src/views/competitor-spy.js` with full UI

### 3.3 Trending External Data
- **Replace** hardcoded mock data in `server/services/trending.js:51-109`
- **Implement** real external trend API integration (configurable via env)
- **Add** graceful fallback to cached/mock data when API unavailable (with env flag `TRENDING_EXTERNAL_SOURCE`)
- **Frontend**: Ensure `client/src/views/trending.js` handles both modes

### 3.4 Auto-Optimizer CRUD
- **Add** API routes for automation rules CRUD (currently only has service, no routes)
- **Expose** evaluation trigger endpoint for manual optimization runs
- **Frontend**: Add automation rules management to settings view

### 3.5 Creative Studio Endpoints
- **Add** dedicated API routes for creative generation (currently internal-only service)
- **Expose** via `server/routes/creatives.js`

**Verification**: `npm run test:integration` covers all new endpoints; E2E specs pass for competitor spy and trending

---

## Stage 4: Test Coverage

**Why fourth**: Tests are easier to write against stable, completed features.

### 4.1 Service Unit Tests (13 uncovered)
Create tests in `tests/unit/services/`:
| Service | Test File | Key Scenarios |
|---------|-----------|---------------|
| `meta-api.js` | `meta-api.test.js` | Auth, campaign CRUD, error handling |
| `google-ads-api.js` | `google-ads-api.test.js` | Auth, campaign listing |
| `tiktok-api.js` | `tiktok-api.test.js` | Auth, campaign CRUD |
| `mcp-client.js` | `mcp-client.test.js` | Connection, tool calls |
| `mcp-server.js` | `mcp-server.test.js` | Tool registration, request handling |
| `campaign-orchestrator.js` | `campaign-orchestrator.test.js` | Create/update workflow |
| `auto-optimizer.js` | `auto-optimizer.test.js` | Rule evaluation, triggers |
| `creative-studio.js` | `creative-studio.test.js` | Generation, variations |
| `learning.js` | `learning.test.js` | Feedback loop, improvements |
| `ad-research.js` | `ad-research.test.js` | Research queries |
| `trending.js` | `trending.test.js` | Internal/external data paths |
| `scalev.js` | `scalev.test.js` | Integration calls |
| `competitor-spy.js` | `competitor-spy.test.js` | Monitoring, snapshots |

### 4.2 Repository Unit Tests (3 uncovered)
| Repository | Test File |
|------------|-----------|
| `automation-rules.js` | `tests/unit/repositories/automation-rules.test.js` |
| `settings.js` | `tests/unit/repositories/settings.test.js` |
| `refresh-tokens.js` | `tests/unit/repositories/refresh-tokens.test.js` |

### 4.3 New Route Integration Tests
- `tests/integration/payments.test.js`
- `tests/integration/competitor-spy.test.js`
- `tests/integration/automation-rules.test.js`

### 4.4 E2E Test Expansion
- Add `tests/e2e/payments.spec.js`
- Expand `tests/e2e/competitor-spy.spec.js`
- Add `tests/e2e/trending-external.spec.js`

**Verification**: `npm test` passes with all new tests; coverage report shows all server modules covered

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Payment gateway API changes scope | Medium | High | Start with webhook processing only; add provider integrations incrementally |
| External trend API requires paid subscription | Medium | Medium | Implement with configurable source; fallback to enhanced mock data |
| Test refactoring breaks existing tests | Low | Medium | Run full test suite after each stage; fix breaks immediately |
| Config centralization misses edge cases | Low | Medium | Validate all env vars at startup with clear error messages |
| Architecture changes conflict with in-progress features | Low | High | Each stage is self-contained; complete and verify before next |

---

## Verification Checklist

- [ ] Stage 1: `grep -rn "process.env" server/ | grep -v config/index.js` returns 0 results
- [ ] Stage 1: `grep -rn "dev-secret\|hardcoded" server/` returns 0 results
- [ ] Stage 1: `grep -rn "console.log" server/` returns 0 results
- [ ] Stage 2: `grep -rn "db.prepare" server/app.js` returns 0 results
- [ ] Stage 2: All routes have try/catch or error middleware
- [ ] Stage 3: `npm run test:integration` passes with new payment/competitor/automation endpoints
- [ ] Stage 3: `npm run test:e2e` passes with new E2E specs
- [ ] Stage 4: All 13 services have unit tests in `tests/unit/services/`
- [ ] Stage 4: All repositories have unit tests
- [ ] Overall: `npm test` and `npm run test:e2e` both pass

---

## Estimated Scope

| Stage | New Files | Modified Files | Test Files |
|-------|-----------|----------------|------------|
| 1: Foundation | 2 (config, logger) | ~15 | 2 |
| 2: Architecture | 1 (errors.js) | ~10 | 3 |
| 3: Features | ~6 (services, repos, routes) | ~5 | 6 |
| 4: Tests | 0 | 0 | 19+ |
| **Total** | **~9** | **~30** | **~30** |
