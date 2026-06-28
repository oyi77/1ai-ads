/**
 * Platform Plugin Interface — expected methods for all platform API clients.
 *
 * This is a documentation contract, not enforced at compile time (JS has no
 * interfaces). validatePlatform() enforces it at discovery time so a missing
 * method surfaces as a loud startup error rather than a silent runtime crash.
 *
 * Required methods:
 *   getAccounts()            → Promise<Array<{id, name, currency}>>
 *   getCampaigns(accountId)  → Promise<Array<Campaign>>
 *   createCampaign(accountId, data) → Promise<{campaignId}>
 *   updateCampaign(accountId, campaignId, data) → Promise<{campaignId}>
 *   syncAllAccounts()        → Promise<Array<SyncResult>>
 *
 * Optional methods (platforms may implement these):
 *   getAdCreatives(accountId)
 *   getAudiences(accountId)
 *   getCampaignAnalytics(accountId, opts)
 */

export const PLATFORM_METHODS = [
  'getAccounts',
  'getCampaigns',
  'createCampaign',
  'updateCampaign',
  'syncAllAccounts',
];

/**
 * Validate that a platform instance implements all required interface methods.
 *
 * @param {object} instance — a platform API client instance
 * @returns {true} if valid
 * @throws {Error} if any required method is missing
 */
export function validatePlatform(instance) {
  const missing = PLATFORM_METHODS.filter(m => typeof instance[m] !== 'function');
  if (missing.length) {
    const name = instance.platformName || instance.constructor?.name || 'unknown';
    throw new Error(
      `Platform plugin "${name}" missing required methods: ${missing.join(', ')}`
    );
  }
  return true;
}
