# CLIENT AGENTS.md

## OVERVIEW
Frontend of Adforge – a React SPA built with Vite. The build output is emitted to `dist/` and served by the Express backend.

## ENTRY POINTS
- `client/index.html` – HTML shell, loads the SPA via `<script type="module" src="/src/app.js"></script>`.
- `client/src/app.js` – SPA bootstrap, creates a router, mounts the root component and configures global services.
- `client/src/views/` – UI pages (ads‑create, ads‑list, trending, dashboard, settings, etc.).

## BUILD CONFIG
- Vite config (`vite.config.js`) sets `root: 'client'` and outputs to `../dist`.
- Development runs with `npm run dev` (vite dev server + backend).
- Production build via `npm run build` produces static assets in `dist/` served by Express.

## CONVENTIONS
- Component files are `.js` using ES modules.
- UI state managed locally or via simple services (`client/lib/api.js`).
- API calls use the relative `/api/…` namespace provided by the backend.
- Tabs for internal/external data in `client/src/views/trending.js` reflect the backend `/trending/internal` endpoint.

## ANTI‑PATTERNS
- No separate `package.json` for the client – all dependencies live in the root manifest. Works but deviates from typical monorepo separation.
- Dist folder is committed but ignored via `.gitignore`; ensure it is not accidentally tracked.

## INTERNAL vs EXTERNAL UI
`client/src/views/trending.js` defaults to the **Internal** tab and fetches data from `/trending/internal`. The UI toggles to external data via `/trending/external`.

## TESTING
- Vitest covers unit and functional tests (`tests/frontend/*.test.js`).
- Playwright e2e tests (`tests/e2e/`) exercise the full stack, including the rendered UI.

## COMMANDS
```bash
npm run dev          # start Vite dev server + backend
npm run build        # build the SPA into dist/
npm test             # Vitest unit/functional tests
npm run test:e2e     # Playwright end‑to‑end tests
```
