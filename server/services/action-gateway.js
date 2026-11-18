/**
 * Action Gateway (Phase 3c).
 *
 * Single entry point for every mutating ad action. Validates the envelope
 * (server/domain/actions.js), asks PolicyEngine for a decision, then
 * dispatches to the platform adapter. Unsupported adapter capabilities
 * return `{ ok: false, reason: 'not_supported' }` — they never throw, so
 * all 22 adapters can be addressed through one contract.
 *
 * See docs/architecture-consolidation-2026-11.md §2.
 */

import { createLogger } from '../lib/logger.js';
import { validateActionEnvelope, normalizeActionResult } from '../domain/actions.js';

const log = createLogger('action-gateway');

/**
 * Map envelope actions onto adapter method names. Each adapter may implement
 * any subset; a missing method yields not_supported.
 */
const ACTION_TO_METHOD = {
  pause: 'updateCampaign',
  resume: 'updateCampaign',
  set_budget: 'updateCampaign',
  duplicate: 'duplicateCampaign',
  create: 'createCampaign',
  update: 'updateCampaign',
};

export class ActionGateway {
  /**
   * @param {Object} adapters - { [platform]: adapterInstance }
   * @param {Object} policyEngine - optional PolicyEngine
   * @param {Object} options
   * @param {boolean} options.auditOnly - when true, skip dispatch after policy
   *   approval (dry-run helper for simulation/tests).
   */
  constructor(adapters = {}, policyEngine = null, options = {}) {
    this.adapters = adapters;
    this.policyEngine = policyEngine;
    this.auditOnly = options.auditOnly === true;
  }

  /**
   * Execute one action envelope.
   * @param {object} envelope - { platform, accountId, campaignId?, adsetId?, action, params }
   * @param {object} actor - { userId, role, tier }
   * @param {object} context - { source, requestId }
   * @returns {Promise<object>} always { ok: boolean, ... }
   */
  async execute(envelope, actor = {}, context = {}) {
    const v = validateActionEnvelope(envelope);
    if (!v.valid) {
      log.warn('Invalid action envelope', { errors: v.errors });
      return { ok: false, reason: 'invalid_envelope', errors: v.errors };
    }

    const { platform, accountId, campaignId, adsetId, action, params } = v.value;

    // 1. Policy gate — must approve or the action never reaches the adapter.
    if (this.policyEngine) {
      const decision = this.policyEngine.evaluate({
        actor,
        action: { type: action, platform, accountId, campaignId, params },
        context,
      });
      if (decision.blocked) {
        log.info('Action blocked by policy', { platform, action, reason: decision.reason });
        return { ok: false, reason: decision.reason || 'policy_blocked', policy: decision };
      }
      if (decision.requireApproval) {
        log.info('Action requires approval', { platform, action, reason: decision.reason });
        return { ok: false, reason: 'require_approval', policy: decision };
      }
    }

    if (this.auditOnly) {
      return { ok: true, platform, action, audit_only: true };
    }

    // 2. Adapter resolution
    const adapter = this.adapters[platform];
    if (!adapter) {
      return { ok: false, reason: 'not_supported', platform, action };
    }

    const method = ACTION_TO_METHOD[action];
    if (!method || typeof adapter[method] !== 'function') {
      return { ok: false, reason: 'not_supported', platform, action };
    }

    // 3. Dispatch — map envelope to adapter method arguments.
    try {
      const raw = await this._invoke(adapter, method, action, {
        accountId, campaignId, adsetId, params,
      });
      return normalizeActionResult(platform, action, raw);
    } catch (err) {
      log.error('Action dispatch failed', { platform, action, error: err.message });
      return { ok: false, reason: 'platform_error', platform, action, message: err.message };
    }
  }

  async _invoke(adapter, method, action, { accountId, campaignId, adsetId: _adsetId, params }) {
    switch (action) {
      case 'pause':
      case 'resume':
        return adapter.updateCampaign(campaignId, {
          status: action === 'pause' ? 'PAUSED' : 'ACTIVE',
        });
      case 'set_budget':
        return adapter.updateCampaign(campaignId, {
          daily_budget: params.daily_budget ?? params.budget,
          ...(params.currency ? { currency: params.currency } : {}),
        });
      case 'update':
        return adapter.updateCampaign(campaignId, params);
      case 'create':
        return adapter.createCampaign(accountId, {
          name: params.name,
          objective: params.objective,
          status: params.status || 'PAUSED', // explicit PAUSED default
          dailyBudget: params.dailyBudget ?? params.daily_budget,
          currency: params.currency,
        }, params.userId);
      case 'duplicate':
        return adapter.duplicateCampaign(accountId, campaignId, {
          suffix: params.suffix || ' (Copy)',
          name: params.name,
        });
      default:
        return { ok: false, reason: 'not_supported', action };
    }
  }
}

export function createActionGateway(adapters, policyEngine, options) {
  return new ActionGateway(adapters, policyEngine, options);
}

export default ActionGateway;
