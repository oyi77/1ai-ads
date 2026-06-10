# 1ai-ads Codebase Standards & Patterns Guide

## Executive Summary
This is an **enterprise-grade Node.js + JavaScript + Python** ads management platform with clear separation of concerns, strong typing discipline, and battle-tested patterns for handling multi-platform ads APIs (Meta, Google, TikTok, LinkedIn, Twitter, Pinterest, Snapchat, Microsoft).

---

## 1. SERVER ARCHITECTURE PATTERNS

### 1.1 Directory Structure
```
server/
├── app.js                      # Express app factory, middleware setup, error handlers
├── app/
│   ├── repositories.js         # Factory: initializes & wires all data repos
│   ├── services.js             # Factory: initializes & wires all business logic services
│   └── routers.js              # Factory: initializes all route handlers
├── config/
│   ├── index.js                # Config getter patterns (via env vars, no hardcoding)
│   └── prompts.js              # LLM system prompts library
├── lib/                        # Core utility library (12 modules)
│   ├── errors.js               # Typed error classes (ApiError, ValidationError, AuthError, PlatformError, etc.)
│   ├── auth.js                 # JWT generation, password hashing (bcryptjs)
│   ├── validate.js             # Schema-based validation helpers
│   ├── logger.js               # Structured logging factory
│   ├── api-response.js         # Standard response shapes (success, error, paginated)
│   ├── platform-client.js      # Abstraction for platform API calls (rate limiting, retries, error handling)
│   ├── base-platform-api.js    # Base class for all platform API clients (Meta, Google, TikTok, etc.)
│   ├── rate-limiter.js         # Token bucket rate limiter
│   ├── safe-parse.js           # Safe JSON parsing
│   ├── operators.js            # Rule evaluation operators
│   ├── escape.js               # SQL/HTML escaping
│   └── plan-check.js           # Feature availability checks
├── middleware/
│   └── auth.js                 # JWT verification middleware (Bearer token extraction)
├── routes/                     # Route handlers (48 files)
│   ├── auth.js                 # Login, register, OAuth (Facebook), token refresh
│   ├── campaigns.js            # Campaign CRUD, activation, metrics
│   ├── ads.js                  # Ad creative management
│   ├── meta-accounts.js        # Multi-account support, platform token resolution
│   ├── meta-ai.js              # Meta AI generative features
│   ├── google-ads.js           # Google Ads API routes
│   ├── tiktok-ads.js           # TikTok API routes
│   ├── [platform]-ads.js       # LinkedIn, Twitter, Snapchat, Pinterest, Microsoft routes
│   ├── webhooks.js             # Incoming webhooks (pixel, conversions, etc.)
│   ├── optimizer.js            # Autonomous optimization
│   ├── autonomous.js           # Autonomous agent control
│   ├── admin.js                # Admin endpoints
│   └── mcp.js                  # MCP (Model Context Protocol) integration
├── repositories/               # Data access layer (23 files)
│   ├── users.js
│   ├── campaigns.js
│   ├── ads.js
│   ├── settings.js
│   ├── platform-accounts.js    # Multi-account credential storage
│   ├── automation-rules.js
│   ├── [entity].js
│   └── ... (20+ more)
└── services/                   # Business logic layer (74 files)
    ├── meta-api.js             # Meta/Facebook Graph API adapter
    ├── google-ads-api.js
    ├── tiktok-api.js
    ├── campaign-orchestrator.js # AI-driven campaign creation flow
    ├── creative-studio.js       # Ad creative generation
    ├── ai-agent.js             # AI reasoning & recommendations
    ├── auto-optimizer.js       # Autonomous budget/bid optimization
    ├── llm-client.js           # LLM integration (Omniroute, AIPipeline)
    ├── content-scheduler.js    # Content scheduling
    ├── webhook-handler.js      # Webhook processing
    ├── [domain]-service.js
    └── ... (50+ more)
```

---

## 2. DEPENDENCY INJECTION & SERVICE INITIALIZATION

### 2.1 **Factory Pattern for Wiring**
```javascript
// server/app.js - Main app factory
export function createApp(params) {
  const db = params.db;
  
  // 1. Initialize all repositories (data layer)
  const repos = createRepositories(db);
  repos.db = db;
  
  // 2. Initialize all services (business logic layer)
  const services = createServices({ db, repos, params });
  
  // 3. Attach to app.locals for route access
  app.locals.campaignsRepo = repos.campaignsRepo;
  app.locals.adResearchService = services.adResearchService;
  
  // 4. Mount routers
  createRouters(app, repos, services);
  
  return app;
}
```

