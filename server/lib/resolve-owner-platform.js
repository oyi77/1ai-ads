import { isAccountTokenUsable } from './token-health.js';

/**
 * Resolve the API token for a platform mutation as the RESOURCE OWNER's own
 * bound token (multi-tenant / SaaS), falling back to the system/global token
 * only when the owner has no bound account.
 *
 * This is the background-execution counterpart of
 * `resolveUserPlatformToken` (used in request paths). Background jobs
 * (RuleEvaluator, AutoOptimizer) act on a campaign/rule that belongs to a
 * specific user; they MUST use that user's token — never a system singleton
 * and never another user's token.
 *
 * @param {string} platform — platform key (e.g. 'meta', 'google', 'tiktok')
 * @param {string|null} ownerId — the campaign/rule owner's user id
 * @param {object} repos — container with platformAccountsRepo + settingsRepo
 * @returns {string|null} access token, or null if neither is configured
 */
export function resolveOwnerPlatformToken(platform, ownerId, repos) {
  const platformAccountsRepo = repos?.platformAccountsRepo;
  const settingsRepo = repos?.settingsRepo;

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
      // fall through to system token
    }
  }
  const sys = settingsRepo?.getCredentials?.(platform);
  if (typeof sys === 'string' && sys.length > 0) return sys;
  if (sys?.access_token) return sys.access_token;
  return null;
}
