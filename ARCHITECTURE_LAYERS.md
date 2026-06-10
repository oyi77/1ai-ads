# 1ai-ads: Architecture Layer Diagrams

## 1. REQUEST-RESPONSE FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (Vanilla JS SPA)                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Views (rendered as HTML strings)                        │   │
│  │  - renderCampaignsList() → <html>                       │   │
│  │  - renderAdsCreate() → <form>                           │   │
│  └──────────────────┬──────────────────────────────────────┘   │
│                     │                                            │
│  ┌──────────────────▼──────────────────────────────────────┐   │
│  │ Router (lib/router.js)                                  │   │
│  │  - Hash-based routing: #/campaigns, #/ads, #/settings  │   │
│  │  - Auth guard: redirect unauthenticated → #/login       │   │
│  │  - Calls view handler on route match                    │   │
│  └──────────────────┬──────────────────────────────────────┘   │
│                     │                                            │
│  ┌──────────────────▼──────────────────────────────────────┐   │
│  │ API Client (lib/api.js)                                 │   │
│  │  - request(method, path, body)                          │   │
│  │  - Auto-refresh on 401                                  │   │
│  │  - Reads token from localStorage                        │   │
│  └──────────────────┬──────────────────────────────────────┘   │
│                     │                                            │
│                     └─── localStorage (token, user)             │
│                                                                  │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTP/JSON
                       │ Authorization: Bearer <token>
        ┌──────────────▼─────────────────────┐
        │ Express Server (PORT 5000)          │
        │                                     │
        │ Trust proxy for Cloudflare/nginx    │
        │ Security headers (CSP, HSTS, etc.)  │
        │ CORS configured                     │
        └──────────────┬──────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────────────┐
        │ MIDDLEWARE STACK                                     │
        │  1. Security headers                                 │
        │  2. CORS                                             │
        │  3. Body parser (JSON)                               │
        │  4. Rate limiter (global)                            │
        │  5. Auth guard (requireAuth middleware)              │
        │     - Extracts Bearer token from header              │
        │     - Verifies JWT signature                         │
        │     - Attaches req.user { id, email, role }          │
        │     - Returns 401 on failure                         │
        └──────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────────────┐
        │ ROUTE HANDLERS (48 files in server/routes/)          │
        │                                                      │
        │ POST /api/campaigns/create                           │
        │  ├─ Validate: accountId, product, dailyBudget       │
        │  ├─ Call: orchestrator.createFullCampaign()          │
        │  ├─ Persist: campaignsRepo.upsert()                  │
        │  └─ Return: { success: true, data: result }          │
        │                                                      │
        │ All routes follow factory pattern:                   │
        │  export function createXRouter(service, repo) { ... }│
        │  Injected via app.use('/api/x', createXRouter(...))  │
        └──────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────────────┐
        │ SERVICES (74 files in server/services/)              │
        │                                                      │
        │ class CampaignOrchestrator {                         │
        │   constructor(metaApi, creativeStudio) { ... }       │
        │   async createFullCampaign({ ... }) {                │
        │     1. AI generate creatives                         │
        │     2. Create campaign                               │
        │     3. Create adset                                  │
        │     4. Create creative                               │
        │     5. Create ad                                     │
        │     6. Return result with all IDs                    │
        │   }                                                  │
        │ }                                                    │
        │                                                      │
        │ Features:                                            │
        │  - Single responsibility                             │
        │  - Dependencies injected                             │
        │  - Throw typed errors                                │
        │  - All errors logged                                 │
        │  - No DB access (use repos)                          │
        │  - Async with try-catch                              │
        └──────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────────────┐
        │ REPOSITORIES (23 files in server/repositories/)      │
        │                                                      │
        │ class CampaignsRepository {                          │
        │   constructor(db) { this.db = db; }                  │
        │                                                      │
        │   findAll({ platform } = {}) {                       │
        │     const data = db.prepare(...)                     │
        │       .all(platform);                                │
        │     return { data, total: data.length };             │
        │   }                                                  │
        │                                                      │
        │   findById(id) {                                     │
        │     return db.prepare(...)                           │
        │       .get(id) || null;  // ← null, not undefined    │
        │   }                                                  │
        │                                                      │
        │   create(data) {                                     │
        │     const id = uuid();                               │
        │     db.prepare(INSERT ...).run(...);                 │
        │     return id;                                       │
        │   }                                                  │
        │ }                                                    │
        │                                                      │
        │ Features:                                            │
        │  - Single table/entity per repo                      │
        │  - Parameterized queries (no SQL injection)          │
        │  - Return null for missing (never undefined)         │
        │  - UUID for primary keys                             │
        │  - Dynamic UPDATE SET clause                         │
        └──────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────────────┐
        │ SQLITE3 DATABASE (db/adforge.db)                     │
        │                                                      │
        │ ┌──────────────────────────────────────────────┐    │
        │ │ Table: campaigns                             │    │
        │ │ - id (UUID)                                  │    │
        │ │ - platform ('meta', 'google', 'tiktok')     │    │
        │ │ - campaign_id (platform-specific ID)        │    │
        │ │ - name, status, budget, spend               │    │
        │ │ - impressions, clicks, conversions, roas     │    │
        │ │ - created_at, last_synced                    │    │
        │ └──────────────────────────────────────────────┘    │
        │                                                      │
        │ ┌──────────────────────────────────────────────┐    │
        │ │ Table: ads                                   │    │
        │ │ - id, platform, format, hook, body, cta      │    │
        │ │ - design (JSON), status, created_at          │    │
        │ └──────────────────────────────────────────────┘    │
        │                                                      │
        │ ┌──────────────────────────────────────────────┐    │
        │ │ Table: settings (key-value store)            │    │
        │ │ - key, value (string or JSON)                │    │
        │ │ - Used for credentials, configs              │    │
        │ └──────────────────────────────────────────────┘    │
        │                                                      │
        │ ┌──────────────────────────────────────────────┐    │
        │ │ Table: users                                 │    │
        │ │ - id, username, email, password_hash         │    │
        │ │ - role, plan, is_active, last_login          │    │
        │ └──────────────────────────────────────────────┘    │
        │                                                      │
        │ ┌──────────────────────────────────────────────┐    │
        │ │ + 16 more tables (ads, landing_pages, etc.)  │    │
        │ └──────────────────────────────────────────────┘    │
        │                                                      │
        │ Features:                                            │
        │  - WAL mode (Write-Ahead Logging)                   │
        │  - Schema-first (DDL in schema.sql)                 │
        │  - Migrations versioned in db/migrations/           │
        │  - Prepared statements (better-sqlite3)             │
        └──────────────────────────────────────────────────────┘