**Key principle:** No service instantiation inside route handlers. All dependencies are **injected via app.locals or constructor parameters**.

### 2.2 **Router Creation Pattern**
```javascript
// server/routes/campaigns.js
export function createCampaignsRouter(orchestrator, metaApi, creativeStudio, campaignsRepo) {
  const router = Router();
  
  router.post('/create', async (req, res) => {
    // Handler has all deps injected; no circular imports, no globals
  });
  
  return router;
}
```

---

## 3. ERROR HANDLING PATTERNS

### 3.1 **Typed Error Classes**
```javascript
// server/lib/errors.js
export class ApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'ApiError';
    this.status = status;  // HTTP status
  }
}

export class ValidationError extends ApiError {
  constructor(message) {
    super(message, 400);  // Always 400
    this.name = 'ValidationError';
  }
}

export class AuthError extends ApiError {
  constructor(message = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthError';
  }
}

export class PlatformError extends Error {
  constructor(message, platform, code = null) {
    super(message);
    this.name = 'PlatformError';
    this.platform = platform;  // 'meta', 'google', etc.
    this.code = code;          // API error code
  }
}

export class RateLimitError extends Error {
  constructor(message, retryAfter = null) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;  // Seconds to retry
  }
}
```

**Usage in services:**
```javascript
import { ValidationError, PlatformError } from '../lib/errors.js';

if (!data.name) {
  throw new ValidationError('name is required');
}

try {
  const res = await fetch(apiUrl);
} catch (err) {
  throw new PlatformError(err.message, 'meta', err.code);
}
```

### 3.2 **Express Error Handler**
All routes can throw errors; Express catches them:
```javascript
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ success: false, error: message });
});
```

**Pattern:** Always throw typed errors; never return error responses from try-catch.

---

## 4. AUTHENTICATION & TOKEN PATTERNS

### 4.1 **JWT Tokens**
```javascript
// server/lib/auth.js
const secret = config.jwtSecret;  // From .env, required
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

export function generateToken(payload, expiry = ACCESS_TOKEN_EXPIRY) {
  return jwt.sign(payload, secret, { expiresIn: expiry });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new Error('Token expired');
    throw new Error('Invalid token');
  }
}
```

### 4.2 **Middleware Pattern**
```javascript
// server/middleware/auth.js
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AuthError('Unauthorized');
  }
  
  try {
    const token = header.slice(7);
    req.user = verifyToken(token);  // { id, username, email, role }
    next();
  } catch {
    throw new AuthError('Invalid or expired token');
  }
}

// Usage in routes:
router.post('/protected-action', requireAuth, async (req, res) => {
  const userId = req.user.id;
  // handler code
});
```

---

## 5. VALIDATION PATTERNS

### 5.1 **Manual Validation**
```javascript
// server/lib/validate.js
export function validateRequired(data, fields) {
  for (const field of fields) {
    if (!data[field] && data[field] !== 0) {
      return { valid: false, error: `${field} is required` };
    }
  }
  return { valid: true };
}

export function validateEnum(value, allowed, fieldName) {
  if (!value) return { valid: true };
  if (!allowed.includes(value)) {
    return { valid: false, error: `${fieldName} must be one of: ${allowed.join(', ')}` };
  }
  return { valid: true };
}

// Usage:
const req = validateRequired(req.body, ['name', 'email']);
if (!req.valid) return res.status(400).json({ success: false, error: req.error });
```

**Note:** No Zod/Joi here — all validation is inline and procedural for now. Can be refactored.

---

## 6. REPOSITORY PATTERN (Data Layer)

