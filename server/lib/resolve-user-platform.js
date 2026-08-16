/**
 * Resolve the API token for a platform request as the REQUESTING USER's own
 * bound token (multi-tenant / SaaS), falling back to the system/global token
 * only when the user has no bound account.
 *
 * Mirrors the Meta precedent in routes/campaigns.js (resolveUserMetaApi):
 * every user binds and uses their own token; the system token is a shared
 * fallback, never a cross-user leak.
 *
 * @param {string} platform — platform key (e.g. 'linkedin', 'twitter')
 * @param {object} req — Express request (carries req.user from requireAuth)
 * @param {object} platformAccountsRepo — PlatformAccountsRepository
 * @param {object} settingsRepo — settings repository (system token source)
 * @returns {string|null} access token, or null if neither is configured
 */
export function resolveUserPlatformToken(platform, req, platformAccountsRepo, settingsRepo) {
  const userId = req.user?.id;
  if (userId && platformAccountsRepo?.getByPlatform) {
    try {
      const acct = platformAccountsRepo.getByPlatform(userId, platform);
      if (acct?.access_token) return acct.access_token;
    } catch {
      // fall through to system token
    }
  }
  const sys = settingsRepo?.getCredentials?.(platform);
  if (typeof sys === 'string' && sys.length > 0) return sys;
  if (sys?.access_token) return sys.access_token;
  return null;
}
