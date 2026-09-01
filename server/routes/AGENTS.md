<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# routes

## Purpose
HTTP endpoint definitions for the Express API. Routes are thin controllers that validate input, delegate to services, and return JSON responses.

## Key Files
| File | Description |
|------|-------------|
| `auth.js` | Authentication endpoints — login, register, JWT token issuance |
| `escape.js` | HTML escape utility route |
| `platform-client.js` | Platform account management endpoints — connect/disconnect ad platforms |
| `rate-limiter.js` | Rate limiting middleware configuration for API endpoints |
| `validate.js` | Request validation middleware — body schema, params, query checks |

## For AI Agents

### Working In This Directory
- Routes are registered in `server/app.js` via `app.use('/api/...', router)`
- Keep routes thin — delegate business logic to `../services/`
- Use `validate.js` middleware for input validation
- Use `rate-limiter.js` for public endpoints
- Auth-protected routes should use `../middleware/auth.js`

### Testing Requirements
- Integration tests in `tests/integration/app.test.js` and `tests/integration/extended-api.test.js`
- Route validation tested in `tests/functional/validation.test.js`

### Common Patterns
- Route handler: validate → call service → return `{ success, data }` or `{ error }`
- Error handling delegated to global middleware in `app.js`
- Express 5 async error support (no need for wrapper functions)

## Dependencies

### Internal
- `../services/` — Business logic layer
- `../middleware/auth.js` — JWT authentication
- `../middleware/validate.js` — Input validation

<!-- MANUAL: Custom project notes can be added below -->
