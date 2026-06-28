# ADR-002: Plugin/Provider Pattern for Platform Services

## Status

Accepted

## Context

The 1ai-ads platform integrates 20 advertising platform APIs (Meta, Google, TikTok, etc.). Originally, `server/platforms/index.js` served dual duty as both a dynamic factory and a static re-export barrel — every platform class was re-exported so other modules could import directly:

```js
export { MetaAdsAPI } from '../services/meta/index.js';
export { GoogleAdsAPI } from '../services/google/index.js';
// ... 18 more
```

This created several problems:

1. **Tight coupling** — consumers imported concrete classes rather than going through the factory, making it impossible to swap or decorate implementations.
2. **No interface contract** — each platform used its own method names (`getAdAccounts` vs `listAccounts` vs `getProfiles`), so the generic router assumed methods existed without verification.
3. **Drift risk** — adding a platform required touching `platforms/index.js` even though the factory already discovers platforms from `manifest.js` files.
4. **Frontend duplication** — `client/src/lib/platforms.ts` hardcoded the same 20-platform list that the server already knew about.

## Decision

### 1. Remove static re-exports

Deleted lines 129–150 from `server/platforms/index.js`. The single consumer (`server/app/services.js`) now imports platform classes directly from their service modules:

```js
import { MetaAdsAPI } from '../services/meta/index.js';
```

### 2. Define an interface contract

Created `server/lib/platform-interface.js` declaring the five required methods every platform plugin must implement:

| Method | Signature | Returns |
|--------|-----------|---------|
| `getAccounts()` | `() → Promise<Array>` | List of ad accounts |
| `getCampaigns(accountId)` | `(string, opts?) → Promise<Array>` | Campaigns for an account |
| `createCampaign(accountId, data)` | `(string, object) → Promise<{campaignId}>` | Created campaign |
| `updateCampaign(accountId, campaignId, data)` | `(string, string, object) → Promise<{campaignId}>` | Updated campaign |
| `syncAllAccounts()` | `() → Promise<Array<SyncResult>>` | Sync results |

A `validatePlatform(instance)` function checks these at runtime.

### 3. Validate at discovery time

`getPlatform()` and `getPlatformSync()` in `platforms/index.js` now call `validatePlatform()` on every newly constructed instance, turning interface violations into loud startup errors instead of silent runtime failures.

### 4. Standardize method names via aliases

Ten platforms used non-standard names for `getAccounts`:

| Platform | Native method | Alias added |
|----------|--------------|-------------|
| Meta | `getAdAccounts()` | `getAccounts()` |
| Google | `listAccounts()` | `getAccounts()` |
| TikTok | `getAdvertiserInfo()` | `getAccounts()` |
| Snapchat | `getAdAccounts()` | `getAccounts()` |
| Microsoft | `listAccounts()` | `getAccounts()` |
| Pinterest | `getAdAccounts()` | `getAccounts()` |
| Amazon | `getProfiles()` | `getAccounts()` |
| Criteo | `getAdvertisers()` | `getAccounts()` |
| The Trade Desk | `getAdvertisers()` | `getAccounts()` |
| WhatsApp | `getBusinessAccounts()` | `getAccounts()` |

Each alias delegates to the native method with a single-line wrapper.

### 5. API-driven frontend platform list

Added `GET /api/platforms` to the platform routes, returning the registry's platform metadata. The frontend's `platforms.ts` now exports a `fetchPlatforms()` function that pulls the live list at runtime, falling back to a static array for SSR/offline.

## Consequences

### Positive

- **Single source of truth** — the server registry (`manifest.js` files) is the only place that defines platforms. The frontend fetches dynamically.
- **Fail-fast** — a new platform that forgets `getAccounts()` will crash at startup, not at the first customer request.
- **Loose coupling** — `platforms/index.js` is purely a registry + factory; no re-exports.
- **Backward compatible** — native method names still work; aliases satisfy the interface.

### Negative

- Platforms must implement all five methods even if some are stubs (e.g., WhatsApp's `updateCampaign` returns an error).
- The frontend still carries a static fallback array that must be kept in sync (but drift only affects offline/SSR).

### Neutral

- Adding a new platform still requires a `manifest.js` and an `index.js` in `server/services/<platform>/`. No additional wiring.
