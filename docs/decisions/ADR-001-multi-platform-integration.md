# ADR-001: Multi-Platform Ad Integration Architecture

> **Status:** Accepted · **Date:** 2026-06-09 · **Refreshed:** 2026-08-28 (counts + filenames corrected)

## Context
Support all major ad platforms beyond Meta/Google/TikTok. Unify campaign management across LinkedIn, Pinterest, Snapchat, Twitter/X, Microsoft, and later Amazon + 13 more.

## Decision
All platform integrations are **service classes extending `BasePlatformApiClient`** (`server/lib/base-platform-api.js`), each in `server/services/<platform>/index.js` with a sibling `manifest.js`. Routes mount per-platform handlers; unit tests follow identical pattern.

### Pattern (CORRECTED filenames)
```
BasePlatformApiClient (server/lib/base-platform-api.js)
  ├── MetaAdsAPI       (server/services/meta/index.js)
  ├── GoogleAdsAPI     (server/services/google/index.js)
  ├── TikTokAdsAPI     (server/services/tiktok/index.js)
  ├── ... (22 adapters total)
  └── AmazonAdsAPI     (server/services/amazon/index.js)  ← retail-media partial
```

### Standardized Interface (`server/lib/platform-interface.js`)
Every platform MUST implement 5 methods (validated at discovery by `platforms/index.js → validatePlatform`):
- `getAccounts()` (aliased from native `getAdAccounts`/`listAccounts`/`getProfiles`/…)
- `getCampaigns(accountId, opts)`
- `createCampaign(accountId, data)`
- `updateCampaign(accountId, campaignId, data)`
- `syncAllAccounts()`

## Consequences
- **Positive:** copy-adapt pattern (~200–300 LOC/platform), unified sync schema → cross-platform analytics, fail-fast on missing interface.
- **Negative:** platform quirks need `_get`/`_post` overrides; some methods are stubs (WhatsApp `updateCampaign` errors).
- **Risk mitigation:** `ConfigurationError` (missing creds), `PlatformError` (API fail), circuit-breaker in base fetch, per-platform mocked `safeFetch` tests.

## Platforms (current = 22)
| Platform | Base URL | Auth | Notes |
|----------|----------|------|-------|
| Meta | graph.facebook.com | Access token / System User | Full CRUD + Insights |
| Google | googleads.googleapis.com | OAuth + dev token | Full CRUD |
| TikTok | business-api.tiktok.com | Bearer | Full |
| LinkedIn | api.linkedin.com/rest | Bearer + version | Full |
| Pinterest | api.pinterest.com/v5 | Bearer | Full |
| Snapchat | adsapi.snapchat.com/v1 | Bearer | Full |
| Twitter/X | ads-api.twitter.com/12 | Bearer | Full |
| Microsoft | ads.microsoft.com/api/v13 | Bearer + dev token | Full |
| Amazon | advertising-api.amazon.com | Profile token | **Partial (audit needed — T2)** |
| +13 | various | various | see `server/services/*/manifest.js` |

> See `ADR-002` for the registry/factory refinement and `architecture.md` for the full layer map.
