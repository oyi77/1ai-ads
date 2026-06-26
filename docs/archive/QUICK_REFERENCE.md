# 1ai-ads: Quick Pattern Reference Card

## ⚡ 60-Second Architecture Overview

```
Client (hash router) 
    ↓ HTTP/JSON
Express Routes (validation → service → repo → response)
    ↓
Services (business logic, throw typed errors)
    ↓
Repositories (DB access, always use parameterized queries)
    ↓
SQLite3 (WAL mode, schema-first)
```

---

## 🏗️ PROJECT STRUCTURE

| Dir | Purpose | Files | Key Pattern |
|-----|---------|-------|-------------|
| `server/lib/` | Shared utilities | 12 | Imported everywhere (errors, auth, logging, validation) |
| `server/routes/` | HTTP endpoints | 48 | Factory functions, DI, no DB access |
| `server/services/` | Business logic | 74 | Classes, inject repos, throw typed errors |
| `server/repositories/` | Data access | 23 | Constructor DI, parameterized queries, return null for missing |
| `server/middleware/` | Express middleware | 1 | JWT verification, attaches `req.user` |
| `server/config/` | Configuration | 1 | Getters-based, env-first, validate at startup |
| `db/` | Database layer | Schema, migrations | Create in-memory for tests with `createDatabase(':memory:')` |
| `client/src/` | Frontend | Vanilla JS | Hash router, fetch API, token in localStorage |
| `scripts/` | Production scripts | Python/JS | Token management, batch operations, no frameworks |

---

## 📝 BEFORE YOU CODE

### 1. Restate the requirement (1 sentence)
> "Add endpoint to fetch user's campaigns with pagination"

### 2. Define the data shape
```javascript
// Response shape
{
  success: true,
  data: [{ id, name, status, budget, spend, impressions, clicks, roas }],
  pagination: { page: 1, perPage: 20, total: 150, totalPages: 8 }
}
```

### 3. Write the function signature first
```javascript
async getCampaigns(userId, { page = 1, perPage = 20 } = {})
  → { data: Campaign[], pagination: Pagination }
```

### 4. Name the edge cases
- User has no campaigns → return empty array
- Invalid page number → clamp to 1..totalPages
- Missing user → throw NotFoundError

---

## ✅ ADDING A NEW ENDPOINT

```javascript
// 1. Create route in server/routes/[domain].js
export function create*Router(service, repo) {  // ← DI
  const router = Router();
  
  router.get('/list', async (req, res) => {
    // 2. Validate input
    const { page = 1 } = req.query;
    if (page < 1) {
      return res.status(400).json({ success: false, error: 'page must be >= 1' });
    }
    
    try {
      // 3. Call service
      const result = await service.getList(page);
      
      // 4. Return response
      res.json({ success: true, data: result.data, pagination: result.pagination });
    } catch (err) {
      // 5. Error handling (explicit)
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  return router;
}

// 2. Register in server/app/routers.js
createRouters(app, repos, services) {
  app.use('/api/domain', create*Router(
    services.domainService,
    repos.domainRepo
  ));
}

// 3. Test it
describe('GET /api/domain/list', () => {
  it('should return paginated list', async () => {
    const res = await request(app).get('/api/domain/list?page=1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pagination).toEqual(expect.objectContaining({ page: 1 }));
  });
});
```

---

## ✅ ADDING A NEW SERVICE

```javascript
// server/services/domain-service.js
import { createLogger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

const log = createLogger('domain-service');

export class DomainService {
  constructor(domainRepo, otherService) {
    this.repo = domainRepo;      // ← DI repos
    this.other = otherService;   // ← DI services
  }

  async getList(page = 1) {
    try {
      log.info('Fetching domains list', { page });
      
      const { data, total } = this.repo.findAll({ 
        page, 
        perPage: 20 
      });
      
      return {
        data,
        pagination: { page, perPage: 20, total, totalPages: Math.ceil(total / 20) }
      };
    } catch (err) {
      log.error('Failed to fetch domains', { error: err.message });
      throw err;  // ← Propagate; let caller handle
    }
  }

  async create(data) {
    // Validation
    if (!data.name) throw new ValidationError('name required');
    
    // Business logic
    const duplicate = this.repo.findByName(data.name);
    if (duplicate) throw new ValidationError('Domain already exists');
    
    // Persistence
    const id = this.repo.create(data);
    log.info('Domain created', { id, name: data.name });
    return id;
  }
}
```

---

## ✅ ADDING A NEW REPOSITORY

