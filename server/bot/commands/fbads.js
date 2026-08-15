/**
 * /fbads command — alias of the per-user /ads handler.
 *
 * Kept for backward compatibility; now scopes to the user's OWN connected
 * Meta account (via MetaAdsAPI.withToken from platform_accounts) instead of
 * the global FB_SYSTEM_TOKEN. The real implementation lives in ads.js.
 */
export { handleAds as handleFbAds } from './ads.js';
