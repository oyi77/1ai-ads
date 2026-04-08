<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# Adforge

## Purpose
Full-stack ad management platform. Express backend with SQLite persistence, Vite/React SPA frontend, and integrations with Meta, Google, and TikTok ad APIs. Includes AI-powered ad generation, campaign orchestration, landing page builder, and competitor monitoring.

## Key Files
| File | Description |
|------|-------------|
| `server.js` | Server bootstrap — seeds DB, creates Express app, starts HTTP server |
| `mcp.js` | MCP (Model Context Protocol) server implementation |
| `vite.config.js` | Vite build config — sets `root: 'client'`, outputs to `../dist` |
| `vitest.config.js` | Vitest test runner configuration |
| `playwright.config.js` | Playwright E2E test configuration |
| `ecosystem.config.cjs` | PM2 process manager config for production |
| `package.json` | Single monorepo manifest (ESM `"type": "module"`) |
| `.env.example` | Environment variable template |
| `qa.mjs` | QA validation scripts |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `client/` | Frontend SPA (Vite + vanilla JS) — see `client/AGENTS.md` |
| `server/` | Backend API (Express 5, services, repositories) — see `server/AGENTS.md` |
| `db/` | SQLite database, schema, and seeding — see `db/AGENTS.md` |
| `tests/` | Test suites (unit, integration, e2e, functional, smoke) — see `tests/AGENTS.md` |
| `src/design/` | Design tokens (colors, CSS variables) — see `src/design/AGENTS.md` |

## For AI Agents

### Working In This Directory
- Always run `npm install` after modifying `package.json`
- ESM throughout — use `import/export`, never `require()`
- Backend follows layered architecture: `routes/ → services/ → repositories/ → db/`
- Frontend views live under `client/src/views/`
- No separate `package.json` for client — all deps in root manifest

### Testing Requirements
- Run `npm test` (Vitest) before committing
- Run `npm run test:e2e` (Playwright) for full-stack tests
- Tests follow `*.test.js` (Vitest) and `*.spec.js` (Playwright) conventions

### Common Patterns
- UUIDs for primary keys (via `uuid` package)
- JSON fields stored as TEXT in SQLite (parsed/stringified in repositories)
- Demo data seeding runs on every server start (should be env-gated for production)

## Dependencies

### Internal
- `server/` depends on `db/` for persistence
- `client/` consumes API from `server/` via `/api/…` namespace
- `server/lib/` contains shared utilities (LLM client, MCP client, API adapters)

### External
- Express 5 — HTTP framework
- better-sqlite3 — SQLite driver
- Vite 8 — Frontend build tool
- Vitest 4 — Unit/integration test runner
- Playwright — E2E test framework
- bcryptjs + jsonwebtoken — Auth
- @modelcontextprotocol/sdk — MCP integration
- meta-ads-mcp — Meta Ads API MCP bridge

<!-- MANUAL: Custom project notes can be added below -->
