<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# integration

## Purpose
Integration tests that exercise the full Express application with real database and middleware. Uses supertest for HTTP-level testing without starting a real server.

## Key Files
| File | Description |
|------|-------------|
| `app.test.js` | Full app integration — tests all major API endpoints, auth flow, error handling (~11KB) |
| `extended-api.test.js` | Extended API coverage — additional endpoints and edge cases (~4KB) |

## For AI Agents

### Working In This Directory
- Run with `npm run test:integration`
- Uses `supertest(app)` to make HTTP requests to the Express app
- App created with test DB (in-memory SQLite)
- Tests the full middleware chain: auth → validation → route → service → repository → DB

### Testing Requirements
- New API endpoints should have integration test coverage
- Test both success and error paths
- Verify response status codes and JSON structure

### Common Patterns
- `const app = createApp({ db: testDb })` — create app with test dependencies
- `request(app).get('/api/ads')` — make HTTP requests
- `expect(response.status).toBe(200)` — verify responses

## Dependencies

### Internal
- Imports `createApp` from `server/app.js`
- Uses `tests/helpers/db.js` for test database

### External
- supertest — HTTP testing without real server

<!-- MANUAL: Custom project notes can be added below -->
