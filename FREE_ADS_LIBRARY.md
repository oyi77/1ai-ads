# Free Multi-Platform Ads Library

A unified interface for researching competitor ads across Meta, Google, and TikTok without paid subscriptions. Uses public APIs and web scraping as a fallback.

---

## Architecture Overview

```
HTTP Request
     │
     ▼
AdsLibraryRoutes  (/api/ads-library/*)
     │
     ▼
UnifiedAdsLibraryService
     │  search() — runs all platforms in parallel via Promise.allSettled
     │
     ├──► MetaAdapter   → Meta Graph API (ads_archive) → MetaScraper (fallback)
     ├──► GoogleAdapter → Google Ads Transparency scrape → GoogleScraper
     └──► TikTokAdapter → TikTok Creative Center API  → TikTokScraper (fallback)
                │
           CacheService (in-memory, TTL-based)
           PuppeteerPool (shared browser instances for scrapers)
           RequestQueue  (rate limiting across all scrapers)
```

Each platform has an **adapter** that normalizes results into a common `NormalizedAd` shape, and a **scraper** that drives a headless browser when the API is unavailable or fails. All scrapers share a single `PuppeteerPool` (max 3 instances) and `RequestQueue` (20 req/min, max 3 concurrent, 1 s min delay).

Results across platforms are aggregated into a single response. Platform failures are isolated — if one platform errors, the others still return results.

---

## Data Sources Per Platform

### Meta (Facebook & Instagram)

| Source | Type | Auth Required |
|--------|------|--------------|
| Meta Ads Archive Graph API v21.0 (`/ads_archive`) | Official API | Yes — `access_token` |
| facebook.com/ads/library/ | Web scrape | No |

**Fields returned from API:** `id`, `page_name`, `page_id`, `ad_creative_bodies`, `ad_creative_link_titles`, `ad_creative_link_descriptions`, `ad_snapshot_url`, `ad_delivery_start_time`, `ad_delivery_stop_time`, `publisher_platforms`, `spend`, `impressions`, `currency`.

Note: `spend` and `impressions` are only populated for political ads and EU-regulated advertisers.

**Fallback behavior:** If an `access_token` is configured and the API call fails (rate limit, token expired, etc.), the adapter automatically retries via the web scraper. If `source=api` is explicitly set and no scraper is configured, the error is surfaced directly.

---

### Google Ads

| Source | Type | Auth Required |
|--------|------|--------------|
| Google Ads Transparency Center (adstransparency.google.com) | Web scrape | No |
| Google Ads API | Official API | Yes — `developer_token` + `oauth_token` |

Google's official API is for managing your own campaigns, not researching competitors. Competitor research relies primarily on scraping the Ads Transparency Center. API access augments data if credentials are configured.

**Default behavior:** Scraping is the primary source for Google (`source=auto` uses scrape first unless `source=api` is explicitly set and credentials exist).

---

### TikTok Ads

| Source | Type | Auth Required |
|--------|------|--------------|
| TikTok Creative Center internal API (`/creative_radar_api/v1/topads/search`) | Unofficial public API | No |
| ads.tiktok.com/business/creativecenter/ | Web scrape | No |

TikTok's Creative Center exposes an unofficial public API used by its own web app — no auth token required. This is the primary source. The scraper is the fallback.

**TikTok Business API** (`access_token`) is for managing your own ad account only; it does not provide competitor research data.

---

## Normalized Ad Format

All platforms return ads in this common shape:

```js
{
  id: string,
  platform: 'meta' | 'google' | 'tiktok',
  pageName: string,          // Advertiser name
  pageId: string | null,
  headlines: string[],
  descriptions: string[],
  imageUrl: string | null,
  videoUrl: string | null,
  landingUrl: string | null,
  ctaType: string | null,
  snapshotUrl: string | null, // Link to view the ad
  deliveryStart: string | null, // ISO date
  deliveryStop: string | null,
  platforms: string[],       // e.g. ['facebook', 'instagram']
  spend: object | null,      // { lower_bound, upper_bound, currency }
  impressions: object | null,
  status: string,
  adType: string,            // 'image', 'video', 'carousel', etc.
}
```

---

## API Endpoints

All routes are prefixed with `/api/ads-library`.

### `GET /api/ads-library/search`

