<!-- Parent: ../AGENTS.md -->

# client

## Purpose
React 19 + TypeScript SPA with TanStack Query and Tailwind CSS 4.
Dark industrial dashboard theme (trading terminal aesthetic).

## Key Files
| File | Description |
|------|-------------|
| `src/lib/api.ts` | Typed fetch wrapper with auth lifecycle (login, register, refreshToken, logout, 401 retry) |
| `src/pages/` | Page components (dashboard, campaigns, settings, creative, reporting, etc.) |
| `src/components/layout/shell.tsx` | App shell with sidebar + topbar |
| `vite.config.js` | Vite build config — sets `root: 'client'`, outputs to `../dist` |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `src/pages/` | React page components (12 pages) |
| `src/lib/` | Utilities (api client, router, escape) |
| `src/components/` | Reusable UI components |
| `public/` | Static assets (favicon) |

## For AI Agents

### Working In This Directory
- No separate `package.json` — deps live in root manifest
- Dev server: `cd client && npm run dev` (Vite :5173, proxies to :5000)
- Production build: `npm run build` outputs to `../dist/`
- `dist/` is gitignored — never commit build artifacts

### Testing Requirements
- Frontend tests: `npm run test:frontend` (Vitest)
- E2E tests exercise the full rendered UI: `npm run test:e2e`

### Common Patterns
- Pages use `useQuery` from TanStack Query for data fetching
- API calls use `api.get/post/put/del` from `src/lib/api.ts`
- Inline styles with CSS variables (var(--bg-elevated), var(--border), etc.)
- Loading and error states handled in every page
- Mutations use `useMutation` + `queryClient.invalidateQueries()`

## Pages (12)
| Page | Route | API Endpoint |
|------|-------|-------------|
| Login | `/login` | `POST /auth/login`, `POST /auth/register` |
| Dashboard | `/app` | `GET /campaigns` |
| Campaigns | `/app/campaigns` | `GET/POST/PUT/DELETE /campaigns` |
| Settings | `/app/settings` | `GET /settings/accounts` |
| Creative Library | `/app/creative-library` | `GET/POST /creative/library` |
| Creative Fatigue | `/app/creative-fatigue` | `GET /creative/fatigue/detect/:id` |
| A/B Tests | `/app/ab-tests` | `GET/POST/PUT /ab-tests` |
| Reporting | `/app/reporting` | `GET /reporting/unified`, `GET /reports/export/csv` |
| Automation | `/app/automation` | `GET/POST/PUT/DELETE /automation/rules` |
| Competitors | `/app/competitors` | `GET/POST /competitor-spy` |
| Attribution | `/app/attribution` | `GET /attribution/summary` |
| Widgets | `/app/widgets` | `GET /reporting/widgets` |

## Dependencies

### Internal
- `src/lib/api.ts` — API request wrapper with auth lifecycle
- `src/design/` — Design tokens (colors, CSS variables)

### External
- React 19 — UI framework
- TanStack Query — Data fetching + caching
- Vite 8 — Build tool and dev server
- lucide-react — Icons
