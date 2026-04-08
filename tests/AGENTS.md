<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# tests

## Purpose
Comprehensive test suite covering unit, integration, functional, smoke, frontend, and E2E tests. Uses Vitest for JavaScript tests and Playwright for browser E2E.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `e2e/` | Playwright E2E specs — see `e2e/AGENTS.md` |
| `unit/` | Vitest unit tests — see `unit/AGENTS.md` |
| `integration/` | Full Express app integration tests — see `integration/AGENTS.md` |
| `functional/` | Functional validation tests — see `functional/AGENTS.md` |
| `frontend/` | Frontend-specific unit tests — see `frontend/AGENTS.md` |
| `smoke/` | Boot/startup smoke tests — see `smoke/AGENTS.md` |
| `helpers/` | Shared test fixtures and DB helpers |
| `design/` | Test design documents |

## Key Files
| File | Description |
|------|-------------|
| `helpers/db.js` | Test database helper — creates isolated in-memory DB for tests |
| `helpers/fixtures.js` | Shared test fixtures and sample data |

## For AI Agents

### Working In This Directory
- Vitest tests: `*.test.js` — run with `npm test` or targeted `npm run test:unit`
- Playwright specs: `*.spec.js` — run with `npm run test:e2e`
- Unit tests mirror server structure: `unit/db/`, `unit/lib/`, `unit/services/`, `unit/repositories/`, `unit/middleware/`
- Integration tests use `supertest` against the full Express app
- Test DB uses in-memory SQLite to avoid polluting development data

### Testing Requirements
- Always create tests for new routes, services, and repositories
- Use `helpers/db.js` for test database setup
- Mock external APIs (Meta, Google, TikTok) in unit tests
- Integration tests should use the real `createApp()` with test DB

### Common Patterns
- `createDatabase(':memory:')` for test isolation
- Fixtures from `helpers/fixtures.js` for consistent test data
- `supertest(app)` for HTTP-level integration tests

## Dependencies

### Internal
- Tests import from `server/`, `db/`, `client/src/lib/`

### External
- Vitest 4 — Test runner
- Playwright — E2E browser testing
- supertest — HTTP integration testing

<!-- MANUAL: Custom project notes can be added below -->
