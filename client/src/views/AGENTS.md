<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# views

## Purpose
Page-level view components for the Adforge SPA. Each file represents a complete page rendered by the client-side router. Views handle their own UI rendering and state management.

## Key Files
| File | Description |
|------|-------------|
| `dashboard.js` | Main dashboard — campaign metrics, CTR, spend overview |
| `ads-list.js` | Ad listing with filters, status badges, and CRUD actions |
| `ads-create.js` | Ad creation form — platform, format, targeting, content model |
| `campaigns-list.js` | Campaign listing with performance metrics and platform tabs |
| `campaign-wizard.js` | Multi-step campaign creation wizard (largest view, ~20KB) |
| `settings.js` | App settings — API keys, platform accounts, preferences (~20KB) |
| `analytics.js` | Analytics dashboard — charts, performance breakdown |
| `research.js` | Ad research and market intelligence view |
| `trending.js` | Trending ads with internal/external data tabs |
| `landing-list.js` | Landing page listing with preview and management |
| `landing-create.js` | Landing page creation form |
| `marketing-lp.js` | Marketing landing page view |
| `optimizer.js` | Ad optimization and A/B testing controls |
| `global-ads.js` | Global ad library browser |
| `competitor-spy.js` | Competitor ad monitoring and analysis |
| `login.js` | Login/authentication page |
| `docs.js` | In-app documentation and help |

## For AI Agents

### Working In This Directory
- Each view exports a render function returning DOM elements
- Views are registered as routes in `client/src/app.js`
- Views import `../lib/api.js` for backend communication
- Views import `../lib/router.js` for navigation
- No shared component library — each view is self-contained
- Inline styles or CSS classes for layout

### Testing Requirements
- Frontend unit tests: `tests/frontend/api.test.js`, `tests/frontend/router.test.js`
- E2E tests exercise full views: `tests/e2e/full-app.spec.js`

### Common Patterns
- View structure: imports → state → render function → event handlers → export
- API data fetched on mount, rendered into DOM templates
- Error/loading states handled inline
- Navigation via `router.navigate('/path')`

## Dependencies

### Internal
- `../lib/api.js` — Backend API client
- `../lib/router.js` — SPA navigation
- `../../src/design/tokens.css` — Design tokens (CSS variables)

<!-- MANUAL: Custom project notes can be added below -->
