import { createLogger } from './logger.js';
import { isAccountAllowed, allowLive } from './account-allowlist.js';

const log = createLogger('policy-engine');

// In-memory budget cache for trust tier (Phase 3: acceptable initially)
const budgetCache = new Map();

function hydrateBudget(userId) {
  // Budget will be refreshed from DB on next evaluate when reset_at passes
  // or when a mutation succeeds. For Phase 3 we accept in-memory only.
  return { remaining: 20, resetAt: null };
}

function getBudget(userId) {
  if (!budgetCache.has(userId)) {
    budgetCache.set(userId, hydrateBudget(userId));
  }
  return budgetCache.get(userId);
}

function consumeBudget(userId, amount = 1) {
  const b = getBudget(userId);
  b.remaining = Math.max(0, b.remaining - amount);
}

function resetBudgetIfNeeded(userId) {
  const b = getBudget(userId);
  if (b.resetAt && Date.now() > new Date(b.resetAt).getTime()) {
    b.remaining = 20;
    b.resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
}

export class PolicyEngine {
  constructor({ usersRepo, auditRepo }) {
    this.usersRepo = usersRepo;
    this.auditRepo = auditRepo;
  }

  /**
   * Evaluate a policy decision for an autonomous action.
   * @param {Object} input
   * @param {Object} input.actor - { userId, role, tier }
   * @param {Object} input.action - { type, platform, accountId, campaignId, params }
   * @param {Object} input.context - { source: 'rule'|'optimizer'|'mcp'|'manual', requestId }
   * @returns {Object} { allow: true } | { blocked: true, reason } | { requireApproval: true, reason }
   */
  evaluate({ actor, action, context }) {
    const requestId = context?.requestId || 'unknown';
    const source = context?.source || 'unknown';

    // 1. Kill switch — SCHEDULERS_DISABLED=1 blocks all autonomous sources
    if (process.env.SCHEDULERS_DISABLED === '1' && source !== 'manual') {
      return this._logAndReturn(
        { blocked: true, reason: 'schedulers_disabled' },
        actor, action, context, 'blocked'
      );
    }

    // 2. Resolve tier — backward compat: missing tier = 'approval_first'
    const tier = actor?.tier || 'approval_first';
    const userId = actor?.userId;
    const role = actor?.role;

    // 3. System/admin bypass (no userId = trusted system call, or role=admin)
    if (!userId || role === 'admin') {
      return this._logAndReturn(
        { allow: true },
        actor, action, context, 'allow'
      );
    }

    // 4. Account allowlist
    const platform = action?.platform;
    const accountId = action?.accountId;
    if (platform && accountId) {
      if (!isAccountAllowed(platform, accountId, userId)) {
        return this._logAndReturn(
          { blocked: true, reason: 'account_not_allowed' },
          actor, action, context, 'blocked'
        );
      }
    }

    // 5. Live-mutation flag — live actions require AUTONOMOUS_ALLOW_LIVE=1
    // unless tier = 'trust'
    const isLiveAction = this._isLiveMutation(action);
    if (isLiveAction && !allowLive() && tier !== 'trust' && tier !== 'admin') {
      return this._logAndReturn(
        { blocked: true, reason: 'live_mutation_not_allowed' },
        actor, action, context, 'blocked'
      );
    }

    // 6. Trust tier decisions
    if (tier === 'approval_first') {
      // Requires draft/approval for any live mutation
      if (isLiveAction) {
        return this._logAndReturn(
          { requireApproval: true, reason: 'approval_first_tier' },
          actor, action, context, 'require_approval'
        );
      }
      // Non-live actions (e.g., analysis, draft creation) allowed
      return this._logAndReturn(
        { allow: true },
        actor, action, context, 'allow'
      );
    }

    if (tier === 'trust') {
      // Allows within daily budget for live mutations
      if (isLiveAction) {
        resetBudgetIfNeeded(userId);
        const budget = getBudget(userId);
        if (budget.remaining <= 0) {
          return this._logAndReturn(
            { blocked: true, reason: 'trust_budget_exhausted' },
            actor, action, context, 'blocked'
          );
        }
        consumeBudget(userId, 1);
        // Note: In production, we'd also persist the budget decrement to DB.
        // For Phase 3, in-memory cache is acceptable.
      }
      return this._logAndReturn(
        { allow: true },
        actor, action, context, 'allow'
      );
    }

    if (tier === 'admin') {
      return this._logAndReturn(
        { allow: true },
        actor, action, context, 'allow'
      );
    }

    // Unknown tier — default to approval_first behavior
    return this._logAndReturn(
      { requireApproval: true, reason: 'unknown_tier_defaults_approval' },
      actor, action, context, 'require_approval'
    );
  }

  _isLiveMutation(action) {
    if (!action) return false;
    const type = action.type;
    // Actions that mutate live campaign state
    const liveTypes = new Set([
      'pause',
      'resume',
      'scale_budget',
      'increase_budget',
      'decrease_budget',
      'duplicate_campaign',
      'change_bid',
      'set_budget',
      'create_campaign',
      'update_campaign',
    ]);
    return liveTypes.has(type);
  }

  _logAndReturn(decision, actor, action, context, reason) {
    const userId = actor?.userId;
    if (this.auditRepo && userId) {
      try {
        this.auditRepo.log({
          user_id: userId,
          action: `policy_decision_${reason}`,
          resource_type: 'policy',
          resource_id: context?.requestId,
          details: JSON.stringify({
            tier: actor?.tier,
            actionType: action?.type,
            platform: action?.platform,
            accountId: action?.accountId,
            decision: decision.allow ? 'allow' : (decision.blocked ? 'blocked' : 'require_approval'),
            reason: decision.reason,
          }),
        });
      } catch (err) {
        // Never let audit failure block the decision
        log.warn('Policy audit log failed', { error: err.message });
      }
    }
    return decision;
  }
}

export function createPolicyEngine({ usersRepo, auditRepo }) {
  return new PolicyEngine({ usersRepo, auditRepo });
}

export default PolicyEngine;