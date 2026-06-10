# 1ai-ads Codebase Analysis Summary

## Analysis Scope
This analysis covers the complete 1ai-ads codebase:
- **Server:** Express.js backend (48 routes, 74 services, 23 repositories)
- **Client:** Vanilla JS SPA (hash-based router, localStorage auth)
- **Database:** SQLite3 with WAL mode
- **Scripts:** Python production automation
- **MCP:** Model Context Protocol integration
- **Tests:** Vitest unit, integration, smoke tests

---

## KEY FINDINGS

### ✅ WHAT THIS CODEBASE DOES RIGHT

1. **Clear Separation of Concerns**
   - Routes → Services → Repositories → Database
   - No business logic in routes
   - No database access in services
   - Dependencies injected via constructors

2. **Strong Error Handling**
   - Typed error classes (ApiError, ValidationError, AuthError, PlatformError, etc.)
   - Never catch-and-swallow
   - All errors logged with context

3. **Configuration Management**
   - Getter-based config (lazy evaluation)
   - Environment-first (no hardcoded secrets)
   - Validation at startup

4. **Database Patterns**
   - Parameterized queries (SQL injection protection)
   - WAL mode for concurrency
   - Null handling (return null, never undefined)
   - UUID for primary keys

5. **Platform API Abstraction**
   - BasePlatformApiClient base class
   - Multi-account support (setActiveAccount)
   - Rate limiting & retries built-in
   - Token resolution chain

6. **Testing Infrastructure**
   - Vitest with in-memory databases
   - Behavior-focused test names
   - Arrange-Act-Assert pattern

7. **Authentication**
   - JWT tokens (access + refresh)
   - Middleware-based protection
   - Client auto-refresh on 401

---

## PATTERNS BY LAYER

### SERVER/LIB/ (Utilities)
**12 core modules** imported everywhere:
- `errors.js` — Typed error classes
- `auth.js` — JWT generation/verification, password hashing
- `logger.js` — Structured logging factory
- `validate.js` — Procedural validation
- `api-response.js` — Standard response shapes
- `base-platform-api.js` — Platform API base class
- `platform-client.js` — HTTP client with rate limiting & retries
- `rate-limiter.js` — Token bucket limiter
- And 4 more (safe-parse, escape, operators, plan-check)

### SERVER/ROUTES/ (48 Endpoints)
**Pattern: Factory function with DI**
```javascript
export function createCampaignsRouter(orchestrator, metaApi, campaignsRepo) {
  const router = Router();
  router.post('/create', async (req, res) => {
    // Validate → Service → Persist → Response
  });
  return router;
}
```
All routes registered in `server/app/routers.js`

### SERVER/SERVICES/ (74 Services)
**Pattern: Class with constructor DI**
```javascript
export class CampaignOrchestrator {
  constructor(metaApi, creativeStudio) {
    this.meta = metaApi;
    this.creative = creativeStudio;
  }
  async createFullCampaign({ ... }) { ... }
}
```
Services throw typed errors; routes catch & respond

### SERVER/REPOSITORIES/ (23 Data Repos)
**Pattern: Single responsibility, parameter queries, null-safe**
```javascript
export class CampaignsRepository {
  constructor(db) { this.db = db; }
  findById(id) { return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) || null; }
  create(data) { const id = uuid(); db.prepare('...').run(...); return id; }
  update(id, data) { /* dynamic SET clause */ }
}
```

### CLIENT/SRC/ (Vanilla JS SPA)
**Pattern: Hash-based router, fetch API, localStorage tokens**
- Router guards unauthenticated routes
- API client auto-refreshes on 401
- Views rendered as HTML strings
- No framework overhead

### SCRIPTS/ (Production Automation)
**Pattern: Direct urllib, manual .env parsing, explicit error handling**
- Python scripts for batch operations
- Token validation before API calls
- Safe error reporting (log prefix/suffix, not full token)

---

## DEPENDENCY INJECTION MODEL

### Initialization Chain
```
server.js
  ↓ createDatabase() 
  ↓ createRepositories(db)
  ↓ createServices({ db, repos })
  ↓ createApp({ db, repos, services })
  ↓ createRouters(app, repos, services)
  ↓ Express listen()
```

### No Global State
- ✅ All instances created in factory functions
- ✅ No singletons in service classes
- ✅ No circular imports
- ✅ app.locals for route access (clean)

---

## AUTHENTICATION FLOW

```
Login
  ↓ POST /api/auth/login
  ↓ Verify password, generate JWT
  ↓ Return { accessToken, refreshToken, user }
  ↓ Client stores in localStorage
  ↓ All subsequent requests: Authorization: Bearer <token>
  ↓ requireAuth middleware verifies & attaches req.user
  ↓ 401 → Client auto-calls refreshToken → Retries request
```

---

## PLATFORM API PATTERNS

### For Every Ad Platform (Meta, Google, TikTok, LinkedIn, etc.)

1. **Extend BasePlatformApiClient**
   - Override `_getToken()` for platform-specific resolution
   - Use inherited `get()` and `post()` methods

2. **Use safeFetch()**
   - Automatic rate limiting (platform-specific buckets)
   - Exponential backoff retries (3x default)
   - Retry-After header handling

3. **Throw PlatformError**
   - Includes platform name, error code, message
   - Propagates to route for client response

4. **Multi-Account Support**
   - `setActiveAccount(accountId, token)`
   - Token resolution chain: explicit → env → database

