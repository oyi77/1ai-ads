# PROJECT KNOWLEDGE BASE

## OVERVIEW
Adforge is a full‑stack JavaScript/TypeScript application using Vite for the frontend, Express for the backend, SQLite via better‑sqlite3, and Playwright/Vitest for testing.

## STRUCTURE
```
.
├─ client/            # Front‑end (Vite, React)
├─ server/           # Backend (Express, services, routes)
├─ src/design/       # Design tokens (colors, CSS variables)
├─ db/               # SQLite schema & init
├─ tests/            # Vitest unit/integration + Playwright e2e
└─ package.json      # Single monorepo manifest
```

## ENTRY POINTS
| Component | Path | Role |
|----------|------|------|
| Server bootstrap | `server.js` | Starts Express app, seeds DB, loads `server/app.js` |
| Express app factory | `server/app.js` | Creates and configures the Express instance |
| Front‑end entry HTML | `client/index.html` | Loads `client/src/app.js` via `<script type="module">` |
| Front‑end bootstrap | `client/src/app.js` | SPA entry point, router setup |
| DB init | `db/index.js` | Creates SQLite DB, runs migrations |

## CONVENTIONS
- ESM (`"type": "module"` in package.json) throughout.
- Layered backend: `routes/ → services/ → repositories/ → db/`.
- Front‑end UI components live under `client/src/views/`.
- Tests under `tests/` follow the pattern `*.test.js` (Vitest) and `*.spec.js` (Playwright).

## ANTI‑PATTERNS
- No dedicated CI workflow (`.github/workflows` missing).
- Database seeding (`seedDemoData`) runs on every server start – should be a separate script for production.

## INTERNAL vs EXTERNAL DATA CONVENTION
Backend routes expose `/trending/internal` and `/trending/external`. The front‑end mirrors this with an "Internal" tab. Documented in `server/services/trending.js` and used in `client/src/views/trending.js`.

## TESTING
- Vitest runs unit, integration, functional and smoke tests (`npm run test:*`).
- Playwright runs e2e under `tests/e2e/` (`npm run test:e2e`).

## COMMANDS
```bash
npm install        # install dependencies
npm run dev        # start Vite dev server + backend
npm run build      # build frontend, output to dist/
npm start           # production: `node server.js`
npm test            # run all Vitest tests
npm run test:e2e   # run Playwright e2e tests
```
