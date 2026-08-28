# ADR-002: Plugin/Provider Pattern for Platform Services

> **Status:** Accepted · **Refreshed:** 2026-08-28 (verified against `server/platforms/index.js` + `server/routes/_platforms.js`)

## Context
1ai-ads integrates **22** advertising platform APIs. Originally `server/platforms/index.js` dual-purposed as factory + static re-export barrel (every class re-exported), causing tight coupling, no interface contract, and frontend duplication.

## Decision
### 1. Remove static re-exports
`server/platforms/index.js` is now a **pure registry + factory**. No concrete-class re-exports. Consumers (`server/app/services.js`) import platform classes directly from `services/<platform>/index.js`.

### 2. Interface contract — `server/lib/platform-interface.js`
Five required methods (verified present): `getAccounts()`, `getCampaigns(accountId, opts)`, `createCampaign(accountId, data)`, `updateCampaign(accountId, campaignId, data)`, `syncAllAccounts()`. `validatePlatform(instance)` checks at runtime.

### 3. Validate at discovery
`getPlatform()` / `getPlatformSync()` (platforms/index.js:75) call `validatePlatform()` on construction → startup crash on interface violation (fail-fast).

### 4. Method-name aliases
Ten platforms used non-standard `getAccounts` names (Meta `getAdAccounts`, Google `listAccounts`, TikTok `getAdvertiserInfo`, Amazon `getProfiles`, etc.). Each got a one-line `getAccounts()` alias.

### 5. API-driven frontend platform list ✅ VERIFIED
`GET /api/platforms` exists (`server/routes/_platforms.js:43`, mounted under `requireAuth`). Frontend `client/src/lib/platforms.ts` `fetchPlatforms()` pulls live list, static fallback for offline/SSR.

## Consequences
- **Positive:** single source of truth (manifests), fail-fast, loose coupling, backward-compatible aliases.
- **Negative:** every platform must implement 5 methods (some stubs, e.g. WhatsApp `updateCampaign` errors).
- **Neutral:** new platform = `manifest.js` + `index.js`, no extra wiring (auto-discovered by `readdirSync` scan).

> This ADR supersedes the "20 platforms" count in its original text — current is **22**. ADR-001 covers the base-class decision this refines.