### 6.1 **Standard Repository Class**
```javascript
// server/repositories/campaigns.js
import { v4 as uuid } from 'uuid';

export class CampaignsRepository {
  constructor(db) {
    this.db = db;  // better-sqlite3 connection
  }

  findAll({ platform } = {}) {
    if (platform) {
      const data = this.db.prepare('SELECT * FROM campaigns WHERE platform = ? ORDER BY created_at DESC').all(platform);
      return { data, total: data.length };
    }
    const data = this.db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
    return { data, total: data.length };
  }

  findById(id) {
    return this.db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) || null;
  }

  upsert(data) {
    const id = data.id || uuid();
    this.db.prepare(`
      INSERT OR REPLACE INTO campaigns (id, platform, campaign_id, name, status, budget, spend, impressions, clicks, conversions, roas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.platform, data.campaign_id, data.name, data.status, data.budget, data.spend, data.impressions, data.clicks, data.conversions, data.roas);
    return id;
  }

  update(id, data) {
    const existing = this.findById(id);
    if (!existing) return null;
    
    const fields = [];
    const params = [];
    for (const field of ['name', 'status', 'budget', 'spend']) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        params.push(data[field]);
      }
    }
    
    params.push(id);
    if (fields.length > 0) {
      this.db.prepare(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }
    return this.findById(id);
  }

  delete(id) {
    this.db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  }
}
```

**Key patterns:**
- **Constructor injection:** `db` passed in, never imported globally
- **UUID generation:** `uuid()` for primary keys
- **Null handling:** Return `null` for missing records, never undefined
- **Pagination:** `{ data, total }` objects for list queries
- **Upsert:** SQL `INSERT OR REPLACE` for idempotency
- **Update chaining:** Build `SET` clause dynamically

### 6.2 **Repository Factory**
```javascript
// server/app/repositories.js
export function createRepositories(db) {
  const platformAccountsRepo = new PlatformAccountsRepository(db);
  const settingsRepo = new SettingsRepository(db, platformAccountsRepo);
  
  return {
    usersRepo: new UsersRepository(db),
    campaignsRepo: new CampaignsRepository(db),
    adsRepo: new AdsRepository(db),
    settingsRepo,
    platformAccountsRepo,
    // ... 20+ more repos
  };
}
```

---

## 7. SERVICE LAYER PATTERNS (Business Logic)

### 7.1 **Platform API Base Class**
```javascript
// server/lib/base-platform-api.js
export class BasePlatformApiClient {
  constructor(platformName, settingsRepo = null, opts = {}) {
    this.platformName = platformName;      // 'meta', 'google', 'tiktok'
    this.settingsRepo = settingsRepo;      // For credential resolution
    this._explicitToken = null;            // Explicit token (multi-account support)
    this._activeAccountId = null;
    this._baseUrl = opts.baseUrl || '';
    this.log = createLogger(`${platformName}-api`);
  }

  _getToken() {
    // 1. Explicit token (set via setActiveAccount)
    if (this._explicitToken) return this._explicitToken;
    // 2. System token from .env (backward compat)
    if (config.fbSystemToken) return config.fbSystemToken;
    // 3. From platform_accounts table (new unified storage)
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials(this.platformName);
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError(`${this.platformName} token not configured`);
  }

  setActiveAccount(accountId, accessToken) {
    this._activeAccountId = accountId;
    this._explicitToken = accessToken;
  }

  async get(path, params = {}) {
    const token = this._getToken();
    const url = `${this._baseUrl}${path}`;
    const qs = new URLSearchParams({ ...params, access_token: token });
    return safeFetch(this.platformName, `${url}?${qs}`, { method: 'GET' });
  }

  async post(path, body) {
    const token = this._getToken();
    const url = `${this._baseUrl}${path}`;
    return safeFetch(this.platformName, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: token })
    });
  }
}
```

**Key principles:**
- **Token resolution chain:** explicit > env > database
- **Multi-account support:** `setActiveAccount()` for account switching
- **Subclass override:** Subclasses override `_getToken()` for platform-specific handling
- **Error propagation:** All errors thrown as `PlatformError` (platform, code, message)

### 7.2 **Meta Ads API Implementation**
```javascript
// server/services/meta-api.js
export class MetaAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepoOrToken) {
    const settingsRepo = typeof settingsRepoOrToken === 'string' ? null : settingsRepoOrToken;
    super('meta', settingsRepo, { baseUrl: `https://graph.facebook.com/v22.0` });
    if (typeof settingsRepoOrToken === 'string') {
      this._explicitToken = settingsRepoOrToken;
    }
  }

  static withToken(token) {
    return new MetaAdsAPI(token);  // Explicit token factory
  }

  _getToken() {
    // Meta-specific token resolution
    if (this._explicitToken) return this._explicitToken;
    if (config.fbSystemToken) return config.fbSystemToken;
    if (this.settingsRepo) {
      const creds = this.settingsRepo.getCredentials('meta');
      if (creds?.access_token) return creds.access_token;
    }
    throw new ConfigurationError('Meta access token not configured. Connect in Settings.');
  }

  async getCampaigns(accountId, params = {}) {
    const path = `/${accountId}/campaigns`;
    try {
      const res = await this.get(path, {
        fields: 'id,name,status,daily_budget,lifetime_budget,spend',
        ...params
      });
      return res.data || [];
    } catch (err) {
      throw new PlatformError(`Failed to fetch campaigns: ${err.message}`, 'meta', err.code);
    }
  }

  async createCampaign(accountId, data) {
    try {
      return await this.post(`/${accountId}/campaigns`, data);
    } catch (err) {
      throw new PlatformError(`Campaign creation failed: ${err.message}`, 'meta', err.code);
    }
  }
}
```

### 7.3 **Orchestrator Pattern**
```javascript
// server/services/campaign-orchestrator.js
export class CampaignOrchestrator {
  constructor(metaApi, creativeStudio) {
    this.meta = metaApi;
    this.creative = creativeStudio;
  }

