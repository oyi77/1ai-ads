# Adspire.ai Integration Plan

**Date:** 2026-04-10
**Status:** Ready for implementation
**Complexity:** MEDIUM
**Scope:** 6 tasks across ~8 files (3 new, 5 modified)

---

## Requirements Summary

Integrate AdForge with Adspire.ai's multi-brand content operations platform to unlock:
1. **Ad Intelligence** -- trending ads and creative intelligence across 8 channels (1B+ ads database)
2. **AI Content Generation** -- generate ad copy/creatives using Adspire's AI engine
3. **Multi-Channel Publishing** -- publish ads to Facebook, Instagram, TikTok, LinkedIn, Google Ads, Bing Ads
4. **Brand Asset Management** -- retrieve and manage brand asset libraries
5. **Campaign Analytics** -- pull cross-platform campaign performance data

The existing `AdSpireAdapter` (`server/services/adspire-adapter.js`) already has `getCompetitorAds()` and `searchAds()` with Bearer token auth and graceful fallback. This plan extends that foundation.

---

## Guardrails

### Must Have
- All new endpoints behind `requireAuth` middleware (consistent with existing routes)
- Graceful degradation when `AD_SPIRE_API_KEY` is not set (return `configured: false`, never throw)
- API key resolution order: env var (`config.adSpireApiKey`) first, then `settingsRepo.getCredentials('adspire')` fallback
- Rate limit awareness with retry-after header respect
- All responses follow existing `{ success: boolean, data/error }` envelope pattern

### Must NOT Have
- No breaking changes to existing `AdSpireAdapter` constructor or public API
- No hardcoded API endpoints outside of `adspire-adapter.js`
- No storing raw API keys in logs (mask in settings GET responses)
- No direct Adspire calls from route handlers (always go through adapter)

---

## Task Flow

```
Task 1: Extend AdSpireAdapter (service layer)
    |
    v
Task 2: Create /api/adspire router (route layer)
    |
    v
Task 3: Wire into server/app.js (app wiring)
    |
    v
Task 4: Settings integration (credentials management)
    |
    v
Task 5: Competitor spy enhancement (source=adspire)
    |
    v
Task 6: Test coverage (unit + integration)
```

Tasks 1 and 4 can run in parallel. Task 2 depends on Task 1. Task 3 depends on Tasks 1, 2, and 4. Task 5 depends on Task 3. Task 6 can begin after Task 1 (unit tests) and complete after Task 3 (integration tests).

---

## Detailed TODOs

### Task 1: Extend AdSpireAdapter Service Layer

**File:** `server/services/adspire-adapter.js`
**Lines to modify:** Add new methods after `searchAds()` (after line 138), before the `createAdSpireAdapter()` factory (line 146).

Add a private `_request()` helper to DRY the fetch+auth+error pattern already duplicated in `getCompetitorAds` (lines 56-63) and `searchAds` (lines 121-128):

```
_request(method, path, { params, body } = {})
```

Then add these methods:

1. **`getAdIntelligence(query, opts)`**
   - Endpoint: `GET /ad-intelligence?query=...&channel=...&limit=...`
   - Params: `query` (string), `opts.channel` (string, optional), `opts.limit` (number, default 50), `opts.country` (string, default 'US')
   - Returns: `{ query, ads: [...normalized], total, fetchedAt, source: 'adspire' }`
   - Normalize each ad to match the existing format at lines 74-89

2. **`generateAdContent(brandContext, opts)`**
   - Endpoint: `POST /generate` with JSON body
   - Body: `{ brand: brandContext.brand, product: brandContext.product, audience: brandContext.audience, tone: opts.tone, platforms: opts.platforms, variants: opts.variants || 3 }`
   - Returns: raw Adspire response (array of generated ad variants)

3. **`publishAd(adData, platforms)`**
   - Endpoint: `POST /publish` with JSON body
   - Body: `{ ad: adData, platforms: platforms }`
   - Returns: `{ published: [...], errors: [...] }` per-platform status

4. **`getBrandAssets(brandId)`**
   - Endpoint: `GET /brands/{brandId}/assets`
   - Returns: `{ brandId, assets: [...] }`

