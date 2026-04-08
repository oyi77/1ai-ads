<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# frontend

## Purpose
Frontend-specific unit tests for client-side JavaScript modules (API client, router, utilities). Run in Node.js via Vitest — no browser required.

## Key Files
| File | Description |
|------|-------------|
| `api.test.js` | API client tests — request construction, auth headers, error handling (~2.5KB) |
| `router.test.js` | SPA router tests — route registration, navigation, hash changes (~2.2KB) |
| `escape.test.js` | HTML escape tests — XSS prevention, special character handling (~800B) |

## For AI Agents

### Working In This Directory
- Run with `npm run test:frontend`
- Tests mock `fetch()` and `window.location` for Node.js environment
- No DOM rendering — tests logic only
- For DOM testing, use E2E tests in `tests/e2e/`

### Common Patterns
- `global.fetch = vi.fn()` for mocking fetch
- `vi.stubGlobal('location', { hash: '' })` for router tests

## Dependencies

### Internal
- Tests import from `client/src/lib/`

<!-- MANUAL: Custom project notes can be added below -->
