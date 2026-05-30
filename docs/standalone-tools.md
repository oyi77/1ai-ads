# Standalone Tools Decision

**Date**: 2026-05-30
**Status**: DECIDED

## Tool Inventory

| Directory | Purpose | Decision | Rationale |
|-----------|---------|----------|-----------|
| `adforge-dashboard/` | Separate dashboard app | **ARCHIVE** | Duplicate of main app dashboard (`client/src/views/dashboard.js`) |
| `adforge-generator/` | Ad generation tool | **ARCHIVE** | Duplicate of main app AI generation (`server/services/ad-generator.js`, `creative-studio.js`) |
| `ads-optimizer/` | Python spend optimizer | **KEEP (external)** | Standalone Python script for Facebook Ads spend optimization. Runs independently. |
| `shopee-ads-optimizer/` | Shopee + FB Ads governor | **KEEP (integrated)** | Valuable niche tool. Shopee adapter already in `server/services/shopee-adapter.js`. Attribution system in place. |
| `opencli-adapter/` | CLI interface | **KEEP** | Provides CLI access to API. Documented in `IMPLEMENTATION_SUMMARY.md`. |

## Action Items

1. **Archive adforge-dashboard/** — Move to `backups/archived-tools/` (no data loss)
2. **Archive adforge-generator/** — Move to `backups/archived-tools/`
3. **Keep ads-optimizer/** — Document as external tool in README
4. **Keep shopee-ads-optimizer/** — Already integrated via `shopee-adapter.js` and `attribution-service.js`
5. **Keep opencli-adapter/** — Documented CLI wrapper

## Notes

- `adforge.db` was already canonical (server.js defaults to it)
- `1ai-ads.db` was 0 bytes — archived to `backups/`
- Shopee integration is substantial: `shopee-adapter.js` (6.6K), `attribution-service.js` (3.8K), `attribution` table in DB