Search for ads across one or all platforms.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `q` | string | required | Search query |
| `platform` | string | `all` | `meta`, `google`, `tiktok`, or `all` |
| `source` | string | `auto` | `api`, `scrape`, or `auto` |
| `country` | string | `US` | ISO country code |
| `adStatus` | string | `ALL` | `ACTIVE`, `INACTIVE`, or `ALL` |
| `mediaType` | string | — | `IMAGE`, `VIDEO`, or `ALL` |
| `adType` | string | — | Platform-specific ad type |
| `limit` | number | `50` | Results per platform (1–500) |
| `cursor` | string | — | Pagination cursor from a previous response |

**Example:**

```bash
curl "http://localhost:3000/api/ads-library/search?q=nike&platform=meta&country=US&limit=20"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "query": "nike",
    "platforms": [
      {
        "platform": "meta",
        "adapter": "Meta (Facebook & Instagram)",
        "source": "api",
        "ads": [...],
        "total": 20,
        "hasMore": true,
        "nextCursor": "AQH...",
        "error": null,
        "fromCache": false
      }
    ],
    "ads": [...],
    "total": 20,
    "totalByPlatform": { "meta": 20 },
    "hasErrors": false,
    "errors": [],
    "fetchedAt": "2026-04-10T00:00:00.000Z"
  }
}
```

---

### `GET /api/ads-library/sources`

List available data sources and their configuration status per platform.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `platform` | string | — | Filter to one platform (optional) |

**Example:**

```bash
curl "http://localhost:3000/api/ads-library/sources"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "name": "meta",
      "displayName": "Meta (Facebook & Instagram)",
      "apiAvailable": false,
      "scrapeAvailable": true,
      "apiConfigured": false,
      "apis": [
        {
          "name": "Meta Ads Archive API",
          "endpoint": "https://graph.facebook.com/v21.0/ads_archive",
          "requiresAuth": true,
          "rateLimit": "~200 requests/hour per token",
          "available": false
        },
        {
          "name": "Meta Ad Library (Web)",
          "endpoint": "https://www.facebook.com/ads/library/",
          "requiresAuth": false,
          "rateLimit": "Web scraping - use with caution",
          "available": true
        }
      ]
    }
  ]
}
```

---

### `GET /api/ads-library/ad/:id`

Get details for a specific ad by ID.

**URL parameters:** `:id` — the platform-specific ad ID.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `platform` | string | `meta`, `google`, or `tiktok`. If omitted, inferred from ID format (defaults to `meta`). |

**Example:**

```bash
curl "http://localhost:3000/api/ads-library/ad/123456789?platform=meta"
```

---

### `GET /api/ads-library/stats`

Returns cache hit rate, Puppeteer pool status, and request queue metrics.

```bash
curl "http://localhost:3000/api/ads-library/stats"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "platforms": 3,
    "cache": {
      "hits": 42,
      "misses": 8,
      "sets": 8,
      "evictions": 0,
      "size": 8,
      "maxSize": 1000,
      "hitRate": "84.00%"
    },
    "puppeteer": { ... },
    "requestQueue": { ... },
    "timestamp": "2026-04-10T00:00:00.000Z"
  }
}
```

---

### `DELETE /api/ads-library/cache`

Clear the in-memory cache. Optionally scope to a single platform.

**Query parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `platform` | string | `meta`, `google`, or `tiktok`. Omit to clear all. |

**Examples:**

```bash
# Clear all cache
curl -X DELETE "http://localhost:3000/api/ads-library/cache"

# Clear only Meta cache
curl -X DELETE "http://localhost:3000/api/ads-library/cache?platform=meta"
```

---

## CLI Usage

The `adforge-cli.js` script at the project root exposes the same library.

```bash
# Search across all platforms
node adforge-cli.js ads-search --query "nike" --platform all --limit 20

# Search a specific platform with scraping forced
node adforge-cli.js ads-search --query "coca cola" --platform meta --source scrape

# Get sources status
node adforge-cli.js ads-sources

# Clear cache
node adforge-cli.js ads-cache-clear --platform google
```

---

## Rate Limits and Caching

### Request Queue (scraper layer)

The shared `RequestQueue` applies to all Puppeteer-based scrapers:

