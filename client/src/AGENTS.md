<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# client/src

## Purpose
Frontend application source code. Contains the SPA entry point, page-level view components, utility libraries, and the client-side router.

## Key Files
| File | Description |
|------|-------------|
| `app.js` | SPA bootstrap — creates router, mounts root component, configures global services |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `views/` | Page-level components (dashboard, ads, campaigns, settings, etc.) — see `views/AGENTS.md` |
| `lib/` | Frontend utilities (API client, router, escape) — see `lib/AGENTS.md` |
| `components/` | Reusable UI components (currently empty — views handle their own UI) |
| `pages/` | Page components (currently empty — views serve as pages) |
| `styles/` | CSS/style files (currently empty — inline styles used) |

## For AI Agents

### Working In This Directory
- `app.js` is the SPA entry — loaded by `client/index.html`
- Views in `views/` are rendered by the hash-based router from `lib/router.js`
- API calls go through `lib/api.js` which wraps `fetch()` with auth headers
- No framework (React/Vue) — vanilla JS with direct DOM manipulation
- Empty `components/`, `pages/`, `styles/` dirs are placeholders

### Testing Requirements
- Frontend unit tests: `tests/frontend/*.test.js`
- E2E tests exercise rendered views: `tests/e2e/*.spec.js`

### Common Patterns
- Each view exports a render function that returns DOM elements
- Views import `api.js` for backend communication
- State managed locally within views (no global store)

## Dependencies

### Internal
- `lib/api.js` — API request wrapper with auth
- `lib/router.js` — Hash-based SPA router
- `../../src/design/` — Design tokens

<!-- MANUAL: Custom project notes can be added below -->
