# SERVER AGENTS.md

## OVERVIEW
Backend of Adforge – an Express application built with ESM, providing a REST API for the front‑end and handling SQLite persistence.

## ENTRY POINTS
- `server.js` – bootstrap, creates DB via `db/index.js`, loads the Express app from `server/app.js` and starts the HTTP server.
- `server/app.js` – exports `createApp({ db, llmClient, mcpClient })`; registers middleware, routes, and error handling.
- `db/index.js` – creates SQLite DB, runs `schema.sql` migrations, and provides `createDatabase` helper.

## ROUTE ORGANISATION (layered)
```
routes/      → HTTP endpoint definitions
services/    → Business logic, data aggregation
repositories/→ Direct DB queries via better‑sqlite3
middleware/ → auth, validation, error handling
```
Key routes include:
- `routes/trending.js` – internal/external data endpoints (`/trending/internal`, `/trending/external`).
- `routes/ads.js`, `routes/campaigns.js`, `routes/users.js` – CRUD for core entities.

## CONVENTIONS
- All files use `import/export` syntax.
- Controllers are thin – they delegate to services.
- Services are pure functions where possible; repositories contain raw SQL.
- Errors are wrapped in custom `ApiError` subclasses; global error middleware normalises responses.

## ANTI‑PATTERNS
- Demo data seeding (`seedDemoData(db)`) runs on every start – should be gated by an env flag for production.
- No separate CI; linting/config checks are missing.

## INTERNAL vs EXTERNAL DATA
`services/trending.js` documents the split; the internal endpoint returns live metrics, external returns mock market data. UI consumes via `/trending/internal`.

## TESTING
Vitest tests for services and repositories live under `tests/unit/` and `tests/integration/`. Example:
- `tests/unit/services/trending.test.js`
- `tests/unit/repositories/ads.test.js`
Playwright e2e tests target the full stack (`tests/e2e/`).

## COMMANDS
```bash
npm run dev          # start dev server (vite + backend)
npm start            # production start (node server.js)
npm run test        # run all Vitest tests
npm run test:e2e    # run Playwright end‑to‑end tests
```
