# AdForge — Architecture Consolidation (Phase 3)

**Date:** 2026-11-18 · **Status:** Approved scope, incremental implementation in progress
**Baseline:** 205 test files / 2335 passing · HEAD `813e617`

## Executive Summary

Phase 1 closed 14 defects across 9 commits (see `CHANGELOG.md` 1.6.1–1.6.3 and
`GAP-RESOLUTION-PLAN.md` status refresh). Phase 2 verified 8 reference repos and
produced adopt/adapt/reject verdicts — getmcpads and YieldAgent patterns are now
ported inline. Phase 3 consolidates the runtime around four primitives that
today are scattered across services:

1. **PolicyEngine** — one place to answer "may this action run?"
2. **Action envelope** — one shape for "what action, on what target, with what
   params" so all 22 adapters can be addressed uniformly.
3. **Idempotency keys** — stop duplicate campaign creation on retry.
4. **Trust tier** — opt-in per-user autonomy level (approval-first default).

This doc is the source of truth for Phase 3 decisions. Each section lists what
already exists, what is missing, which files change, and how success is proven.

## Current State (verified)

| Concern | Today | Where |
|---|---|---|
| Rule evaluation | ✅ `rule-evaluator.js` (15-min loop) | `server/services/` |
| Auto-optimization | ✅ `auto-optimizer.js` (6-hr Pareto, wf5 gate) | `server/services/` |
| Draft-first writes | ✅ `draft-service.js` + `guardAutonomousChange` | `server/services/` |
| Account allowlist | ✅ `lib/account-allowlist.js` (Phase 1) | `server/lib/` |
| Live-mutation flag | ✅ `AUTONOMOUS_ALLOW_LIVE` gate (Phase 1) | `server/services/rule-evaluator.js` |
| LLM output schema | ✅ `lib/ai-suggestion-schema.js` (Phase 1) | `server/lib/` |
| Audit trail | ✅ `middleware/audit.js` (HTTP) + `repositories/audit-log.js` | `server/middleware/` |
| **Policy decision point** | ❌ scattered across 4 services | — |
| **Idempotency keys** | ❌ none | — |
| **Trust tier** | ❌ single `ai_autonomy_level` setting | `server/services/ai-agent.js` |
| **Action envelope** | ❌ ad-hoc per adapter | — |
| **State reconciliation** | ❌ none | — |

## Target Primitives

### 1. PolicyEngine (`server/lib/policy-engine.js`)

Single decision point. Replaces the four gates currently duplicated across
`autonomous-agent`, `rule-evaluator`, `auto-optimizer`, `mcp-server`.

```js
// returns { allow: true } | { allow: false, reason } | { requireApproval: true, draft }
PolicyEngine.evaluate({
  actor: { userId, role, tier },   // tier = 'approval_first' | 'trust' | 'admin'
  action: { type, platform, accountId, campaignId, params },
  context: { source: 'rule' | 'optimizer' | 'mcp' | 'manual', requestId },
})
```

Decision order (first deny wins):
1. **Kill switch** — `SCHEDULERS_DISABLED=1` blocks all autonomous sources.
2. **Account allowlist** — `isAccountAllowed(platform, accountId, userId)`.
3. **Live-mutation flag** — live actions require `AUTONOMOUS_ALLOW_LIVE=1`
   unless tier = `trust`.
4. **Trust tier** — `approval_first` (default) requires a draft; `trust` runs
   within per-day change budget; `admin` bypasses for manual calls.
5. **Daily change budget** — per-user counter in `user_autonomy_budget` table
   (new). Default 20/day for `trust`, ∞ for `admin`.

**What already exists:** allowlist + live flag (Phase 1). Budget counter and
tier are new.

**Files:** new `server/lib/policy-engine.js`; touched `rule-evaluator.js`,
`auto-optimizer.js`, `mcp-server.js`, `autonomous-agent.js`.

**Success:** every autonomous mutation logs a `policy_decision` audit row with
the reason code. Existing allowlist/live-flag tests keep passing.

