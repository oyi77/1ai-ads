<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-08 | Updated: 2026-04-08 -->

# middleware

## Purpose
Express middleware for authentication, request validation, and security. Applied globally or per-route in `server/app.js`.

## Key Files
| File | Description |
|------|-------------|
| `auth.js` | JWT authentication middleware — verifies token, attaches `req.user`, returns 401 on failure |

## For AI Agents

### Working In This Directory
- `auth.js` extracts JWT from `Authorization: Bearer <token>` header
- Applied to protected routes via `router.use(authMiddleware)`
- User object attached to `req.user` with `{ id, username, email }`

### Testing Requirements
- Unit tests in `tests/unit/middleware/auth.test.js`
- Integration tests verify 401 responses on protected endpoints

### Common Patterns
- Middleware follows Express `(req, res, next)` signature
- Returns `res.status(401).json(...)` on auth failure
- Passes to next middleware on success

## Dependencies

### Internal
- Used by routes in `../routes/`
- Token validation references `jsonwebtoken` package

### External
- jsonwebtoken — JWT verification

<!-- MANUAL: Custom project notes can be added below -->