  async createFullCampaign({ accountId, pageId, product, objective, dailyBudget, landingUrl }) {
    const result = { steps: [], campaignId: null, adsetId: null, creativeId: null };

    // Step 1: AI-generate creative
    const aiResult = await this.creative.generate({ product, objective });
    const bestAd = aiResult.ads[0];

    // Step 2: Create campaign
    const campaign = await this._runAndAssign(result.steps, 'create_campaign', result, 'campaignId', 
      () => this.meta.createCampaign(accountId, { 
        name: `${product} - ${objective} - ${new Date().toISOString().split('T')[0]}`,
        objective,
        status: 'PAUSED'  // Always paused initially
      })
    );

    // Step 3: Create adset
    const adset = await this._runAndAssign(result.steps, 'create_adset', result, 'adsetId',
      () => this.meta.createAdSet(accountId, campaign.id, {
        name: `${product} Adset`,
        daily_budget: dailyBudget * 100,  // cents
        targeting: { locations: [2840] }  // Indonesia
      })
    );

    // Step 4: Create creative
    const creative = await this._runAndAssign(result.steps, 'create_creative', result, 'creativeId',
      () => this.meta.createAdCreative(accountId, {
        name: `${product} Creative`,
        pageId,
        message: `${bestAd.hook}\n\n${bestAd.body}`,
        headline: bestAd.cta,
        linkUrl: landingUrl || 'https://example.com'
      })
    );

    // Step 5: Create ad
    const ad = await this._runAndAssign(result.steps, 'create_ad', result, 'adId',
      () => this.meta.createAd(accountId, adset.id, {
        name: `${product} Ad`,
        creative: { creative_id: creative.id }
      })
    );

    return { success: true, ...result };
  }

  async _runAndAssign(steps, name, result, key, fn) {
    try {
      const data = await fn();
      steps.push({ step: name, status: 'success', id: data.id });
      result[key] = data.id;
      return data;
    } catch (err) {
      steps.push({ step: name, status: 'error', error: err.message });
      throw err;  // Propagate to caller for cleanup
    }
  }
}
```

---

## 8. ROUTE HANDLER PATTERNS

### 8.1 **Standard Route Structure**
```javascript
// server/routes/campaigns.js
import { Router } from 'express';