```

---

## 2. DEPENDENCY INJECTION GRAPH

```
┌─────────────────────────────────────────────────────────────┐
│ server.js (entry point)                                     │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────▼─────────────┐
        │ createDatabase()        │
        │ - Load schema.sql       │
        │ - Enable WAL mode       │
        │ - Run migrations        │
        │ - Return db             │
        └──────────────┬──────────┘
                       │ db
        ┌──────────────▼─────────────────────────┐
        │ createRepositories(db)                 │
        │ (server/app/repositories.js)           │
        │                                        │
        │ return {                               │
        │   usersRepo: new UsersRepository(db)   │
        │   campaignsRepo: new CampaignsRepo(db) │
        │   adsRepo: new AdsRepository(db)       │
        │   settingsRepo: ...                    │
        │   ... (23 total)                       │
        │ }                                      │
        └──────────────┬──────────────────────────┘
                       │ repos
        ┌──────────────▼──────────────────────────────┐
        │ createServices({ db, repos, params })       │
        │ (server/app/services.js)                    │
        │                                             │
        │ return {                                    │
        │   llmClient: new LLMClient()                │
        │   metaApi: new MetaAdsAPI(settingsRepo)     │
        │   creativeStudio: new CreativeStudio()      │
        │   orchestrator: new CampaignOrchestrator()  │
        │   ... (74 total)                            │
        │ }                                           │
        └──────────────┬──────────────────────────────┘
                       │ services, repos
        ┌──────────────▼──────────────────────────────┐
        │ createApp({ db, repos, services })         │
        │ (server/app.js)                            │
        │                                             │
        │ app = express()                             │
        │ app.use(middleware)                         │
        │ app.locals.campaignsRepo = repos.campaigns  │
        │ app.locals.adResearchService = ...          │
        │                                             │
        │ Middleware Stack:                           │
        │  1. Security headers                        │
        │  2. CORS                                    │
        │  3. Body parser                             │
        │  4. Trust proxy                             │
        │  5. Rate limiter                            │
        │  6. Error handler (bottom)                  │
        │                                             │
        │ return app                                  │
        └──────────────┬──────────────────────────────┘
                       │ app
        ┌──────────────▼──────────────────────────────┐
        │ createRouters(app, repos, services)        │
        │ (server/app/routers.js)                    │
        │                                             │
        │ app.use('/api/campaigns',                  │
        │   createCampaignsRouter(                    │
        │     services.orchestrator,                 │
        │     services.metaApi,                      │
        │     repos.campaignsRepo                    │
        │   )                                        │
        │ )                                          │
        │                                             │
        │ ... wires all 48 route handlers             │
        └──────────────┬──────────────────────────────┘
                       │ app
        ┌──────────────▼──────────────────────────────┐
        │ app.listen(PORT, '0.0.0.0')                │
        │                                             │
        │ Server running! 🚀                          │
        └──────────────────────────────────────────────┘
