/**
 * Resolve the API token for a platform request as the REQUESTING USER's own
 * bound token (multi-tenant / SaaS).
 *
 * Strict per-user isolation: when the user has no bound account this returns
 * `null`. It does NOT fall back to a shared system/global token — doing so
 * would be a silent cross-user leak (one user's request borrowing another
 * tenant's operational credentials).
 *
 * @param {string} platform — platform key (e.g. 'linkedin', 'twitter')
 * @param {object} req — Express request (carries req.user from requireAuth)
 * @param {object} platformAccountsRepo — PlatformAccountsRepository
 * @param {object} [_settingsRepo] — retained for caller signature compat; unused
 * @returns {string|null} access token, or null when the user has no bound account
 */
export function resolveUserPlatformToken(platform, req, platformAccountsRepo, _settingsRepo) {
  const userId = req.user?.id;
  if (userId && platformAccountsRepo?.getByPlatform) {
    try {
      const acct = platformAccountsRepo.getByPlatform(userId, platform);
      if (acct?.access_token) return acct.access_token;
    } catch {
      // no bound account → strict per-user isolation: do NOT borrow system token
    }
  }
  return null;
}