5. **`getCampaignAnalytics(campaignId, dateRange)`**
   - Endpoint: `GET /campaigns/{campaignId}/analytics?start=...&end=...`
   - Params: `dateRange.start`, `dateRange.end` (ISO date strings)
   - Returns: raw analytics response

6. **`getStatus()`**
   - No API call needed. Returns `{ configured: this.available, apiUrl: this.apiUrl }`
   - If configured, makes a lightweight `GET /status` or `GET /me` ping to verify connectivity
   - Returns: `{ configured: true/false, connected: true/false, error?: string }`

Also update `createAdSpireAdapter()` to accept an optional `settingsRepo` param:
```js
export function createAdSpireAdapter(settingsRepo = null) {
  // Try env first, then settingsRepo
  let apiKey = config.adSpireApiKey;
  if (!apiKey && settingsRepo) {
    const creds = settingsRepo.getCredentials('adspire');
    apiKey = creds?.api_key || null;
  }
  const adapter = new AdSpireAdapter({ apiKey });
  return adapter.isAvailable() ? adapter : null;
}
```

**Acceptance Criteria:**
- [ ] `_request('GET', '/status')` sends correct `Authorization: Bearer <key>` header
- [ ] `getAdIntelligence('shoes')` returns normalized ad objects with `source: 'adspire'`
- [ ] `generateAdContent({ brand: 'Test' }, { tone: 'professional' })` sends POST with correct body
- [ ] `publishAd(adData, ['facebook', 'google'])` sends POST and returns per-platform results
- [ ] `getBrandAssets('brand-123')` hits `GET /brands/brand-123/assets`
- [ ] `getCampaignAnalytics('camp-1', { start: '2026-01-01', end: '2026-03-31' })` passes date range as query params
- [ ] `getStatus()` returns `{ configured: false }` when no API key
- [ ] `createAdSpireAdapter(settingsRepo)` falls back to settingsRepo when env var is empty
- [ ] All methods throw descriptive errors with HTTP status when API returns non-200
- [ ] All methods guard with `if (!this.available) throw new Error(...)` check (matching existing pattern at lines 46, 109)

---

### Task 2: Create `/api/adspire` Router

**New file:** `server/routes/adspire.js`
**Pattern reference:** `server/routes/meta.js` (lines 1-60) -- same router factory pattern

Create `createAdspireRouter(adSpireAdapter)` returning an Express Router:

| Method | Path | Handler | Notes |
|--------|------|---------|-------|
| `GET` | `/status` | `adSpireAdapter.getStatus()` | Always 200, returns `configured: true/false` |
| `GET` | `/search` | `adSpireAdapter.searchAds(req.query.keyword, opts)` | Query params: `keyword`, `platform`, `country`, `limit` |
| `GET` | `/competitor/:domain` | `adSpireAdapter.getCompetitorAds(domain, opts)` | Query params: `platform`, `limit` |
| `GET` | `/intelligence` | `adSpireAdapter.getAdIntelligence(query, opts)` | Query params: `query`, `channel`, `country`, `limit` |
| `POST` | `/generate` | `adSpireAdapter.generateAdContent(req.body.brandContext, req.body.options)` | Body: `{ brandContext, options }` |
| `POST` | `/publish` | `adSpireAdapter.publishAd(req.body.adData, req.body.platforms)` | Body: `{ adData, platforms }` |
| `GET` | `/assets` | `adSpireAdapter.getBrandAssets(req.query.brandId)` | Query param: `brandId` |
| `GET` | `/analytics/:campaignId` | `adSpireAdapter.getCampaignAnalytics(campaignId, dateRange)` | Query params: `start`, `end` |

Every handler must:
1. Check `adSpireAdapter` is not null (return 503 with `{ success: false, error: 'Adspire integration not configured' }`)
2. Wrap in try/catch following the `{ success: true, data }` / `{ success: false, error }` pattern (see `server/routes/meta.js` lines 8-13)
3. Validate required params (return 400 for missing `keyword`, `domain`, `brandContext`, etc.)