```

---

## 3. ERROR HANDLING FLOW

```
┌─────────────────────────────────────────────────────┐
│ Route Handler                                       │
│                                                     │
│ try {                                               │
│   const result = await service.doSomething();      │
│   res.json({ success: true, data: result });       │
└──────────────────┬──────────────────────────────────┘
                   │ (if no error, sent to client)
                   │
    ┌──────────────▼──────────────────────────┐
    │ Service.doSomething()                   │
    │                                         │
    │ if (!data.name) {                       │
    │   throw new ValidationError(            │
    │     'name is required'                  │
    │   );                                    │
    │ }                                       │
    │                                         │
    │ try {                                   │
    │   return await api.fetch(...);          │
    │ } catch (err) {                         │
    │   log.error('API call failed', {        │
    │     error: err.message,                 │
    │     code: err.code                      │
    │   });                                   │
    │   throw new PlatformError(              │
    │     err.message,                        │
    │     'meta',                             │
    │     err.code                           │
    │   );                                    │
    │ }                                       │
    └──────────────┬──────────────────────────┘
                   │ (throws typed error)
    ┌──────────────▼──────────────────────────┐
    │ Route Handler Catch Block               │
    │                                         │
    │ } catch (err) {                         │
    │   const status = err.status || 500;     │
    │   const message = err.message;          │
    │   res.status(status).json({             │
    │     success: false,                     │
    │     error: message                      │
    │   });                                   │
    │ }                                       │
    └──────────────┬──────────────────────────┘
                   │
    ┌──────────────▼──────────────────────────┐
    │ Express Error Handler Middleware        │
    │ (only if error propagates)              │
    │                                         │
    │ app.use((err, req, res, next) => {      │
    │   const status = err.status || 500;     │
    │   res.status(status).json({             │
    │     success: false,                     │
    │     error: err.message                  │
    │   });                                   │
    │ });                                     │
    └──────────────┬──────────────────────────┘
                   │
                   ▼
            Client receives:
            
            ┌─────────────────────────┐
            │ {                       │
            │   success: false,       │
            │   error: "name is ..." │
            │ }                       │
            │                         │
            │ HTTP 400                │
            │ (or 401, 404, 500)      │
            └─────────────────────────┘
