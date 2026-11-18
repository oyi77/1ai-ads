/**
 * Campaign Action Envelope (Phase 3c).
 *
 * Platform-independent action schema so MCP tools, the orchestrator, and the
 * action gateway speak one language:
 *
 *   { platform, accountId, campaignId?, adsetId?, action, params }
 *
 * See docs/architecture-consolidation-2026-11.md §2.
 */

export const ALLOWED_ACTIONS = Object.freeze([
  'pause',
  'resume',
  'set_budget',
  'duplicate',
  'create',
  'update',
]);

const ALLOWED_SET = new Set(ALLOWED_ACTIONS);

/**
 * Validate an action envelope.
 * @param {object} input
 * @returns {{ valid: boolean, errors: string[], value: object|null }}
 */
export function validateActionEnvelope(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['envelope must be an object'], value: null };
  }

  const platform = typeof input.platform === 'string' ? input.platform.trim().toLowerCase() : '';
  if (!platform) errors.push('platform is required');

  const accountId = input.accountId ?? input.account_id;
  if (accountId === undefined || accountId === null || accountId === '') {
    errors.push('accountId is required');
  }

  const action = typeof input.action === 'string' ? input.action.trim().toLowerCase() : '';
  if (!action) {
    errors.push('action is required');
  } else if (!ALLOWED_SET.has(action)) {
    errors.push(`unsupported action "${action}" (allowed: ${ALLOWED_ACTIONS.join(', ')})`);
  }

  const params = input.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params) || params === null) {
    errors.push('params must be an object');
  }

  // campaignId required for everything except create
  const campaignId = input.campaignId ?? input.campaign_id ?? null;
  if (action && action !== 'create' && !campaignId) {
    errors.push(`campaignId is required for action "${action}"`);
  }

  if (errors.length > 0) return { valid: false, errors, value: null };

  return {
    valid: true,
    errors: [],
    value: {
      platform,
      accountId: String(accountId),
      campaignId: campaignId ? String(campaignId) : null,
      adsetId: (input.adsetId ?? input.adset_id) || null,
      action,
      params,
    },
  };
}

/**
 * Normalize a provider result into the gateway's response shape.
 * Guarantees callers always see { ok, ... } and never a raw provider error.
 * @param {string} platform
 * @param {string} action
 * @param {any} result
 * @returns {{ ok: boolean, platform: string, action: string, result?: any, reason?: string, message?: string }}
 */
export function normalizeActionResult(platform, action, result) {
  if (result && typeof result === 'object' && 'ok' in result) {
    return { platform, action, ...result };
  }
  return { ok: true, platform, action, result };
}