**Acceptance Criteria:**
- [ ] `GET /api/adspire/status` returns 200 with `{ success: true, data: { configured: false } }` when no key
- [ ] `GET /api/adspire/search?keyword=shoes` proxies to `searchAds('shoes', {})`
- [ ] `GET /api/adspire/competitor/nike.com` proxies to `getCompetitorAds('nike.com', {})`
- [ ] `POST /api/adspire/generate` without body returns 400
- [ ] `POST /api/adspire/publish` with valid body proxies to `publishAd()`
- [ ] All endpoints return 503 when adapter is null (not configured)

---

### Task 3: Wire into server/app.js

**File:** `server/app.js`

Changes needed (reference current line numbers):

1. **Add import** (after line 42, near other service imports):
   ```js
   import { createAdSpireAdapter } from './services/adspire-adapter.js';
   import { createAdspireRouter } from './routes/adspire.js';
   ```

2. **Create adapter instance** (after line 88, in the services section):
   ```js
   const adSpireAdapter = createAdSpireAdapter(settingsRepo);
   ```

3. **Pass adapter to CompetitorSpyService** -- update line 127:
   Currently: `createCompetitorSpyRouter(competitorsRepo)` -- the router creates `CompetitorSpyService` internally without the adapter.
   The fix depends on Task 5 (competitor spy enhancement). For now, pass adapter as context to the router factory:
   ```js
   app.use('/api/competitor-spy', requireAuth, createCompetitorSpyRouter(competitorsRepo, adSpireAdapter));
   ```

4. **Mount Adspire router** (after the competitor-spy mount, ~line 128):
   ```js
   app.use('/api/adspire', requireAuth, createAdspireRouter(adSpireAdapter));
   ```

**Acceptance Criteria:**
- [ ] Server starts without errors when `AD_SPIRE_API_KEY` is not set (adapter is null)
- [ ] Server starts correctly when `AD_SPIRE_API_KEY` is set (adapter is instantiated)
- [ ] `/api/adspire/status` is reachable and returns valid JSON
- [ ] `/api/competitor-spy` continues to work as before (no regression)
- [ ] Adspire routes require authentication (return 401 without valid JWT)

---

### Task 4: Settings Integration

**File:** `server/routes/settings.js`

Add Adspire-specific credential endpoints following the existing `credentials/:platform` pattern (lines 237-275):

1. **`GET /api/settings/adspire`** -- check Adspire configuration status
   - Check `config.adSpireApiKey` (env) first
   - If empty, check `settingsRepo.getCredentials('adspire')`
   - Return `{ configured: boolean, source: 'env' | 'settings' | null, apiUrl: config.adSpireApiUrl }`
   - Mask the API key in response (first 4 chars + `****`)

2. **`POST /api/settings/adspire`** -- save Adspire API key via settings
   - Body: `{ api_key: string, api_url?: string }`
   - Save via `settingsRepo.setCredentials('adspire', { api_key, api_url })`
   - This uses the existing `platform_accounts` table via `settingsRepo.addAccount()` or the legacy `credentials_adspire` key
   - Follow the pattern at lines 253-275 (create/update "Default" account)

3. **`POST /api/settings/adspire/test`** -- test Adspire API connectivity
   - Create a temporary `AdSpireAdapter` with the provided key
   - Call `getStatus()` to verify
   - Return success/failure

These can be added inside the existing `createSettingsRouter` function, or the `/api/settings/credentials/adspire` legacy endpoint already works for basic save/load. The dedicated `/api/settings/adspire` endpoints add Adspire-specific UX (test connection, show source).

**Acceptance Criteria:**
- [ ] `GET /api/settings/adspire` returns `{ configured: true, source: 'env' }` when env var is set
- [ ] `GET /api/settings/adspire` returns `{ configured: true, source: 'settings' }` when saved via POST
- [ ] `GET /api/settings/adspire` returns `{ configured: false }` when neither is set
- [ ] `POST /api/settings/adspire` with `{ api_key: 'test-key' }` persists to settings table
- [ ] `POST /api/settings/adspire/test` with valid key returns `{ success: true }`
- [ ] `POST /api/settings/adspire/test` with invalid key returns `{ success: false, error: '...' }`
- [ ] API key is never returned in full -- always masked

---

### Task 5: Competitor Spy Enhancement

**File:** `server/routes/competitor-spy.js`

Update the router factory signature and internal logic:

1. **Update factory** (line 5):
   ```js
   export function createCompetitorSpyRouter(competitorsRepo, adSpireAdapter = null)
   ```

2. **Update `POST /` handler** (lines 31-46) to support `?source=adspire` query param:
   - When `req.query.source === 'adspire'` and `adSpireAdapter` is available, use `adSpireAdapter.getCompetitorAds()` instead of `AdIntelligenceService`
   - When `req.query.source === 'adspire'` and adapter is null, return 503 with clear message
   - Default behavior (no `source` param) remains unchanged

3. **Update `POST /:competitorId/analyze`** handler (lines 127-152):
   - Pass `adSpireAdapter` as 3rd argument to `CompetitorSpyService` constructor (line 136-139):
     ```js
     const competitorSpyService = new CompetitorSpyService(
       competitorsRepo.db,
       new AdIntelligenceService(competitorsRepo.db),
       adSpireAdapter
     );
     ```
   - Add `?source=adspire` support: when set, skip `AdIntelligenceService` and force the service to use the adapter

4. **Update `POST /refresh`** handler (lines 49-69):
   - Same pattern: use `adSpireAdapter` when `?source=adspire` is specified

**Acceptance Criteria:**
- [ ] `POST /api/competitor-spy?source=adspire` with body `{ url: 'nike.com' }` uses AdSpireAdapter
- [ ] `POST /api/competitor-spy` without `source` param uses existing AdIntelligenceService (no regression)
- [ ] `POST /api/competitor-spy?source=adspire` returns 503 when adapter is null
- [ ] `POST /api/competitor-spy/:id/analyze` passes adSpireAdapter to CompetitorSpyService
- [ ] Response shape is identical regardless of source (same `{ success, data }` envelope)

---

### Task 6: Test Coverage

**New files:**
- `tests/unit/services/adspire-adapter.test.js`
- `tests/integration/adspire.test.js`

**Modified file:**
- `tests/integration/competitor-spy.test.js`

#### 6a. Unit Tests -- `tests/unit/services/adspire-adapter.test.js`

Follow the pattern in `tests/unit/services/competitor-spy.test.js` (mock fetch globally, mock config):

| Test | Assertion |
|------|-----------|
| `constructor sets available=false when no API key` | `adapter.isAvailable() === false` |
| `constructor sets available=true when API key provided` | `adapter.isAvailable() === true` |
| `getAdIntelligence sends correct request` | Fetch called with `GET /ad-intelligence?query=shoes&limit=50&country=US`, correct Authorization header |
| `getAdIntelligence normalizes response` | Returns `{ query, ads: [...], source: 'adspire' }` |
| `generateAdContent sends POST with body` | Fetch called with `POST /generate`, body includes `brand`, `tone` |
| `publishAd sends POST with platforms` | Fetch called with `POST /publish`, body includes `platforms: ['facebook']` |
| `getBrandAssets interpolates brandId` | Fetch called with `GET /brands/brand-123/assets` |
| `getCampaignAnalytics passes date range` | Fetch called with `GET /campaigns/camp-1/analytics?start=...&end=...` |
| `getStatus returns configured:false when unavailable` | No fetch call, returns `{ configured: false }` |
| `getStatus returns connected:true on successful ping` | Fetch called, returns `{ configured: true, connected: true }` |
| `_request throws on non-200 response` | Throws `AdSpire API error (401): Unauthorized` |
| `all methods throw when not configured` | Each method throws `'AdSpire API key not configured'` |
| `createAdSpireAdapter with settingsRepo fallback` | Returns adapter when settingsRepo has credentials |

#### 6b. Integration Tests -- `tests/integration/adspire.test.js`

Follow the pattern in `tests/integration/competitor-spy.test.js` (create app with test DB, generate JWT):

| Test | Assertion |
|------|-----------|
| `GET /api/adspire/status without API key` | 200 with `{ success: true, data: { configured: false } }` |
| `GET /api/adspire/status without auth` | 401 |
| `GET /api/adspire/search without keyword` | 400 with error message |
| `GET /api/adspire/search when not configured` | 503 with `'Adspire integration not configured'` |
| `POST /api/adspire/generate without body` | 400 |
| `GET /api/settings/adspire` | 200 with `{ configured: false }` |
| `POST /api/settings/adspire` | 200, persists key |
| `POST /api/settings/adspire/test with bad key` | Returns `{ success: false }` |

