# ADR-001: Multi-Platform Ad Integration Architecture

## Status: Accepted

## Date: 2026-06-09

## Context

The platform needed to support all major advertising platforms beyond Meta, Google, and TikTok. Users expect unified campaign management across LinkedIn, Pinterest, Snapchat, Twitter/X, and Microsoft/Bing Ads.

## Decision

Implement all platform integrations as service classes extending a shared `BasePlatformApiClient` base class, with per-platform route handlers and unit tests following an identical pattern.

### Pattern

```
BasePlatformApiClient (server/lib/base-platform-api.js)
  ├── MetaAdsAPI       (server/services/meta-api.js)
  ├── GoogleAdsAPI     (server/services/google-ads-api.js)
  ├── TikTokAdsAPI     (server/services/tiktok-api.js)
  ├── LinkedInAdsAPI   (server/services/linkedin-ads-api.js)
  ├── PinterestAdsAPI  (server/services/pinterest-ads-api.js)
  ├── SnapchatAdsAPI   (server/services/snapchat-ads-api.js)
  ├── TwitterAdsAPI    (server/services/twitter-ads-api.js)
  └── MicrosoftAdsAPI  (server/services/microsoft-ads-api.js)
```

### Standardized Interface

All platforms implement:
- `getCampaigns(accountId, opts)` — list campaigns
- `createCampaign(accountId, params)` — create campaign
- `updateCampaign(campaignId, updates)` — update campaign
- `syncAllAccounts()` — full sync returning `{ account, campaigns, insights, syncedAt }`

### Wiring

Services instantiated in `server/app/services.js`, routes mounted in `server/app/routers.js`.

## Consequences

### Positive
- New platforms follow a copy-adapt pattern (200-300 lines each)
- Unified sync format enables cross-platform analytics
- Per-platform test isolation via mocked `safeFetch`
- Base class handles token injection, HTTP methods, error types

### Negative
- Each platform API has quirks requiring `_get`/`_post` overrides
- LinkedIn version headers, Twitter response wrapping, TikTok nested data, Microsoft SOAP-like patterns
- Token refresh varies by platform (some use refresh tokens, some require re-auth)

### Risk Mitigation
- `ConfigurationError` for missing credentials (graceful degradation)
- `PlatformError` for API failures (surfaced to UI)
- Circuit breaker pattern in base fetch for resilience
- Per-platform test coverage ensures no silent regressions

## Platforms Added

| Platform | API Base URL | Auth Method | Test Count |
|----------|-------------|-------------|------------|
| LinkedIn | api.linkedin.com/rest | Bearer + version headers | ~40 |
| Pinterest | api.pinterest.com/v5 | Bearer | ~40 |
| Snapchat | adsapi.snapchat.com/v1 | Bearer | ~38 |
| Twitter/X | ads-api.twitter.com/12 | Bearer | ~40 |
| Microsoft | ads.microsoft.com/api/v13 | Bearer + dev token | ~40 |