| Setting | Value |
|---------|-------|
| Requests per minute | 20 |
| Max concurrent | 3 |
| Min delay between requests | 1000 ms |

### API Rate Limits (per platform)

| Platform | Limit |
|----------|-------|
| Meta Graph API | ~200 requests/hour per access token |
| Google Ads Transparency | Web scraping — no defined limit, use conservatively |
| TikTok Creative Center | Unofficial API — no published limit, use conservatively |

### Cache

Results are cached in-memory using a TTL-based `Map` store.

| Setting | Default |
|---------|---------|
| Default TTL | 1 hour (3,600,000 ms) |
| Max entries | 1,000 |
| Cleanup interval | 10 minutes |
| Eviction policy | Oldest entry first (by creation time) |

**Cache keys** follow the pattern:
```
ads:{platform}:{query}:country={country}&limit={limit}&source={source}&status={status}&type={type}
```

Override TTL per request:

```bash
# Cache this result for 5 minutes only
curl "http://localhost:3000/api/ads-library/search?q=apple&cacheTTL=300000"
```

The `fromCache: true` field in the response indicates a cache hit.

---

## Hybrid API → Scrape Fallback

Each adapter implements the same fallback pattern:

```
searchAds(query, options)
  │
  ├─ source='api'  → call platform API → on error: throw (no fallback)
  │
  ├─ source='scrape' → call scraper directly
  │
  └─ source='auto' (default)
       │
       ├─ hasApiAccess() == true  → try API
       │                              └─ on failure → warn + fall through to scraper
       │
       └─ hasApiAccess() == false → use scraper directly
```

**Meta** follows this precisely: API is tried first when an `access_token` is present; on any API error the scraper is used automatically. If neither is available, a `ConfigurationError` is thrown.

**Google** defaults to scraping because the official API is for campaign management, not competitor research. `source=api` with credentials will hit the API; otherwise the scraper runs.

**TikTok** uses the public Creative Center API first (no auth needed), falls back to the scraper on failure.

The `UnifiedAdsLibraryService.search()` wraps each platform call in `Promise.allSettled`, so a failure on one platform never blocks results from the others.

---

## Configuration (Environment Variables)

No environment variables are required to run with scraping only. API credentials are stored via the application's Settings UI and read from the database at runtime via `settingsRepo.getCredentials(platform)`.

| Variable | Used By | Description |
|----------|---------|-------------|
| `NODE_ENV` | Error responses | Set to `development` to include error details in API error responses |
| `META_ACCESS_TOKEN` | Meta adapter (optional override) | Facebook Graph API access token |
| `GOOGLE_DEVELOPER_TOKEN` | Google adapter (optional override) | Google Ads developer token |
| `GOOGLE_OAUTH_TOKEN` | Google adapter (optional override) | Google Ads OAuth access token |
| `TIKTOK_ACCESS_TOKEN` | TikTok adapter (optional override) | TikTok Business API token (for own campaigns only) |

To add credentials via the settings repository instead of env vars, use the Settings page in the AdForge UI or insert directly:

```js
settingsRepo.setCredentials('meta', { access_token: 'EAAx...' });
settingsRepo.setCredentials('google', { developer_token: 'abc', oauth_token: 'ya29...' });
settingsRepo.setCredentials('tiktok', { access_token: 'act.xxx' });
```

---

## Programmatic Usage

```js
import { createUnifiedAdsLibraryService } from './server/services/unified-ads-library.js';

const service = createUnifiedAdsLibraryService();

// Search all platforms
const results = await service.search('nike', {
  platform: 'all',    // 'meta' | 'google' | 'tiktok' | 'all'
  source: 'auto',     // 'api' | 'scrape' | 'auto'
  country: 'US',
  limit: 50,
});

console.log(results.total);           // total ads across all platforms
console.log(results.totalByPlatform); // { meta: 20, google: 15, tiktok: 15 }
console.log(results.errors);          // platform errors (if any)

// Single platform
const metaResults = await service.search('adidas', { platform: 'meta' });

// Get one ad
const ad = await service.getAdDetails('meta', '123456789');

// Check what sources are configured
const sources = await service.getSources();

// Clear cache for one platform
service.clearCache('meta');

// Shutdown (closes browser instances)
await service.destroy();
```
