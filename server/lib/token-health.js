/**
 * Token-health gating for background schedulers.
 *
 * A stored platform credential can die (expired / revoked / invalidated by a
 * password change). The 6-hourly token-health cron already detects that and
 * records it on the account row (`health_status` + `last_error`), and clears
 * the flag again once the owner reconnects.
 *
 * What was missing: nothing *read* that flag. Every other scheduler kept
 * resolving the dead token and hitting the provider — the fatigue detector
 * alone produced 9 failed Meta calls per cycle against the same expired
 * accounts, forever. These helpers are the read side: schedulers skip accounts
 * whose credential is known-dead instead of burning requests and quota.
 *
 * The token-health cron itself must NOT use the "usable" filter — it is the
 * recovery path that re-verifies flagged accounts and clears the flag.
 */

/**
 * Health states that mean "this credential cannot be used until the owner
 * reconnects". 'ok', null and undefined are treated as usable so a brand-new
 * or unverified account is never permanently skipped.
 */
export const UNUSABLE_HEALTH_STATUSES = new Set([
  'expired',
  'invalid_token',
  'revoked',
  'unauthorized',
]);

/** Normalized health status of a platform_accounts row. */
export function normalizeHealthStatus(account) {
  return String(account?.health_status || '').trim().toLowerCase();
}

/**
 * True when an account's stored credential is believed to work.
 * Only a KNOWN-dead status filters an account out.
 */
export function isAccountTokenUsable(account) {
  if (!account) return false;
  // is_active is the owner's own pause switch; 0/false means disabled.
  if (account.is_active === 0 || account.is_active === false) return false;
  return !UNUSABLE_HEALTH_STATUSES.has(normalizeHealthStatus(account));
}

/** Keep only accounts whose credential is believed to work. */
export function filterUsableAccounts(accounts) {
  return (Array.isArray(accounts) ? accounts : []).filter(isAccountTokenUsable);
}

/** True when at least one account can actually be used. */
export function hasUsableAccount(accounts) {
  return filterUsableAccounts(accounts).length > 0;
}

/**
 * True when an error means the credential itself is dead (so the account should
 * be flagged and its schedulers paused).
 *
 * Deliberately conservative: a false positive silently stops a paying
 * customer's automations, so transient/provider-side failures and our own
 * internal faults are excluded.
 */
export function isTokenExpiryError(err) {
  const message = String(err?.message || err || '');
  const code = err?.code ?? err?.error?.code ?? err?.data?.error?.code;
  const subcode = err?.error_subcode ?? err?.error?.error_subcode;

  // Internal faults tell us nothing about the token.
  if (/platform map not loaded|unknown platform|not implemented|is not a function|validatePlatform/i.test(message)) {
    return false;
  }
  // Transient network / rate-limit / provider hiccups are not expiry.
  if (/timeout|timedout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket|429|too many|5\d\d|temporarily|unavailable/i.test(message)) {
    return false;
  }

  if (code === 'META_TOKEN_EXPIRED') return true;
  if (code === 190 || code === 463 || code === 110) return true;
  if (subcode === 463 || subcode === 460) return true;

  return /session has expired|access token.*(expired|invalid)|user token is expired|invalid oauth|OAuthException/i.test(message);
}

/**
 * Record that an account's credential is dead so the schedulers stop using it.
 * Best-effort: a failed bookkeeping write must never break the caller's loop.
 *
 * @param {object} platformAccountsRepo - repository with `.update(id, fields)`
 * @param {string|number} accountId - platform_accounts.id (internal UUID)
 * @param {Error|string} err - the error that proved the credential dead
 * @param {(s: string) => string} [redact] - scrubber for the stored message
 * @returns {boolean} true when the flag was written
 */
export function flagAccountTokenInvalid(platformAccountsRepo, accountId, err, redact) {
  if (!platformAccountsRepo?.update || accountId === undefined || accountId === null) return false;
  const raw = String(err?.message || err || 'token invalid');
  const message = (typeof redact === 'function' ? redact(raw) : raw).slice(0, 200);
  try {
    platformAccountsRepo.update(accountId, { health_status: 'expired', last_error: message });
    return true;
  } catch {
    return false;
  }
}