export function createCampaignsRouter(orchestrator, metaApi, campaignsRepo) {
  const router = Router();

  // POST /api/campaigns/create
  router.post('/create', async (req, res) => {
    const { accountId, pageId, product, objective, dailyBudget, landingUrl } = req.body;

    // 1. Validate input
    if (!accountId || !product || !dailyBudget) {
      return res.status(400).json({ 
        success: false, 
        error: 'accountId, product, and dailyBudget are required' 
      });
    }

    try {
      // 2. Call service
      const result = await orchestrator.createFullCampaign({
        accountId, pageId, product, objective, dailyBudget, landingUrl
      });

      // 3. Persist to local DB
      if (result.campaignId) {
        campaignsRepo.upsert({
          platform: 'meta',
          campaign_id: result.campaignId,
          name: `${product} - ${objective}`,
          status: 'paused',
          budget: dailyBudget
        });
      }

      // 4. Return success response
      res.json({ success: true, data: result });
    } catch (err) {
      // 5. Error handling (explicit, not silent)
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
```

**Key patterns:**
- **Factory function:** Routes exported as factory that accepts injected deps
- **Validation first:** Check required fields at top
- **Service call:** Single service method per handler (no god functions)
- **Persistence:** Save to local DB for auditing
- **Response shape:** Always `{ success: boolean, data?: any, error?: string }`
- **Error handling:** Explicit try-catch, no silent failures

### 8.2 **Standard Response Shapes**
```javascript
// server/lib/api-response.js
export function success(data = null) {
  return { success: true, data };
}

export function error(message, status = 400) {
  return { success: false, error: message, status };
}

export function paginated(data, page, total, perPage = 20) {
  return {
    success: true,
    data,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage)
    }
  };
}
```

---

## 9. LOGGING PATTERNS

### 9.1 **Logger Factory**
```javascript
// server/lib/logger.js
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[config.logLevel] || LOG_LEVELS.info;

export function createLogger(module) {
  return {
    info: (msg, meta) => { 
      if (currentLevel >= LOG_LEVELS.info) 
        console.log(`[INFO] [${module}] ${msg}`, meta); 
    },
    warn: (msg, meta) => { 
      if (currentLevel >= LOG_LEVELS.warn) 
        console.error(`[WARN] [${module}] ${msg}`, meta); 
    },
    error: (msg, meta) => { 
      if (currentLevel >= LOG_LEVELS.error) 
        console.error(`[ERROR] [${module}] ${msg}`, meta); 
    },
    debug: (msg, meta) => { 
      if (currentLevel >= LOG_LEVELS.debug) 
        console.log(`[DEBUG] [${module}] ${msg}`, meta); 
    }
  };
}
```

**Usage:**
```javascript
const log = createLogger('campaign-orchestrator');

log.info('Campaign creation started', { accountId, product });
log.error('Campaign creation failed', { error: err.message, code: err.code });
```

---

## 10. CONFIGURATION PATTERNS

### 10.1 **Getters-Based Config**
```javascript
// server/config/index.js
const config = {
  get port() { return parseInt(process.env.PORT || '5000', 10); },
  get dbPath() { return process.env.DB_PATH || './db/1ai-ads.db'; },
  get corsOrigin() { return process.env.CORS_ORIGIN || 'http://localhost:5173'; },
  get jwtSecret() { return process.env.JWT_SECRET || ''; },
  get nodeEnv() { return process.env.NODE_ENV || 'development'; },
  get metaApiVersion() { return 'v22.0'; },
  get fbSystemToken() { return process.env.FB_SYSTEM_TOKEN || ''; },
  get llm() {
    return {
      url: process.env.OMNIROUTE_URL || 'http://localhost:20128/v1/chat/completions',
      model: process.env.OMNIROUTE_MODEL || 'auto/pro-fast',
      apiKey: process.env.OMNIROUTE_API_KEY || '',
      timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10)
    };
  },
  get logLevel() { return process.env.LOG_LEVEL || 'info'; }
};

export function validateConfig() {
  if (!config.jwtSecret && config.nodeEnv !== 'test') {
    throw new Error('FATAL: JWT_SECRET required. Set in .env before starting.');
  }
}

export default config;
```

**Patterns:**
- **Getters:** Lazy evaluation, config can be hot-reloaded
- **Env-first:** No defaults for secrets; throw on missing
- **Validation:** Explicit `validateConfig()` at startup
- **Nested objects:** Grouped configs (llm, db, etc.)

---

## 11. DATABASE PATTERNS

### 11.1 **SQLite Setup**
```javascript
// db/index.js
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';

export function createDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');  // Write-Ahead Logging for concurrency
  
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);  // Run all DDL at once
  
  runMigrations(db);  // Run versioned migrations
  
  return db;
}
```

**Key settings:**
- **WAL mode:** `pragma('journal_mode = WAL')` for concurrency
- **Schema-first:** All tables defined in `schema.sql`
- **Migrations:** Versioned in `db/migrations/` for upgrades

### 11.2 **Repository Initialization**
```javascript
// server/app/repositories.js
export function createRepositories(db) {
  const scheduleRepo = new ScheduleRepository(db);
  scheduleRepo.ensureTable();  // Some repos create their own tables on demand
  
  return {
    campaignsRepo: new CampaignsRepository(db),
    adsRepo: new AdsRepository(db),
    usersRepo: new UsersRepository(db),
    settingsRepo: new SettingsRepository(db, platformAccountsRepo),
    // ... wired in dependency order
  };
}
```

---

## 12. TESTING PATTERNS

### 12.1 **Test Setup**
```javascript
// tests/unit/repositories/settings.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../../db/index.js';
import { SettingsRepository } from '../../../server/repositories/settings.js';