```

**Error Class Hierarchy:**
```
Error (built-in)
├── ApiError (extends Error)
│   ├── ValidationError (400)
│   ├── AuthError (401)
│   ├── NotFoundError (404)
│   └── ConfigurationError (500)
│
├── PlatformError (meta, google, code)
│
└── RateLimitError (retryAfter field)
```

---

## 4. AUTHENTICATION & TOKEN FLOW

```
┌────────────────────────────────────────────────────────────┐
│ CLIENT                                                     │
│                                                            │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Login Form: username, password                       │ │
│ │ ↓                                                    │ │
│ │ api.login(username, password)                       │ │
│ │   ├─ POST /api/auth/login                           │ │
│ │   ├─ Receive: {                                     │ │
│ │   │   accessToken: "eyJhb...",                      │ │
│ │   │   refreshToken: "eyJho...",                     │ │
│ │   │   user: { id, username, email }                │ │
│ │   }                                                 │ │
│ │   └─ Store in localStorage:                         │ │
│ │       - 1ai-ads_token (accessToken)                 │ │
│ │       - 1ai-ads_refresh_token (refreshToken)        │ │
│ │       - 1ai-ads_user (JSON)                         │ │
│ └──────────────────┬───────────────────────────────────┘ │
└─────────────────────┼──────────────────────────────────────┘
                      │
         ┌────────────▼────────────┐
         │ Authenticated Request   │
         │                        │
         │ GET /api/campaigns     │
         │ Headers: {             │
         │   Authorization:       │
         │   Bearer <token>       │
         │ }                      │
         └────────────┬───────────┘
                      │
┌─────────────────────▼──────────────────────────────────┐
│ SERVER                                                 │
│                                                        │
│ ┌─────────────────────────────────────────────────┐  │
│ │ requireAuth Middleware                          │  │
│ │                                                 │  │
│ │ const header = req.headers.authorization;       │  │
│ │ if (!header.startsWith('Bearer ')) {            │  │
│ │   throw new AuthError('Unauthorized');          │  │
│ │ }                                               │  │
│ │                                                 │  │
│ │ const token = header.slice(7);                  │  │
│ │ const decoded = verifyToken(token);             │  │
│ │                                                 │  │
│ │ if (decoded.exp < Date.now() / 1000) {          │  │
│ │   throw new AuthError('Token expired');         │  │
│ │ }                                               │  │
│ │                                                 │  │
│ │ req.user = decoded;  // { id, username, ... }   │  │
│ │ next();                                         │  │
│ └────────────┬────────────────────────────────────┘  │
│              │                                        │
│ ┌────────────▼────────────────────────────────────┐  │
│ │ Route Handler                                   │  │
│ │                                                 │  │
│ │ router.get('/campaigns', requireAuth, handler)  │  │
│ │                                                 │  │
│ │ const userId = req.user.id;  // ← Populated    │  │
│ │ const campaigns = campaignsRepo               │  │
│ │   .findByUserId(userId);                      │  │
│ │                                                 │  │
│ │ res.json({ success: true, data: campaigns });   │  │
│ └────────────┬────────────────────────────────────┘  │
└─────────────────────┼────────────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────────────┐
│ CLIENT                                                 │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Response: { success: true, data: [...] }        │ │
│ │                                                  │ │
│ │ (If 401 received, auto-refresh)                 │ │
│ │                                                  │ │
│ │ POST /api/auth/refresh                          │ │
│ │ Body: { refreshToken: "..." }                   │ │
│ │ ↓                                                │ │
│ │ Receive new accessToken                         │ │
│ │ Store in localStorage                           │ │
│ │ Retry original request with new token           │ │
│ └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## 5. MULTI-ACCOUNT PLATFORM API FLOW

