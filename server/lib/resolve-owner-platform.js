import { isAccountTokenUsable } from './token-health.js';

/**
 * Resolve the API token for a platform mutation as the RESOURCE OWNER's own
 * bound token (multi-tenant / SaaS). Strict per-user isolation: returns null
 * when the owner has no bound account. NEVER falls back to a shared
 * system/global token — that was a silent cross-user leak.
 *
 * This is the background-execution counterpart of
 * `resolveUserPlatformToken` (used in request paths). Background jobs
 * (RuleEvaluator, AutoOptimizer) act on a campaign/rule that belongs to a
 * specific user; they MUST use that user's token — never a system singleton
 * and never another user's token.
 *
 * @param {string} platform — platform key (e.g. 'meta', 'google', 'tiktok')
 * @param {string|null} ownerId — the campaign/rule owner's user id
 * @param {object} repos — container with platformAccountsRepo (settingsRepo ignored)
 * @returns {string|null} access token, or null if owner has no bound account
 */
export function resolveOwnerPlatformToken(platform, ownerId, repos) {
  const platformAccountsRepo = repos?.platformAccountsRepo;
  if (ownerId && platformAccountsRepo?.findAllActiveByUserAndPlatform) {
    try {
      const accounts = platformAccountsRepo.findAllActiveByUserAndPlatform(ownerId, platform);
      // Prefer an account whose credential is believed to work. This used to
      // take the FIRST account holding any token, so a user whose first account
      // was expired had every scheduler run against that dead token - even when
      // a reconnected account sat right behind it. Falls back to the first
      // token-bearing account when no health data is known yet.
      const usable = accounts.find(a => a?.access_token && isAccountTokenUsable(a));
      const found = usable || accounts.find(a => a?.access_token);
      if (found) return found.access_token;
    } catch {
      // no bound account → strict per-user isolation: do NOT borrow system token
    }
  }
  return null;
}