describe('SettingsRepository', () => {
  let db, repo;

  beforeEach(() => {
    db = createDatabase(':memory:');  // Fresh in-memory DB per test
    repo = new SettingsRepository(db);
  });

  describe('get', () => {
    it('returns null for missing key', () => {
      const value = repo.get('nonexistent_key');
      expect(value).toBeNull();
    });

    it('returns string value for string setting', () => {
      repo.set('string_key', 'hello world');
      const value = repo.get('string_key');
      expect(value).toBe('hello world');
    });

    it('returns parsed JSON for JSON setting', () => {
      const obj = { name: 'test', value: 123 };
      repo.set('json_key', obj);
      const value = repo.get('json_key');
      expect(value).toEqual(obj);
    });
  });
});
```

**Vitest config:**
```javascript
// vitest.config.js
export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-key-for-testing'
    },
    exclude: ['tests/e2e/**', 'node_modules/**'],
    server: {
      deps: {
        externals: ['better-sqlite3']
      }
    }
  }
});
```

**Test patterns:**
- **In-memory DB:** `:memory:` for fast isolation
- **Arrange-Act-Assert:** Clear test structure
- **Descriptive names:** `should_return_null_when_key_missing` (behavior-focused)
- **Globals:** Vitest auto-imports `describe`, `it`, `expect`

---

## 13. CLIENT-SIDE PATTERNS

### 13.1 **API Client**
```javascript
// client/src/lib/api.js
const LS = {
  TOKEN: '1ai-ads_token',
  REFRESH: '1ai-ads_refresh_token',
  USER: '1ai-ads_user'
};

async function request(method, path, body, isRetry = false) {
  const headers = { 'Content-Type': 'application/json' };
  
  const token = localStorage.getItem(LS.TOKEN);
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(`/api${path}`, opts);
  
  // Auto-refresh on 401
  if (res.status === 401 && !isRetry && !path.includes('/auth/')) {
    const refreshed = await api.refreshToken();
    if (refreshed) {
      return request(method, path, body, true);
    }
  }
  
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
  
  async login(username, password) {
    const res = await request('POST', '/auth/login', { username, password });
    localStorage.setItem(LS.TOKEN, res.data.accessToken);
    localStorage.setItem(LS.REFRESH, res.data.refreshToken);
    localStorage.setItem(LS.USER, JSON.stringify(res.data.user));
    return res.data;
  },
  
  isAuthenticated() {
    return !!localStorage.getItem(LS.TOKEN);
  }
};
```

**Patterns:**
- **Token in localStorage:** `Authorization: Bearer <token>`
- **Auto-refresh:** 401 triggers refresh, then retry
- **Standard response parsing:** Throws on `success: false`

### 13.2 **Router (Hash-Based)**
```javascript
// client/src/lib/router.js
export class Router {
  constructor(container) {
    this.container = container;
    this.routes = {};
  }

  on(path, handler) {
    this.routes[path] = handler;
  }

  navigate(path) {
    window.location.hash = '#' + path;
  }

  resolve() {
    const hash = window.location.hash.slice(1) || '/';

    // Auth guard
    if (!api.isAuthenticated() && !PUBLIC_ROUTES.has(hash)) {
      window.location.hash = '#/login';
      return;
    }

    // Redirect authenticated users away from login
    if (api.isAuthenticated() && hash === '/login') {
      window.location.hash = '#/';
      return;
    }

    const handler = this.routes[hash] || this.routes['/'];
    if (handler) {
      Promise.resolve(handler(this.container))
        .catch(err => {
          this.container.innerHTML = `<div>Error: ${err.message}</div>`;
        });
    }
  }

  start() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  }
}
```

### 13.3 **View Components**
```javascript
// client/src/views/campaigns-list.js
import { api } from '../lib/api.js';
import { renderCampaignsList } from '../components/campaigns.js';

