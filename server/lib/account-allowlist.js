/**
 * Account allowlist for autonomous mutations.
 *
 * Pattern from TensorOpsAI/YieldAgent:
 * - AD_ACCOUNTS_ALLOWED: comma-separated `platform:accountId` entries.
 *   A wildcard `platform:*` (or `*`) allows any account on that platform.
 * - Unset = allow all (backward-compat with existing deployments).
 * - AUTONOMOUS_ALLOW_LIVE=1 is required for any action that sets a live
 *   campaign status to ACTIVE or scales budget up (>0).
 *
 * No dependency on config/index.js — reads env directly so rule-evaluator
 * tests can set/reset env vars without config-cache interference.
 */

export function isAccountAllowed(platform, accountId, _userId) {
  const raw = process.env.AD_ACCOUNTS_ALLOWED;
  if (!raw || !raw.trim()) return true;
  const plat = String(platform ?? '').toLowerCase();
  const id = String(accountId ?? '');
  for (const entry of raw.split(',')) {
    const sep = entry.indexOf(':');
    if (sep < 1) continue;
    if (entry.slice(0, sep).trim().toLowerCase() !== plat) continue;
    const allowed = entry.slice(sep + 1).trim();
    if (allowed === '*' || allowed === id) return true;
  }
  return false;
}

export function allowLive() {
  return process.env.AUTONOMOUS_ALLOW_LIVE === '1';
}
