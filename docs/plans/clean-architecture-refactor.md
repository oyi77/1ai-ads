# Clean Architecture Refactor Plan — 1ai-ads

## Architecture: 1 SERVICE (adforge)

```
nginx :80
├── /                  → Express :5000  ← ADORGE (the only service we control)
├── /webhook/*         → :8443          ← Hermes agent system (NOT adforge, separate infra)
├── /api/payments/*    → :8765          ← Signal Bridge (payment webhooks)
└── /api/webhooks/*    → :8443          ← Hermes agent system
```

**adforge = 1 service = Express :5000.** That's it.

Express handles:
- REST API for React frontend
- Platform API integrations (Meta, Google, TikTok, etc.)
- Business logic (optimization, workflow, reporting)
- Scheduled jobs (bid guard, daily reports, auto-scaling)
- Telegram bot (NEW feature — `asisten-jualan/` is NOT running, port from reference code)

**Not adforge services (separate infrastructure, don't touch):**
- Port 8443 = Hermes agent system (`.hermes/bin/`) — used by Paperclip/codex, NOT a Telegram bot
- Port 8765 = Signal Bridge — payment webhook relay
- `asisten-jualan/` = Python Telegram bot project — NOT deployed, NOT running. Reference code only.

No Flask (stopped). No Netlify (archived). One `server.js`, one `ecosystem.config.cjs`, one PM2 process.

---

## Current State

| Layer | Files | Problem |
|---|---|---|
| `server/routes/` | 59 | Copy-paste CRUD per platform |
| `server/services/` | 61 | God objects mixing API + business logic + DB |
| `server/repositories/` | 25 | OK, minor dead code |
| `client/src/views/` | 42 | Vanilla JS, no framework, 70+ API endpoints |
| `scripts/` | 265 | Operational scripts mixed with project |

**Service layer chaos:** Only 44/61 services imported in `services.js`. The other 17 are imported directly by routes — no single source of truth.

**Security risk found:** Meta API tokens stored in plain text. `asisten-jualan/security/crypto.py` has proper AES-256-GCM encryption — must port.

**Valuable archived code found:**
- `stoploss-engine.js` — ROAS drop detection + budget cascade (clean state machine)
- `scale-manager.js` — Campaign duplication + budget cap ladder + LLM interest discovery
- `workflow-engine.js` — Full IKLAN_WORKFLOW orchestrator (7-step weekly cycle)
- `profitability-calculator.js` — ROAS evaluation + commission calculation
- `platform-interfaces.js` — Platform abstraction pattern (use as Phase 1 base)
- Netlify `generate-ads.js` — BerkahKarya Ads Framework with detailed prompts

---

## Target Architecture

```
1ai-ads/
├── server.js                      # Entry point
├── server/
│   ├── app.js                     # Express app factory
│   ├── config/                    # Config (keep)
│   │   └── index.js               # All config in one place
│   ├── lib/                       # Shared utilities
│   │   ├── auth.js                # JWT + password hashing
│   │   ├── crypto.js              # ← NEW: AES-256-GCM (port from asisten-jualan)
│   │   ├── logger.js              # Structured logging
│   │   ├── errors.js              # Error classes
│   │   ├── validate.js            # Input validation
│   │   └── ...
│   ├── middleware/                 # Auth, rate-limit (keep)
│   ├── db/                        # Database (keep, enhance schema)
│   │   ├── index.js               # Connection factory
│   │   ├── schema.sql             # Schema
│   │   ├── seed.js                # Demo data
│   │   └── migrations/            # Migrations
│   ├── repos/                     # Data access (rename from repositories/)
│   │   ├── users.js               # + encrypted credential storage
│   │   ├── campaigns.js           # + project hierarchy
│   │   ├── ads.js
│   │   └── ... (20 files, keep)
│   ├── domain/                    # ← NEW: pure business logic
│   │   ├── optimization.js        # Scale + stoploss + bid cap (from archived)
│   │   ├── workflow.js            # IKLAN_WORKFLOW orchestrator (from archived)
│   │   ├── reporting.js           # Analytics aggregation
│   │   ├── creative.js            # BerkahKarya framework + scoring + fatigue
│   │   └── attribution.js         # Attribution + tracking
│   ├── platforms/                 # ← NEW: platform API clients
│   │   ├── base.js                # BasePlatformAPI (from platform-interfaces.js)
│   │   ├── meta.js                # Meta/Facebook API
│   │   ├── google.js              # Google Ads API
│   │   ├── tiktok.js              # TikTok API
│   │   ├── shopee.js              # Shopee adapter
│   │   └── index.js               # PlatformRegistry
│   ├── integrations/              # ← NEW: external service clients
│   │   ├── llm.js                 # LLM client (with fallback chains from hermes/engine.py)
│   │   ├── scalev.js              # Scalev payments
│   │   └── selow.js               # Selow API
│   ├── bot/                       # ← NEW: Telegram bot (port from asisten-jualan)
│   │   ├── index.js               # Bot initialization (Telegraf)
│   │   ├── commands/              # Command handlers
│   │   │   ├── start.js           # /start, onboarding
│   │   │   ├── monitor.js         # /monitor, campaign monitoring
│   │   │   ├── reports.js         # /report, daily reports
│   │   │   └── settings.js        # /settings, account management
│   │   ├── scenes/                # Multi-step flows (Telegraf scenes)
│   │   │   ├── campaign-create.js # Campaign creation wizard
│   │   │   └── ad-create.js       # Ad creation wizard
│   ├── routes/                    # API routes (slim, delegate to domain)
│   │   ├── auth.js                # Login, register, OAuth
│   │   ├── campaigns.js           # Campaigns + ads + landing
│   │   ├── platforms.js           # All platform routes in one file
│   │   ├── creative.js            # Creative library + scoring + fatigue + AB tests
│   │   ├── reporting.js           # Unified reporting + widgets + analytics
│   │   ├── automation.js          # Rules + schedule + autonomous
│   │   ├── settings.js            # Settings + admin
│   │   ├── pages.js               # EJS dashboard pages
│   │   └── mcp.js                 # MCP endpoints
│   └── views/                     # EJS templates (keep)
├── client/                        # SPA (keep)
├── tests/                         # Tests (keep)
├── scripts/                       # Operational scripts (reorganize)
│   ├── patrol/                    # Account patrol
│   ├── satpam/                    # Monitoring
│   ├── vilona/                    # ← NEW: all vilona_* scripts
│   └── _archive/                  # ← NEW: dead scripts
└── _archived/                     # Archive (keep)
```

---

## Phase 0: Security Fix — Credential Encryption

**Priority:** HIGH. Meta tokens stored in plain text.

**Port from:** `asisten-jualan/security/crypto.py`
**To:** `server/lib/crypto.js`

```js
// server/lib/crypto.js
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

export function encryptToken(plaintext) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(encrypted) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const buf = Buffer.from(encrypted, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, null, 'utf8') + decipher.final('utf8');
}

export function tokenHint(token) {
  const clean = token.trim();
  if (clean.length <= 4) return '*'.repeat(clean.length);
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}
```

**Also:**
- Update `server/repositories/platform-accounts.js` to encrypt on write, decrypt on read
- Add migration to encrypt existing plain-text tokens
- Add `ENCRYPTION_KEY` to `.env.example`

**Impact:** Fixes security vulnerability, no breaking changes.

---

## Phase 1: Extract Platform API Clients

**Goal:** 8 near-identical `*-ads-api.js` → 1 base + 4 overrides.

**Current (8 files, ~1800 lines):**
```
server/services/meta-api.js           (350 lines)
server/services/google-ads-api.js     (200 lines)
server/services/tiktok-api.js         (200 lines)
server/services/linkedin-ads-api.js   (200 lines)
server/services/twitter-ads-api.js    (200 lines)
server/services/snapchat-ads-api.js   (200 lines)
server/services/microsoft-ads-api.js  (200 lines)
server/services/pinterest-ads-api.js  (200 lines)
```

**Target (5 files, ~600 lines):**
```
server/platforms/base.js        # From _archived/server/services/platform-interfaces.js
server/platforms/meta.js        # extends BasePlatformAPI
server/platforms/google.js      # extends BasePlatformAPI
server/platforms/tiktok.js      # extends BasePlatformAPI
server/platforms/index.js       # PlatformRegistry — getPlatform('meta') → instance
```

**How:**
1. Start from `_archived/server/services/platform-interfaces.js` as the interface
2. Extract common patterns: auth, CRUD, error handling, rate limiting
3. Each platform overrides: `baseUrl`, `authHeaders()`, `mapResponse()`, platform-specific methods
4. Create `server/platforms/index.js` as registry
5. Update `services.js` to use registry instead of 8 separate imports
6. Keep LinkedIn, Twitter, Snapchat, Microsoft, Pinterest as thin stubs (just override baseUrl + auth)

**Impact:** -1200 lines, single place to add new platforms.

---

## Phase 2: Integrate Archived Business Logic + Extract Domain

**Goal:** Recover valuable archived code and separate business logic from API calls.

### 2a: Recover IKLAN_WORKFLOW chain from archive

Move from `_archived/server/services/` into Express:

```
_archived/server/services/workflow-engine.js      → server/domain/workflow.js
_archived/server/services/scale-manager.js        → server/domain/optimization.js
_archived/server/services/stoploss-engine.js      → server/domain/optimization.js
_archived/server/services/profitability-calculator.js → server/domain/optimization.js
_archived/server/services/daily-reporter.js       → server/domain/reporting.js
_archived/server/services/notification-service.js → server/lib/notifications.js
```

Merge `scale-manager.js` + `stoploss-engine.js` + `profitability-calculator.js` into one `optimization.js` — they're a cohesive unit (scale up / stop loss / evaluate).

### 2b: Consolidate BerkahKarya Ads Framework

Merge the detailed prompt from `_archived/netlify/functions/generate-ads.js` into `server/domain/creative.js`:

```
server/domain/creative.js    # BerkahKarya 4-model framework + scoring + fatigue
```

Sources:
- `_archived/netlify/functions/generate-ads.js` — VALUE CREATION framework, detailed model prompts
- `_archived/server/services/ad-generator.js` — AdGenerator class
- `server/services/creative-scorer.js` — Scoring logic
- `server/services/fatigue-detector.js` — Fatigue detection

### 2c: Extract remaining domain modules

```
server/domain/
  optimization.js    # Scale + stoploss + bid cap + profitability
  workflow.js        # IKLAN_WORKFLOW orchestrator
  reporting.js       # Unified reporter + daily reporter + analytics
  creative.js        # BerkahKarya framework + scoring + fatigue
  attribution.js     # Attribution + UTM tagging
```

**Pattern:** Domain modules are pure functions/classes. They receive platform clients + repos as params (dependency injection). No direct DB access, no direct API calls.

```js
// server/domain/optimization.js — example
export function evaluateStoploss({ currentROAS, previousROAS, consecutiveDrops, alreadyReducedBudget }) {
  // Pure logic, no side effects
}

export async function executeScale({ platform, sourceCampaignId, accountId, llmClient }) {
  // Uses platform client via injection, not direct import
}
```

**Impact:** Clean separation. Business logic testable with mocks. Archived code recovered.

---

## Phase 3: Consolidate Routes

**Goal:** 60 route files → 9 grouped routes.

**Current:** One route file per feature. Many are thin CRUD wrappers.

**Target:**
```
server/routes/
  auth.js              # Login, register, OAuth, sessions (split god function)
  campaigns.js         # Campaigns + ads + landing pages
  platforms.js         # All platform-specific routes (meta, google, tiktok, etc.)
  creative.js          # Creative library + scoring + fatigue + AB tests
  reporting.js         # Unified reporting + widgets + analytics + attribution
  automation.js        # Rules + schedule + autonomous + optimizer
  settings.js          # Settings + admin + tokens (split god function)
  pages.js             # EJS dashboard pages (already done)
  mcp.js               # MCP endpoints
```

**How:**
1. Group related routes by feature domain
2. Each grouped route file creates one Router with sub-paths
3. Routes are thin — delegate to domain modules
4. Update `routers.js` to register 9 routes instead of 60
5. Split god functions: `createAuthRouter` → sub-handlers for login/register/OAuth/token-refresh

**Example — platforms.js:**
```js
export function createPlatformsRouter({ platformRegistry, repos }) {
  const router = Router();
  
  // Meta
  router.get('/meta/accounts', requireAuth, async (req, res) => { ... });
  router.post('/meta/accounts', requireAuth, async (req, res) => { ... });
  router.get('/meta/campaigns/:accountId', requireAuth, async (req, res) => { ... });
  
  // Google
  router.get('/google/accounts', requireAuth, async (req, res) => { ... });
  
  // TikTok
  router.get('/tiktok/accounts', requireAuth, async (req, res) => { ... });
  
  // Dynamic — any platform
  router.get('/:platform/campaigns', requireAuth, async (req, res) => {
    const platform = platformRegistry.get(req.params.platform);
    // ...
  });
  
  return router;
}
```

**Impact:** -51 files, easier to navigate, consistent patterns.

---

## Phase 4: Clean scripts/

**Goal:** 250+ scripts → organized by purpose.

**Audit result:** Most scripts are actively used (modified in last 7 days). They're operational automation, not dead code. But they need organization.

**Target:**
```
scripts/
  patrol/              # Account patrol (already done)
  satpam/              # Monitoring (already done)
  analysis/            # Data analysis (already done)
  vilona/              # ← NEW: all vilona_* scripts (~60 files)
  campaigns/           # ← NEW: campaign creation/management scripts
  monitoring/          # ← NEW: spend monitors, CPC guards
  shopee/              # ← NEW: Shopee integration scripts
  reports/             # ← NEW: reporting scripts
  _archive/            # ← NEW: truly dead scripts (test_*, debug_*, *_v[0-9].py)
```

**How:**
1. Move `vilona_*` → `scripts/vilona/`
2. Move `*_v[0-9]*.py` (versioned scripts) → `scripts/_archive/`
3. Move `test_*.py`, `debug_*.py` → `scripts/_archive/`
4. Group remaining by function

**Impact:** scripts/ organized by purpose, not alphabetical soup.

---

## Phase 5: Fix God Functions + DB Schema Alignment

### 5a: Fix god functions

| Function | Current | Target |
|---|---|---|
| `createAuthRouter` | complexity 40, 1 file | Split into: login, register, OAuth, token-refresh handlers |
| `createSettingsRouter` | complexity 40, 1 file | Split into: general, integrations, billing handlers |
| `createShopeeDashboardRouter` | complexity 33, 1 file | Split into: orders, CSV upload, sync handlers |

### 5b: Align DB schema with asisten-jualan

The Python project has a richer data model. Port these concepts:

| asisten-jualan model | Express equivalent | Action |
|---|---|---|
| `Project` (campaigns grouped by project) | No equivalent | Add `project_id` to campaigns table |
| `UserCredential` (encrypted tokens) | `platform_accounts.credentials` (plain text!) | Encrypt with Phase 0 |
| `InsightsLog` (historical insights) | No equivalent | Add `insights_log` table |
| `Experiment` (A/B test tracking) | `ab_tests` repo (exists) | Align schema |
| `SessionLog` (user activity) | No equivalent | Optional, low priority |

---

## Phase 6: Port Telegram Interface (asisten-jualan → Express)

**`asisten-jualan/` is the Telegram interface for 1ai-ads.** It's not a separate project — it's how users interact with adforge via Telegram. All its features MUST exist in Express.

**Source:** `asisten-jualan/` (FastAPI + python-telegram-bot — 316 files)
**Target:** `server/bot/` (Telegraf.js)

### Complete Feature Map

**Bot Commands (7):**

| Command | asisten-jualan file | Express equivalent | Description |
---|---|---|---|
| `/start` | `bot/handlers/start.py` | `server/bot/commands/start.js` | Onboarding, welcome flow |
| `/menu` | `bot/handlers/quick_start.py` | `server/bot/commands/menu.js` | Main menu with inline buttons |
| `/cancel` | `bot/handlers/quick_start.py` | `server/bot/commands/menu.js` | Cancel current flow |
| `/help` | `bot/handlers/panduan.py` | `server/bot/commands/help.js` | Help/guide |
| `/status` | `bot/handlers/quick_start.py` | `server/bot/commands/status.js` | Account/campaign status |
| `/settings` | `bot/handlers/settings_update.py` | `server/bot/commands/settings.js` | Token, account switching |
| `/pricing` | `bot/handlers/quick_start.py` | `server/bot/commands/pricing.js` | Pricing plans + checkout |

**Bot Flows (multi-step wizards via inline buttons):**

| Flow | asisten-jualan file | Express equivalent | Description |
---|---|---|---|
| Campaign create | `bot/handlers/quick_start.py` → `buat_command` | `server/bot/scenes/campaign-create.js` | Step-by-step campaign wizard |
| Ad copy create | `bot/handlers/quick_start.py` → `cerita_command` | `server/bot/scenes/ad-copy.js` | AI-powered ad copy generation |
| Landing page create | `bot/handlers/quick_start.py` → `lp_command` | `server/bot/scenes/landing-page.js` | LP builder with preview |
| Edit LP | `bot/handlers/quick_start.py` → `edit_command` | `server/bot/scenes/lp-edit.js` | Edit headline/price/image/testimoni |
| Image handling | `bot/handlers/quick_start.py` → `gambar_command` | `server/bot/scenes/image.js` | Upload + position picker |
| Layout editing | `bot/handlers/quick_start.py` → `layout_command` | `server/bot/scenes/layout.js` | Section-by-section LP layout |
| Iklan/ads setup | `bot/handlers/quick_start.py` → `iklan_command` | `server/bot/scenes/ad-setup.js` | Campaign dashboard + sync |
| Monitor rules | `bot/handlers/monitor.py` | `server/bot/commands/monitor.js` | Set spend/ROAS/CTR rules |
| Admin panel | `bot/handlers/admin.py` | `server/bot/commands/admin.js` | Stats, users, grant, broadcast |

**Scheduled Jobs (10 cron jobs):**

| Job | asisten-jualan file | Schedule | Express equivalent |
---|---|---|---|
| Campaign monitor | `scheduler/campaign_monitor.py` | Every 6h | `server/bot/scheduler.js` → `campaignMonitorJob` |
| Subscription check | `scheduler/daily_report.py` | 09:00 WIB | `server/bot/scheduler.js` → `subscriptionCheckJob` |
| Follow-up engine | `scheduler/follow_up.py` | Every hour :30 | `server/bot/scheduler.js` → `followUpJob` |
| Meta campaign sync | `scheduler/meta_sync_job.py` | Every 6h :30 | `server/bot/scheduler.js` → `metaSyncJob` |
| Realtime spend guard | `scheduler/realtime_guard.py` | Every 5min | `server/bot/scheduler.js` → `spendGuardJob` |
| Daily eval guard | `scheduler/daily_eval_guard.py` | 01:00 WIB | `server/bot/scheduler.js` → `dailyEvalJob` |
| Bid satpam | `scheduler/bid_satpam.py` | Every 5min | `server/bot/scheduler.js` → `bidSatpamJob` |
| Daily dashboard | `scheduler/daily_dashboard.py` | 07:00 WIB | `server/bot/scheduler.js` → `dailyDashboardJob` |
| Token health check | `scheduler/token_health.py` | Every 6h :15 | `server/bot/scheduler.js` → `tokenHealthJob` |
| Auto-scale | `scheduler/auto_scale.py` | Triggered | `server/domain/optimization.js` → `executeScaling()` |

**Bot Infrastructure:**

| Feature | asisten-jualan | Express equivalent |
---|---|---|
| Rate limiting | `bot/middleware/rate_limit.py` | `server/middleware/rate-limit.js` (already exists) |
| Button cleanup | `bot/handlers/common.py` | `server/bot/middleware/cleanup.js` |
| Error recovery | `main.py:317-458` (bulletproof error handler) | `server/bot/middleware/error-handler.js` |
| Session state | Redis (`aioredis`) | In-memory Map or SQLite (no Redis dependency) |
| AI engine | `hermes/engine.py` (multi-model routing) | `server/integrations/llm.js` (port routing logic) |
| Credential encryption | `security/crypto.py` (AES-256-GCM) | `server/lib/crypto.js` (Phase 0) |

**How:**
1. `npm install telegraf` — Telegram bot framework for Node.js
2. Create `server/bot/index.js` — bot initialization, webhook setup
3. Port commands one by one (start → menu → settings → monitor → admin)
4. Port flows (campaign-create → ad-copy → landing-page → lp-edit)
5. Port scheduler jobs using `node-cron` (10 cron jobs)
6. Port AI engine routing to `server/integrations/llm.js`
7. Wire bot into Express app (mount at `/webhook/telegram`)
8. Update nginx: `/webhook/telegram` → Express:5000

**Telegram webhook in Express:**
```js
// server/bot/index.js
import { Telegraf } from 'telegraf';
import { initScheduler } from './scheduler.js';

export function initBot(app) {
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  
  // Commands
  bot.start(startHandler);
  bot.command('menu', menuHandler);
  bot.command('settings', settingsHandler);
  bot.command('status', statusHandler);
  bot.help(helpHandler);
  bot.command('pricing', pricingHandler);
  
  // Callback queries (inline buttons)
  bot.action(/^menu:/, menuButtonHandler);
  bot.action(/^settings:/, settingsCallbackHandler);
  bot.action(/^monitor:/, monitorCallbackHandler);
  bot.action(/^rule:/, ruleCallbackHandler);
  bot.action(/^scale_confirm:/, scaleConfirmHandler);
  bot.action(/^iklan:/, iklanActionHandler);
  
  // Message router (text/photo input)
  bot.on('text', messageRouter);
  bot.on('photo', messageRouter);
  
  // Error handler (bulletproof — never crashes)
  bot.catch(errorHandler);
  
  // Mount webhook on Express
  app.use(bot.webhookCallback('/webhook/telegram'));
  bot.telegram.setWebhook('https://adforge.aitradepulse.com/webhook/telegram');
  
  // Start scheduled jobs
  initScheduler(bot);
  
  return bot;
}
```

**Nginx change:**
```nginx
# Before
location /webhook/ { proxy_pass http://127.0.0.1:8443; }

# After
location /webhook/telegram { proxy_pass http://127.0.0.1:5000; }
```

**Impact:** All asisten-jualan features available via Telegram, running inside Express. No Python dependency.

---

## Phase 7: Frontend Rewrite — Vanilla JS → React + shadcn/ui

**Goal:** Replace vanilla JS SPA (42 views) + EJS templates with React dashboard.

**Template:** `satnaing/shadcn-admin` (GitHub: 200 OK, verified)

**Stack:**
```
React + TypeScript + Vite (already installed)
├── shadcn/ui          — Dark theme components (Radix UI + Tailwind)
├── TanStack Table     — Data-dense tables (sorting, filtering, pagination)
├── TanStack Query     — API data fetching + caching
├── Recharts           — Charts (ROAS, spend, revenue)
├── React Router       — Client-side routing
└── React Hook Form    — Form validation
```

**What to port:**

| Current (vanilla JS) | React equivalent | Priority |
|---|---|---|
| `client/src/lib/api.js` | TanStack Query + fetch wrapper | HIGH |
| `client/src/lib/router.js` | React Router | HIGH |
| `client/src/lib/store.js` | Zustand or React Context | HIGH |
| `client/src/views/dashboard.js` | `<DashboardPage />` | HIGH |
| `client/src/views/campaigns*.js` | `<CampaignsPage />` | HIGH |
| `client/src/views/settings*.js` | `<SettingsPage />` | MEDIUM |
| `client/src/views/creative-*.js` | `<CreativePage />` | MEDIUM |
| `client/src/views/reporting-*.js` | `<ReportingPage />` | MEDIUM |
| 42 view files total | ~15 React page components | ALL |

**How:**
1. Clone `satnaing/shadcn-admin` into `client-new/`
2. Set up API proxy to Express (`/api` → `localhost:5000`)
3. Port `api.js` → TanStack Query hooks (`useCampaigns`, `useAds`, etc.)
4. Port views one by one (dashboard → campaigns → settings → creative → reporting)
5. Kill EJS templates (no longer needed)
6. Move `client-new/` → `client/`
7. Update Vite config

**Kill after completion:**
- `server/views/` (EJS templates) → `_archived/`
- `server/public/css/dashboard.css` → `_archived/`
- EJS dependency from `package.json`

**Impact:** Modern React dashboard, better DX, component reuse, type safety.

---

## Execution Order

```
Phase 0 (security)       — CRITICAL, do first
Phase 1 (platforms)      — standalone, no breaking changes
Phase 5a (god functions) — can parallel with Phase 1
Phase 2 (domain)         — depends on Phase 1 (needs clean platform interfaces)
Phase 3 (routes)         — depends on Phase 2 (routes delegate to domain)
Phase 7 (frontend)       — depends on Phase 3 (needs clean API surface)
Phase 6 (Telegram bot)   — depends on Phase 0 + Phase 2 (needs crypto + domain logic)
Phase 4 (scripts)        — independent, can be done anytime
Phase 5b (DB alignment)  — depends on Phase 0 (needs encryption)
```

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 7
  │           ↓              │
  │        Phase 5a          ↓
  │                        Phase 6
  ↓
Phase 5b
Phase 4 (independent)
```

---

## Verification

After each phase:
```bash
npx vitest run                        # All tests pass
node -c server/app.js                 # Syntax check
node -e "import('./server/lib/crypto.js')"  # Crypto module loads
curl http://localhost:5000/health      # Server starts
curl http://localhost:5000/login       # Pages render
curl http://localhost:5000/api/campaigns -H "Authorization: Bearer $T"  # API works
```

---

## What NOT to change

- `_archived/` — leave as-is, reference when needed
- `client/` SPA — out of scope (separate refactor)
- `.gitignore`, config files — leave alone
- EJS templates — just created, leave alone
- `db/schema.sql` core tables — don't break, only add
- `asisten-jualan/` — read-only reference for porting. Archive after Phase 6.

---

## Metrics

| Metric | Before | After |
|---|---|---|
| adforge services | 1 (Express :5000) | 1 (Express :5000) |
| Service files | 61 (44 centralized + 17 scattered) | ~15 (domain + platforms + integrations + bot) |
| Route files | 59 | 9 |
| Repository files | 25 (19 centralized + 6 unused) | 20 |
| Platform API files | 8 (1800 lines) | 5 (600 lines) |
| Frontend | Vanilla JS (42 views) | React + shadcn/ui |
| Security | Plain text tokens | AES-256-GCM |
| Archived business logic | Lost in archive | Integrated as domain modules |
| God functions | 3 (complexity 40+) | 0 (split into sub-handlers) |
| Scripts organization | 265 files, alphabetical soup | Grouped by purpose |
| Telegram bot | Not deployed (asisten-jualan code exists) | Node.js inside Express |

**Note:** Port 8443 (Hermes agent system) and port 8765 (Signal Bridge) are NOT adforge services. They're separate infrastructure managed independently. The plan only touches Express :5000.