export async function renderCampaignsListView(container) {
  try {
    const res = await api.get('/campaigns');
    const html = renderCampaignsList(res.data);
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div>Error: ${err.message}</div>`;
  }
}
```

**Patterns:**
- **Hash routing:** `#/path` for SPA navigation
- **Vanilla JS:** No React, Vue, or framework overhead
- **Promise-based handlers:** Views can be async
- **Error boundaries:** Each view handles own errors

---

## 14. PYTHON SCRIPTS PATTERNS

### 14.1 **Token Management**
```python
# scripts/check_token.py
import os
import json

env_path = '/home/openclaw/projects/1ai-ads/.env'
token = ''

with open(env_path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        if k.strip() == 'META_ACCESS_TOKEN':
            token = v.strip().strip('"').strip("'")
            break

print(f'token_len={len(token)}')
print(f'token_prefix={token[:12]}')
print(f'token_suffix={token[-8:]}')
```

**Patterns:**
- **Manual .env parsing:** No dotenv library in scripts
- **Token validation:** Check prefix/suffix, not full token in logs
- **Explicit error handling:** No silent failures

### 14.2 **Meta API Calls**
```python
# scripts/activate_0858_0400.py
import urllib.request
import json

API = 'https://graph.facebook.com/v22.0'
ACCT = 'act_435670549443081'

def api_post(url_suffix, data):
    url = f'{API}/{url_suffix}'
    data['access_token'] = token
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'}
    )
    try:
        return json.loads(urllib.request.urlopen(req, timeout=15).read())
    except urllib.error.HTTPError as e:
        return {'error': True, 'code': e.code, 'msg': e.read().decode()[:200]}

# Get campaigns
camps = api_get(f'{ACCT}/campaigns?fields=name,id,daily_budget,status&limit=50')
for c in camps.get('data', []):
    if '_Winning_' in c['name']:
        # Process winning campaigns
        pass
```

**Patterns:**
- **Direct urllib:** No requests library
- **Explicit timeout:** 15s for API calls
- **Error capture:** HTTPError parsed, not raised
- **Batch operations:** Loop over campaign lists

---

## 15. MCP (Model Context Protocol) PATTERNS

### 15.1 **MCP Server Initialization**
```javascript
// mcp.js
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase } from './db/index.js';
import { createRepositories } from './server/app/repositories.js';
import { create1aiAdsMCPServer } from './server/services/mcp-server.js';

const db = createDatabase(process.env.DB_PATH || './db/adforge.db');
const repos = createRepositories(db);

// Initialize services
const llmClient = new LLMClient();
const adGenerator = new AdGenerator(llmClient);
const creativeStudio = new CreativeStudio(llmClient);

// Create MCP server with all services
const server = create1aiAdsMCPServer(
  repos.campaignsRepo,
  repos.landingRepo,
  adGenerator,
  creativeStudio,
  llmClient
);

// Start via stdio
const transport = new StdioServerTransport();
server.connect(transport);
```

---

## 16. CODING STANDARDS CHECKLIST

### **REQUIRED PATTERNS**

✅ **Imports**
- Use ES6 `import { x } from 'y'` (not CommonJS `require()`)
- Always use relative paths for local modules: `import { X } from '../lib/x.js'`
- Config imported as: `import config from '../config/index.js'`

✅ **Errors**
- Always throw typed errors (not generic `Error`)
- Never catch and swallow errors silently
- All errors logged with context: `log.error(msg, { error: err.message, context })`

✅ **Logging**
- All services: `const log = createLogger('module-name');`
- Log at key points: API calls, errors, business logic decisions
- Include metadata: `log.info('msg', { userId, accountId })`

✅ **Validation**
- All user input validated at route boundary
- Return `{ valid: false, error: 'message' }` objects
- Never trust `req.body` — always validate shape and type

✅ **Database**
- All DB operations in repositories, never in services
- Use parameterized queries: `.prepare('... WHERE id = ?').run(id)`
- Return `null` for missing records, never `undefined`
- Use `uuid()` for primary keys

✅ **Services**
- Single responsibility: one service = one domain
- No direct repository imports; inject via constructor
- All async operations must have try-catch
- Throw typed errors; let caller handle

✅ **Routes**
- Factory function pattern: `export function create*Router(...deps) { return router; }`
- Validation → service call → persistence → response
- Never directly query DB in routes
- Always return `{ success: boolean, data?, error? }`

✅ **Configuration**
- All secrets and URLs via environment variables
- No hardcoded tokens, domains, or credentials
- Config object with getters, not constants
- Validate critical config at startup

✅ **Testing**
- Every public function/method has a test
- Tests use in-memory DB (`:memory:`)
- Test names describe behavior: `should_return_null_when_key_missing`
- Use Arrange-Act-Assert pattern

---

## 17. ANTI-PATTERNS (NEVER DO THIS)

❌ **NEVER**
- Instantiate services inside route handlers
- Query DB directly from service layer
- Catch errors without logging
- Use generic `Error` class (always throw typed errors)
- Hardcode secrets, tokens, or URLs
- Use `any` type in comments/code
- Comment explaining WHAT (code is clear); comment WHY decisions
- Copy-paste large code blocks
- Create circular imports
- Return promise-less async code
- Ignore HTTP status codes
- Use `||` for config defaults; throw on missing secrets
- Reach into other modules' internals (private methods)
- God functions > 30 lines
- Functions with > 3 parameters (use object param)
- Async operations without timeout

---

## 18. QUICK REFERENCE: "THE PROPER WAY"

### **To add a new API endpoint:**
1. Create route in `server/routes/[domain].js` as factory function
2. Inject all dependencies via parameters
3. Validate input at top
4. Call injected service method
5. Persist if needed (repository)
6. Return `{ success: true, data }`

### **To add a new service:**
1. Create `server/services/[service].js`
2. Inject repos/services via constructor
3. No direct DB access; use repos
4. Throw typed errors; don't catch & swallow
5. Log at key points
6. Export as class or factory

### **To add a new repository:**
1. Create `server/repositories/[entity].js`
2. Accept `db` in constructor
3. Use parameterized queries
4. Return `null` for missing, not `undefined`
5. Use `uuid()` for IDs
6. Register in `server/app/repositories.js`

### **To connect a new platform API:**
1. Create `server/services/[platform]-api.js` extending `BasePlatformApiClient`
2. Override `_getToken()` for platform-specific token resolution
3. Implement domain methods: `getCampaigns()`, `createCampaign()`, etc.
4. Throw `PlatformError` on API failures
5. Use `safeFetch()` for HTTP with built-in retries & rate limiting

### **To add authentication to a route:**
1. Import `requireAuth` from `server/middleware/auth.js`
2. Add as middleware: `router.post('/protected', requireAuth, handler)`
3. Access user via `req.user` (already verified)
4. Throw `AuthError` if additional checks fail

---

## 19. SUMMARY: ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (client/)                    │
│  Hash Router → Views → Components → API Client              │
│  (localStorage for token persistence)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP/JSON
┌──────────────────▼──────────────────────────────────────────┐
│                   EXPRESS ROUTES                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Route Handlers (48 files)                            │   │
│  │ - Validation → Service → Repo → Response             │   │
│  │ - Error handling → Typed exceptions                  │   │
│  └──────────────────┬──────────────────────────────────┘   │
└─────────────────────┼──────────────────────────────────────┘
                      │
    ┌─────────────────┴──────────────────┐
    │                                    │
┌───▼─────────────────┐    ┌────────────▼────────┐
│  SERVICES (74 files)│    │  REPOSITORIES (23)  │
│  - Business logic   │    │  - Data access      │
│  - Orchestration    │    │  - SQL queries      │
│  - AI integration   │    │  - Entity CRUD      │
│  - Validation       │    │  - Transactions     │
│  - Error handling   │    │  - Null handling    │
└─────┬───────────────┘    └──────────┬──────────┘
      │                               │
      │  ┌───────────────────────────┘
      │  │
      └──▼────────────────────────────────────────┐
         │                                        │
    ┌────▼──────────────┐    ┌──────────────────┐│
    │ LIB (12 utilities)│    │  SQLITE3 Database ││
    │ - Errors          │    │  - WAL mode       ││
    │ - Auth/JWT        │    │  - Schema         ││
    │ - Logging         │    │  - Migrations     ││
    │ - Validation      │    │  - Repos use this ││
    │ - API response    │    │                   ││
    │ - Platform client │    │                   ││
    │ - Rate limiting   │    │                   ││
    │ - Base API class  │    │                   ││
    └───────────────────┘    └───────────────────┘
```

---

This is your **"proper way to code in 1ai-ads"**. Follow these patterns, and your code will be production-ready, testable, and maintainable.