### 2. Campaign Action Envelope (`server/domain/actions.js`)

Platform-independent schema so MCP and the orchestrator speak one language.

```js
{ platform, accountId, campaignId?, adsetId?, action, params }
// actions: pause | resume | set_budget | duplicate | create | update
```

Each adapter exposes `executeAction(envelope)` and maps internally to Graph
API / SDK calls. Adapters without an action return
`{ ok: false, reason: 'not_supported' }`.

**What already exists:** `campaign-orchestrator.js` (Meta/Google partial).
**Missing:** envelope type, per-adapter dispatch, tests for the 16 partial
adapters (they must all return the not_supported shape, never throw).

**Files:** new `server/domain/actions.js`; touched `services/<platform>/index.js`
(22 files), `services/campaign-orchestrator.js`.

**Success:** `POST /api/actions` route accepts an envelope, routes it, and
returns `{ ok, result | reason }`. Playwright e2e pauses a real test campaign
in sandbox.

### 3. Idempotency Keys (`db/migrations/056_idempotency_keys.sql`)

```sql
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action_hash TEXT NOT NULL,       -- sha256 of the envelope
  result_json TEXT,                -- cached response
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME              -- 24h default
);
CREATE INDEX idx_idem_user_created ON idempotency_keys(user_id, created_at);
```

`middleware/idempotency.js` reads `Idempotency-Key` header, hashes the body,
returns the cached result on replay, and stores the response after the first
successful call. Applies to `POST /api/campaigns/create`, `POST /api/ads`,
`POST /api/wizards/*`.

**Success:** firing the same request twice with the same key creates one
campaign. Two different keys with identical bodies create two.

### 4. Trust Tier (`db/migrations/057_user_autonomy_tier.sql`)

```sql
ALTER TABLE users ADD COLUMN autonomy_tier TEXT DEFAULT 'approval_first';
ALTER TABLE users ADD COLUMN autonomy_budget_remaining INTEGER;
ALTER TABLE users ADD COLUMN autonomy_budget_reset_at DATETIME;
```

`PolicyEngine` reads the tier; the bot gains `/settings autonomy trust|approval`.
`approval_first` is the default and the only mode for accounts younger than 30
days or with fewer than 10 successful actions.

**Success:** a `trust` user can scale budget within the daily cap without
approving each draft; an `approval_first` user still sees drafts.

## Implementation Order

| # | Item | Effort | Impact | Risk |
|---|---|---|---|---|
| 1 | PolicyEngine + tier column | 1.5 d | High — unifies 4 gates | Low (additive) |
| 2 | Idempotency keys | 0.5 d | High — stops dup spend | Low |
| 3 | Action envelope | 3 d | High — unlocks MCP breadth | Med (22 files) |
| 4 | State reconciliation cron | 1 d | Med — catches drift | Low |
| 5 | Grafana dashboards | 0.5 d | Low — visibility | Low |

Items 1 and 2 ship first (this phase). 3–5 follow once the PolicyEngine is
load-bearing.

## What is explicitly out of scope

- **Browser-use fallback** — Phase 4. Only when a platform lacks API parity.
- **Cross-network bid reallocation** — Phase 4. Needs PolicyEngine + action
  envelope landed first.
- **AI video generation** — Phase 5. External service dependency.

## Rollback

Every item is additive: new modules, new tables, new columns with defaults.
Rollback = `git revert <sha>` + drop the new table/column. Existing callers
never see a behavior change because PolicyEngine returns `allow: true` when no
tier is set (backward-compat by construction).

## Success Criteria (phase exit)

- [ ] PolicyEngine is the only gate on autonomous mutations (grep proof).
- [ ] Every autonomous action writes a `policy_decision` audit row.
- [ ] Idempotency-Key enforced on campaign/ad/wizard creation routes.
- [ ] Trust tier opt-in via bot; `approval_first` still the default.
- [ ] All 22 adapters return the not_supported shape for unknown actions.
- [ ] 2400+ tests passing, lint clean, e2e sandbox run documented.
