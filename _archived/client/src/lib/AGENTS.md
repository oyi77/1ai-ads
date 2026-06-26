<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# lib

## Purpose
Frontend utility libraries providing API communication, routing, and data sanitization for the SPA.

## Key Files
| File | Description |
|------|-------------|
| `api.js` | API client wrapper — handles `fetch()` with auth headers, base URL, and error normalization |
| `router.js` | Hash-based SPA router — registers routes, handles navigation, manages history |
| `escape.js` | HTML/string escape utility for XSS prevention |

## For AI Agents

### Working In This Directory
- `api.js` is the single entry point for all backend calls — views should never use `fetch()` directly
- `router.js` uses hash-based routing (`#/path`)
- `escape.js` should be used when rendering user-generated content to DOM

### Testing Requirements
- Unit tests in `tests/frontend/api.test.js` and `tests/frontend/router.test.js`
- Escape utility tested in `tests/frontend/escape.test.js`

### Common Patterns
- `api.js` returns parsed JSON responses, throws on non-2xx status
- `router.js` exports `navigate(path)` for programmatic navigation
- Auth token stored in localStorage, attached by `api.js` automatically

## Dependencies

### Internal
- Used by all views in `../views/`

<!-- MANUAL: Custom project notes can be added below -->
