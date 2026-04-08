<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# server

## Purpose
Express 5 backend providing REST API for Adforge. Follows a layered architecture: routes → services → repositories → db. Handles auth, ad CRUD, campaign management, AI generation, and third-party API integrations.

## Key Files
| File | Description |
|------|-------------|
| `app.js` | Express app factory — `createApp({ db, llmClient, mcpClient })`, registers middleware, routes, error handling |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `routes/` | HTTP endpoint definitions — see `routes/AGENTS.md` |
| `services/` | Business logic and data aggregation — see `services/AGENTS.md` |
| `lib/` | Core utilities (LLM, MCP, API adapters, generators) — see `lib/AGENTS.md` |
| `repositories/` | Direct SQLite queries — see `repositories/AGENTS.md` |
| `middleware/` | Auth, validation, rate limiting — see `middleware/AGENTS.md` |

## For AI Agents

### Working In This Directory
- All files use ESM (`import/export`)
- Controllers are thin — delegate to services
- Services are pure functions where possible; repositories contain raw SQL
- `createApp()` accepts injected dependencies (`db`, `llmClient`, `mcpClient`)
- Errors use custom `ApiError` subclasses; global error middleware normalizes responses

### Testing Requirements
- Unit tests: `tests/unit/` (services, repositories, middleware, lib)
- Integration tests: `tests/integration/` (full Express app with supertest)
- E2E tests: `tests/e2e/` (Playwright against live server)

### Common Patterns
- Repository pattern for DB access (injected `db` instance)
- Service layer handles business logic, never raw SQL
- Route handlers validate input, call service, return JSON
- Platform API clients (Meta, Google, TikTok) in `lib/` abstract third-party calls

## Dependencies

### Internal
- `db/` — SQLite database instance
- `server/lib/` — Shared utilities used by services and routes

### External
- Express 5 — HTTP framework
- bcryptjs + jsonwebtoken — Authentication
- better-sqlite3 — Database driver
- uuid — ID generation

<!-- MANUAL: Custom project notes can be added below -->