```javascript
// server/repositories/domain.js
import { v4 as uuid } from 'uuid';

export class DomainRepository {
  constructor(db) {
    this.db = db;  // ← SQLite connection
  }

  findAll({ page = 1, perPage = 20 } = {}) {
    const offset = (page - 1) * perPage;
    const data = this.db.prepare(`
      SELECT * FROM domains 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(perPage, offset);
    
    const { count } = this.db.prepare('SELECT COUNT(*) as count FROM domains').get();
    
    return { data, total: count };
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM domains WHERE id = ?').get(id) || null;
  }

  create(data) {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO domains (id, name, description, created_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, data.name, data.description || null);
    return id;
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    
    const fields = [], params = [];
    for (const field of ['name', 'description']) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field]);
      }
    }
    
    if (fields.length) {
      params.push(id);
      this.db.prepare(`UPDATE domains SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }
    
    return this.findById(id);
  }

  delete(id) {
    this.db.prepare('DELETE FROM domains WHERE id = ?').run(id);
  }
}

// Register in server/app/repositories.js
return {
  domainRepo: new DomainRepository(db),
  // ...
};
```

---

## ✅ CONNECTING A NEW PLATFORM API

```javascript
// server/services/platform-api.js
import { BasePlatformApiClient } from '../lib/base-platform-api.js';
import { PlatformError } from '../lib/errors.js';

const BASE_URL = 'https://api.platform.com/v1';

export class PlatformAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('platform', settingsRepo, { baseUrl: BASE_URL });
  }

  _getToken() {
    if (this._explicitToken) return this._explicitToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('platform');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError('Platform token not configured');
  }

  async getCampaigns(accountId) {
    try {
      const path = `/accounts/${accountId}/campaigns`;
      return await this.get(path, { fields: 'id,name,status,budget' });
    } catch (err) {
      throw new PlatformError(`Failed to fetch campaigns: ${err.message}`, 'platform', err.code);
    }
  }

  async createCampaign(accountId, data) {
    try {
      return await this.post(`/accounts/${accountId}/campaigns`, data);
    } catch (err) {
      throw new PlatformError(`Campaign creation failed: ${err.message}`, 'platform', err.code);
    }
  }
}
```

**Base class provides:**
- `this.get(path, params)` — GET with token injection
- `this.post(path, body)` — POST with token injection
- `safeFetch()` — automatic retries, rate limiting, error handling

---

## 🔒 ERROR HANDLING PATTERNS

### Throw Typed Errors (Never Generic Error)
```javascript
// ❌ WRONG
throw new Error('User not found');

// ✅ CORRECT
throw new NotFoundError('User not found');
```

### Error Hierarchy
```
ApiError (status: 500)
  ├─ ValidationError (status: 400)
  ├─ AuthError (status: 401)
  └─ NotFoundError (status: 404)

PlatformError (no status; has platform, code)
  ├─ Meta platform errors
  ├─ Google platform errors
  └─ TikTok platform errors
```

### Never Swallow Errors
```javascript
// ❌ WRONG
try {
  await service.doSomething();
} catch (err) {
  // Silent failure — data is corrupted now
}

// ✅ CORRECT
try {
  await service.doSomething();
} catch (err) {
  log.error('Failed to do something', { error: err.message, context });
  throw err;  // Re-throw or throw new error
}
```

---

## 🔐 AUTHENTICATION

### JWT Tokens
- **Access token:** 15 minutes, stored in Authorization header
- **Refresh token:** 30 days, stored in httpOnly cookie (frontend uses localStorage)
- **Generation:** `generateToken(payload, expiryTime)`
- **Verification:** `verifyToken(token)` returns payload or throws

### Middleware
```javascript
router.post('/protected', requireAuth, async (req, res) => {
  const userId = req.user.id;  // ← Set by middleware
  // handler...
});
```

### Token Refresh
Client auto-refreshes on 401:
```javascript
// client/src/lib/api.js
if (res.status === 401 && !isRetry) {
  const refreshed = await api.refreshToken();
  if (refreshed) return request(method, path, body, true);
}
```

---

## 📊 DATABASE PATTERNS

### Query Parameterization (ALWAYS)
```javascript
// ❌ WRONG - SQL injection vulnerability
db.prepare(`SELECT * FROM users WHERE id = ${id}`).all();

// ✅ CORRECT
db.prepare('SELECT * FROM users WHERE id = ?').get(id);
```

### Null Handling
```javascript
// ❌ WRONG
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
if (!user) console.log('not found');  // undefined is falsy but imprecise

// ✅ CORRECT
const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
if (!user) return null;  // Clear intent: null = not found
```

### Transaction Example
```javascript
const transaction = db.transaction((data) => {
  const campaignId = campaignsRepo.create(data);
  const adsetId = adsetsRepo.create({ campaignId });
  const adId = adsRepo.create({ adsetId });
  return { campaignId, adsetId, adId };
});

try {
  const result = transaction(data);
  log.info('Created campaign hierarchy', result);
} catch (err) {
  log.error('Transaction failed, rolled back', { error: err.message });
  throw err;
}
```

---

## 🧪 TESTING PATTERNS

### Test Structure (Vitest)
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { CampaignRepository } from '../../../server/repositories/campaigns.js';

describe('CampaignRepository', () => {
  let db, repo;

  beforeEach(() => {
    db = createDatabase(':memory:');  // Fresh DB per test
    repo = new CampaignRepository(db);
  });

  describe('findById', () => {
    it('should return null when campaign does not exist', () => {
      const result = repo.findById('nonexistent');
      expect(result).toBeNull();
    });

    it('should return campaign when it exists', () => {
      const id = repo.create({ name: 'Test', status: 'active' });
      const result = repo.findById(id);
      expect(result).toEqual(expect.objectContaining({ name: 'Test' }));
    });
  });
});
```

### Test Naming: Behavior-First
```javascript
// ❌ WRONG - Implementation-focused
it('calls findAll method', () => { ... });

// ✅ CORRECT - Behavior-focused
it('should return empty array when no campaigns exist', () => { ... });
it('should return paginated results when page=2', () => { ... });
it('should throw NotFoundError when user is deleted', () => { ... });
```

---

## 📋 VALIDATION CHECKLIST

Before committing code, verify:

- [ ] All imports use relative paths: `import { X } from '../lib/x.js'`
- [ ] All errors are typed (not generic `Error`)
- [ ] All errors are logged with context
- [ ] All DB queries use parameterization
- [ ] All repositories return `null` for missing data (never `undefined`)
- [ ] All services inject dependencies via constructor
- [ ] All routes validate input at top
- [ ] All async operations have try-catch
- [ ] No DB access in services (only via repos)
- [ ] Config only via environment variables
- [ ] No secrets hardcoded anywhere
- [ ] All tests use in-memory DB (`:memory:`)
- [ ] Test names describe behavior, not implementation
- [ ] No commented-out code
- [ ] No `console.log()` (use logger)
- [ ] Functions < 30 lines
- [ ] Max 2 levels of nesting (use early returns)
- [ ] No circular imports

---

## 🚀 COMMON TASKS

### To start the server
```bash
npm install
npm start
# Listens on PORT (default 5000)
```

### To run tests
```bash
npm test                    # All tests
npm run test:unit          # Unit only
npm run test:integration   # Integration only
npm run test:watch         # Watch mode
```

### To access configuration
```javascript
import config from './server/config/index.js';

console.log(config.port);           // 5000
console.log(config.nodeEnv);        // 'development'
console.log(config.llm.model);      // 'auto/pro-fast'
console.log(config.jwtSecret);      // Throws if not set in .env
```

### To add a new environment variable
1. Add to `.env` (local dev)
2. Add to `.env.example` (documentation)
3. Add getter to `server/config/index.js`
4. If secret: validate in `validateConfig()`

---

## 📚 Key Files to Read

When starting:
1. **`server/app.js`** — Main app factory, middleware setup
2. **`server/app/repositories.js`** — How all repos are initialized
3. **`server/app/services.js`** — How all services are initialized
4. **`server/lib/errors.js`** — All error types
5. **`server/lib/auth.js`** — JWT generation/verification
6. **`server/lib/logger.js`** — Logging patterns
7. **`server/config/index.js`** — Configuration getters
8. **`db/index.js`** — Database creation & schema

When adding new features:
1. **`server/routes/[domain].js`** — Study an existing route
2. **`server/services/[domain]-service.js`** — Study an existing service
3. **`server/repositories/[entity].js`** — Study an existing repo
4. **`tests/unit/repositories/[entity].test.js`** — Study test patterns

---

## 🎯 GOLDEN RULES

1. **One responsibility per class**
2. **Inject dependencies; never instantiate inside handlers**
3. **Always throw typed errors; never catch silently**
4. **Always validate input at route boundary**
5. **Always use parameterized queries**
6. **Always return `null` for missing data (never `undefined`)**
7. **All config via environment variables**
8. **All database access through repositories**
9. **All business logic in services (not routes)**
10. **Tests = peace of mind**

---

This is your **North Star**. When in doubt, ask: "Which pattern does this follow?" 

The answer is in this card. 🎯