#### 6c. Competitor Spy Test Update -- `tests/integration/competitor-spy.test.js`

Add to existing test suite:

| Test | Assertion |
|------|-----------|
| `POST /api/competitor-spy?source=adspire without adapter` | 503 |
| `POST /:id/analyze passes adSpireAdapter to service` | Verify CompetitorSpyService receives adapter in constructor |

**Acceptance Criteria:**
- [ ] `npm test` passes with all new tests
- [ ] Unit tests mock `fetch` and never make real HTTP calls
- [ ] Integration tests use test database (not production)
- [ ] No test depends on `AD_SPIRE_API_KEY` being set in environment
- [ ] Coverage: all 6 new adapter methods have at least 1 success + 1 error test

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **No public API docs** -- endpoint paths are inferred from product features | Methods may 404 at runtime | HIGH | All adapter methods include descriptive error handling. Use `getStatus()` endpoint to verify connectivity before other calls. Log full error responses. Plan for endpoint discovery/correction post-deployment. |
| **API key auth failure / expiry** | 401 errors at runtime | MEDIUM | `getStatus()` ping on startup and from settings UI. Clear error messages surfaced to user. Never cache stale auth state. |
| **Rate limiting by Adspire** | 429 responses, degraded UX | MEDIUM | Add `Retry-After` header parsing in `_request()`. Implement exponential backoff (max 3 retries). Log rate limit hits. Consider adding `cacheService` integration for repeated queries. |
| **Response schema changes** | Normalization breaks silently | LOW | Defensive normalization with `||` fallbacks (already used in existing `getCompetitorAds`, lines 74-89). Add `source: 'adspire'` to all responses for debugging. |
| **Circular dependency with settingsRepo** | `createAdSpireAdapter(settingsRepo)` called before repo ready | LOW | Factory is called inside `createApp()` after all repos are instantiated (line 79+). No risk if placement follows the existing pattern. |
| **Existing competitor-spy regression** | Breaking the `POST /` or `/analyze` endpoints | MEDIUM | Default `adSpireAdapter = null` in router factory. All `source=adspire` logic is gated behind explicit query param. Existing tests verify no-adapter path. |

---

## Verification Steps

1. **Smoke test** -- Start server without `AD_SPIRE_API_KEY`:
   - `GET /api/adspire/status` returns `{ configured: false }`
   - `GET /api/adspire/search?keyword=test` returns 503
   - All existing routes still work

2. **Settings flow** -- Save API key via settings:
   - `POST /api/settings/adspire` with `{ api_key: 'test-key-123' }`
   - `GET /api/settings/adspire` returns `{ configured: true, source: 'settings' }`
   - Restart server -- adapter picks up key from settingsRepo

3. **Competitor spy** -- Verify no regression:
   - `POST /api/competitor-spy` with `{ url: 'example.com' }` works as before
   - `POST /api/competitor-spy?source=adspire` uses adapter when configured

4. **Run test suite**:
   ```bash
   npm test -- --reporter verbose
   ```
   All existing + new tests pass.

5. **Manual API key test** (when real key available):
   - Set `AD_SPIRE_API_KEY` in `.env`
   - `GET /api/adspire/status` returns `{ configured: true, connected: true }`
   - `GET /api/adspire/search?keyword=shoes` returns real ad data
   - `GET /api/adspire/competitor/nike.com` returns competitor ads

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `server/services/adspire-adapter.js` | MODIFY | Add `_request()`, 6 new methods, update factory |
| `server/routes/adspire.js` | CREATE | New router with 8 endpoints |
| `server/app.js` | MODIFY | Import adapter+router, create instance, mount routes |
| `server/routes/settings.js` | MODIFY | Add 3 Adspire settings endpoints |
| `server/routes/competitor-spy.js` | MODIFY | Accept adapter param, add `?source=adspire` support |
| `tests/unit/services/adspire-adapter.test.js` | CREATE | 13 unit tests |
| `tests/integration/adspire.test.js` | CREATE | 8 integration tests |
| `tests/integration/competitor-spy.test.js` | MODIFY | Add 2 Adspire source tests |
