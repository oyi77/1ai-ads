<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# client

## Purpose
Frontend SPA for Adforge. Vanilla JavaScript with Vite build tooling. The build output goes to `dist/` and is served by the Express backend.

## Key Files
| File | Description |
|------|-------------|
| `index.html` | HTML shell — loads SPA via `<script type="module" src="/src/app.js">` |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `public/` | Static assets (favicon) |
| `src/` | Frontend source code — see `src/AGENTS.md` |

## For AI Agents

### Working In This Directory
- No separate `package.json` — deps live in root manifest
- Dev server: `npm run dev` (Vite + backend)
- Production build: `npm run build` outputs to `../dist/`
- `dist/` is gitignored — never commit build artifacts

### Testing Requirements
- Frontend tests: `npm run test:frontend` (Vitest)
- E2E tests exercise the full rendered UI: `npm run test:e2e`

### Common Patterns
- Components are plain `.js` files using ES modules
- API calls use relative `/api/…` paths via `client/src/lib/api.js`
- Views under `src/views/` are page-level components rendered by the SPA router
- Internal/external data tabs in views reflect backend `/trending/internal` and `/trending/external` endpoints

## Dependencies

### Internal
- `client/src/lib/api.js` — API request wrapper
- `client/src/lib/router.js` — SPA hash-based router
- `src/design/` — Design tokens (colors, CSS variables)

### External
- Vite 8 — Build tool and dev server

<!-- MANUAL: Custom project notes can be added below -->