```
┌──────────────────────────────────────────────────────┐
│ Route Handler: POST /api/campaigns/create            │
│                                                      │
│ const { accountId, token } = req.body;               │
│                                                      │
│ metaApi.setActiveAccount(accountId, token);          │
│ ↓                                                    │
│ const campaign = await metaApi                       │
│   .createCampaign(accountId, {...});                 │
└──────────────────┬───────────────────────────────────┘
                   │
        ┌──────────▼─────────────────────────────────┐
        │ MetaAdsAPI.createCampaign()                │
        │                                            │
        │ const token = this._getToken();            │
        │                                            │
        │ // Token resolution chain:                 │
        │ // 1. this._explicitToken (from           │
        │ //    setActiveAccount)                    │
        │ // 2. config.fbSystemToken (from .env)     │
        │ // 3. settingsRepo.getCredentials('meta')  │
        │ //    (from platform_accounts table)       │
        │ // 4. throw ConfigurationError             │
        │                                            │
        │ ↓ (token = explicit token from step 1)     │
        │                                            │
        │ const res = await this.post(               │
        │   `/act_${accountId}/campaigns`,           │
        │   { name: '...', objective: '...' }       │
        │ );                                         │
        └──────────────┬──────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │ BasePlatformApiClient.post()               │
        │                                            │
        │ const url = this._baseUrl + path;          │
        │ ↓                                          │
        │ await safeFetch(                           │
        │   'meta',                                  │
        │   url,                                     │
        │   {                                        │
        │     method: 'POST',                        │
        │     body: JSON.stringify({                 │
        │       ...body,                             │
        │       access_token: token                  │
        │     })                                     │
        │   }                                        │
        │ );                                         │
        └──────────────┬──────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │ safeFetch()                                │
        │ (lib/platform-client.js)                   │
        │                                            │
        │ ┌─ Rate Limiter Check                      │
        │ │ (30 req/sec for Meta)                    │
        │ │ await platformLimiter.throttle();        │
        │ └→                                         │
        │                                            │
        │ ┌─ Fetch Request                          │
        │ │ fetch(url, { method, body, headers })    │
        │ └→                                         │
        │                                            │
        │ ┌─ Response Handling                      │
        │ │ 200: return JSON.parse(body)             │
        │ │ 429: Rate limited → retry with backoff   │
        │ │ 500: Server error → retry with backoff   │
        │ │ 4xx: API error → throw Error             │
        │ └→                                         │
        │                                            │
        │ Returns: { id: "12345", name: "..." }      │
        └──────────────┬──────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │ Back to MetaAdsAPI.createCampaign()        │
        │                                            │
        │ if (res.error) {                           │
        │   throw new PlatformError(                 │
        │     res.error.message,                     │
        │     'meta',                                │
        │     res.error.code                         │
        │   );                                       │
        │ }                                          │
        │                                            │
        │ return res;  // { id: "12345" }            │
        └──────────────┬──────────────────────────────┘
                       │
        ┌──────────────▼──────────────────────────────┐
        │ Back to Route Handler                      │
        │                                            │
        │ if (campaign.id) {                         │
        │   campaignsRepo.upsert({                   │
        │     campaign_id: campaign.id,              │
        │     name: campaign.name,                   │
        │     status: 'active'                       │
        │   });                                      │
        │ }                                          │
        │                                            │
        │ res.json({                                 │
        │   success: true,                           │
        │   data: campaign                           │
        │ });                                        │
        └──────────────┬──────────────────────────────┘
                       │
                       ▼
                    Client receives response
```

---

## 6. DATABASE INTERACTION PATTERN

