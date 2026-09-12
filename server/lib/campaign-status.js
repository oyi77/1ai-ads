/**
 * Campaign status predicates for the LOCAL `campaigns` table.
 *
 * `campaigns.status` is stored lower-case by every producer: the Meta/Google/
 * LinkedIn/Microsoft/Pinterest/TikTok syncs all run the provider enum through a
 * status map (`'ACTIVE'` → `'active'`), and the demo seed writes `'active'`.
 * Verified on the live database: 38 rows `active`, 276 `paused`, nothing else.
 *
 * Two kinds of caller compared against the provider's UPPER-CASE enum instead —
 * background schedulers filtering `c.status === 'ACTIVE'` and the admin/status
 * bot commands counting the same way. Those compares were never true, so the
 * campaign monitor, the daily eval guard and the bot's active-campaign counters
 * silently processed zero campaigns while reporting success.
 *
 * UPPER-CASE values still appear in the codebase where they belong: request
 * bodies for the ad platforms (Meta rejects `'active'`) and the rule UIs.
 * Anything reading the local table belongs here.
 */

/** Normalized local status of a campaigns row. */
export function normalizeCampaignStatus(status) {
  return String(status ?? '').trim().toLowerCase();
}

/** True when a local campaigns row is delivering. Case/whitespace tolerant. */
export function isActiveStatus(status) {
  return normalizeCampaignStatus(status) === 'active';
}

/** Keep only delivering campaigns. */
export function filterActiveCampaigns(campaigns) {
  return (Array.isArray(campaigns) ? campaigns : []).filter(c => isActiveStatus(c?.status));
}