---

## TESTING STRATEGY

### Test Organization
```
tests/
├── unit/
│   ├── repositories/        # Test DB operations
│   ├── services/            # Test business logic
│   ├── routes/              # Test endpoints
│   ├── lib/                 # Test utilities
│   └── middleware/          # Test JWT verification
├── integration/             # Cross-layer workflows
├── smoke/                   # Sanity checks
└── functional/              # End-to-end scenarios
```

### In-Memory Database
Every test creates fresh DB: `createDatabase(':memory:')`
No cleanup needed; garbage collected per test

### Test Naming
```javascript
// ✅ CORRECT: Behavior-focused
it('should return null when campaign not found', () => { ... });
it('should throw ValidationError when budget is negative', () => { ... });
it('should return paginated campaigns when page=2', () => { ... });
```

---

## CONFIGURATION (Environment Variables)

### Required (No Defaults)
```
JWT_SECRET=...          # Server will not start without this
```

### Optional with Sensible Defaults
```
PORT=5000
NODE_ENV=development
DB_PATH=./db/adforge.db
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173
```

### Platform Tokens (Optional)
```
META_ACCESS_TOKEN=...
FB_SYSTEM_TOKEN=...
GOOGLE_ADS_CREDENTIALS_PATH=...
TIKTOK_ACCESS_TOKEN=...
# ... LinkedIn, Pinterest, Snapchat, Twitter, Microsoft
```

### Validation
```javascript
// In server/config/index.js
export function validateConfig() {
  if (!config.jwtSecret && config.nodeEnv !== 'test') {
    throw new Error('FATAL: JWT_SECRET required');
  }
}

// In server.js
validateConfig();  // Called before starting
```

---

## ANTI-PATTERNS AVOIDED

❌ **NOT IN THIS CODEBASE:**
- Generic `Error` class (always typed)
- Catching errors silently
- Global state / singletons
- Hardcoded secrets/URLs
- `any` type in comments
- God classes or functions > 30 lines
- SQL string concatenation (all parameterized)
- Database access in services
- Circular imports
- Comments explaining WHAT (code is clear); only WHY

---

## WHAT WOULD IMPROVE THIS CODEBASE

1. **Validation Library** (Zod/Pydantic instead of manual)
   - Currently: Procedural validation in lib/validate.js
   - Better: Schema-first with auto-coercion

2. **TypeScript**
   - Currently: Vanilla JS with implicit types
   - Better: Explicit types, IDE support, compile-time errors

3. **Logging Library** (Winston/Pino instead of custom)
   - Currently: Custom logger with stdout/stderr
   - Better: Production-grade with transports, aggregation

4. **API Documentation** (OpenAPI/Swagger)
   - Currently: Inferred from code
   - Better: Auto-generated docs, client SDK generation

5. **Database Migrations** (Knex/Migrate instead of manual)
   - Currently: Versioned migrations in db/migrations/
   - Better: SQL + validation in single framework

6. **Rate Limiting per User** (Currently global)
   - Currently: Platform-wide buckets
   - Better: Per-user + per-IP for better DDoS protection

---

## QUICK SUMMARY: "THE PROPER WAY"

| Task | Pattern |
|------|---------|
| Add endpoint | Factory router + DI + validation → service → repo → response |
| Add service | Class + constructor DI + throw typed errors |
| Add repo | Constructor DI + parameterized queries + return null |
| Add validation | Manual in route or dedicated service |
| Handle error | Throw typed error; let handler respond |
| Test code | Vitest + in-memory DB + behavior-focused names |
| Configure | Environment variables + getter-based + validate at startup |
| Access DB | Always through repository pattern |
| Log anything | Use createLogger('module'); log.info/warn/error/debug() |
| Authenticate | requireAuth middleware → req.user populated |
| Call platform API | Extend BasePlatformApiClient + override _getToken() |

---

## FILES TO READ (IN ORDER)

### Day 1: Understand the Architecture
1. `server/app.js` — Main app factory
2. `server/app/repositories.js` — Repo initialization
3. `server/app/services.js` — Service initialization
4. `server/lib/errors.js` — Error types
5. `db/index.js` — Database setup

### Day 2: Understand Patterns
1. `server/routes/campaigns.js` — Route pattern
2. `server/services/campaign-orchestrator.js` — Service pattern
3. `server/repositories/campaigns.js` — Repository pattern
4. `server/lib/base-platform-api.js` — Platform API pattern
5. `tests/unit/repositories/settings.test.js` — Test pattern

### Day 3: Start Building
1. Copy an existing route/service/repo
2. Rename classes and functions
3. Update dependencies
4. Add tests first
5. Verify all patterns followed

---

## PRODUCTION READINESS CHECKLIST

- [x] Clear separation of concerns (routes → services → repos)
- [x] No business logic in routes
- [x] All errors typed and logged
- [x] Parameterized database queries
- [x] Environment-based configuration
- [x] JWT authentication with refresh tokens
- [x] Rate limiting on API calls
- [x] Multi-account support
- [x] Test coverage (unit, integration, smoke)
- [x] Graceful shutdown (SIGTERM/SIGINT handlers)
- [x] WAL mode for database concurrency
- [x] Error middleware for unhandled exceptions
- [x] CORS configured
- [x] Security headers set
- [x] Logging at key points

This codebase is **production-ready** with enterprise-grade patterns. ✅