```
┌─────────────────────────────────────────────┐
│ Service Method                              │
│                                             │
│ async getCampaigns(userId, { page, per }) { │
│   const { data, total } =                   │
│     this.campaignsRepo.findAll({            │
│       userId, page, perPage: per             │
│     });                                     │
│                                             │
│   return {                                  │
│     data,                                   │
│     pagination: {                           │
│       page, perPage: per,                   │
│       total,                                │
│       totalPages: ceil(total / per)         │
│     }                                       │
│   };                                        │
│ }                                           │
└──────────────┬────────────────────────────┘
               │
    ┌──────────▼─────────────────────────┐
    │ CampaignsRepository.findAll()       │
    │                                    │
    │ findAll({ userId, page = 1,       │
    │           perPage = 20 } = {}) {   │
    │   const offset = (page - 1) *      │
    │     perPage;                       │
    │                                    │
    │   const data =                     │
    │     this.db.prepare(`              │
    │       SELECT *                     │
    │       FROM campaigns               │
    │       WHERE user_id = ?            │
    │       ORDER BY created_at DESC     │
    │       LIMIT ? OFFSET ?             │
    │     `).all(userId, perPage,        │
    │        offset);                    │
    │                                    │
    │   const { count } =                │
    │     this.db.prepare(`              │
    │       SELECT COUNT(*) as count     │
    │       FROM campaigns               │
    │       WHERE user_id = ?            │
    │     `).get(userId);                │
    │                                    │
    │   return { data, total: count };   │
    │ }                                  │
    └──────────────┬────────────────────┘
                   │
    ┌──────────────▼──────────────────────┐
    │ SQLite3 (better-sqlite3)            │
    │                                     │
    │ Execute prepared statement:         │
    │ SELECT * FROM campaigns             │
    │ WHERE user_id = ?  ← user_id param  │
    │ ORDER BY created_at DESC            │
    │ LIMIT 20 OFFSET 0  ← pagination     │
    │                                     │
    │ Returns: [                          │
    │   {                                 │
    │     id: "...",                      │
    │     user_id: "...",                 │
    │     name: "...",                    │
    │     status: "active",               │
    │     budget: 100000,                 │
    │     spend: 45000,                   │
    │     impressions: 125000,            │
    │     clicks: 3400,                   │
    │     conversions: 89,                │
    │     roas: 2.15,                     │
    │     created_at: "2026-04-08..."     │
    │   },                                │
    │   ...19 more...                     │
    │ ]                                   │
    └──────────────┬──────────────────────┘
                   │
                   ▼
        Response shape returned to service:
        
        {
          data: [
            { id, name, status, budget, ... },
            ...
          ],
          total: 150  // Total records (for pagination)
        }
```

---

## 7. TEST ISOLATION PATTERN

```
┌─────────────────────────────────────────────────┐
│ Test Suite (Vitest)                             │
│                                                 │
│ describe('CampaignsRepository', () => {         │
│   let db, repo;                                 │
│                                                 │
│   beforeEach(() => {                            │
│     // ← Each test gets fresh database          │
│     db = createDatabase(':memory:');            │
│     repo = new CampaignsRepository(db);         │
│   });                                           │
└──────────────┬────────────────────────────────┘
               │
    ┌──────────▼───────────────────────┐
    │ Test 1: Create Campaign          │
    │                                  │
    │ it('should create campaign', () { │
    │   const id = repo.create({       │
    │     name: 'Test',                │
    │     status: 'active'             │
    │   });                            │
    │                                  │
    │   expect(id).toBeDefined();       │
    │                                  │
    │   const campaign = repo.findById  │
    │     (id);                        │
    │   expect(campaign).toEqual(       │
    │     expect.objectContaining({     │
    │       name: 'Test'               │
    │     })                           │
    │   );                             │
    │ });                              │
    └──────────────┬────────────────────┘
                   │
    ┌──────────────▼──────────────────┐
    │ Test 2: Not Found               │
    │                                 │
    │ it('should return null when...', │
    │   () => {                        │
    │   const campaign =               │
    │     repo.findById('nonexistent') │
    │                                 │
    │   expect(campaign).toBeNull();   │
    │ });                              │
    └──────────────┬────────────────────┘
                   │
    ┌──────────────▼──────────────────┐
    │ Test 3: Update Campaign         │
    │                                 │
    │ it('should update status', () {  │
    │   const id = repo.create({...}); │
    │   repo.update(id, {              │
    │     status: 'paused'             │
    │   });                            │
    │                                 │
    │   const updated =                │
    │     repo.findById(id);           │
    │   expect(updated.status).toBe(   │
    │     'paused'                     │
    │   );                             │
    │ });                              │
    └──────────────┬────────────────────┘
                   │
    ┌──────────────▼──────────────────┐
    │ All tests: ✅ PASS               │
    │                                 │
    │ (Each test had isolated DB;      │
    │  no cross-contamination)         │
    └─────────────────────────────────┘
```

---

This architecture is **production-ready**, **highly testable**, and **follows SOLID principles** at every layer. ✅

