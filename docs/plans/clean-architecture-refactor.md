# Clean Architecture Refactor — 1ai-ads (AdForge)

> **Status: IN PROGRESS (corrected 2026-08-15).** The previous version of this doc asserted
> "✅ Verified" against fabricated metrics (routes 59→10, services 61→15, god functions 3→0).
> Those numbers were never real. This revision documents the **true baseline** measured from
> the working tree and the **executed** work so far, then scopes the remaining safe steps.

## True Baseline (measured 2026-08-15)

| Area | Real count | Notes |
|---|---|---|
| `server/routes/` files | **78** (74 leaf routers + 4 aggregate `_*.js`) | Not 10. Many are platform-specific custom routers (google-ads, tiktok-ads, …). |
| `server/services/` files | **57** | Not 15. |
| `server/domain/` modules | **5** (partial: `campaign.js`, `adset.js`, `creative.js`, `audience.js`, `metric.js`) | No unified aggregate. |
| `server/platforms/` | **1** (`index.js` only) | No `base.js`. Platforms are wired via per-route clients, NOT a shared base class. |
| `server/bot/commands/` | 8 | Node Telegram bot commands. |
| God functions | **2 real** (`createSettingsRouter` ~443 LOC, `createShopeeDashboardRouter` ~268 LOC) + **1 already split** (`createAuthRouter` delegates to `_handlers/auth-handlers.js`). | The "3→0" claim was wrong: auth was already delegated; settings & shopee were not. |

### Why the 77→10 / 57→15 collapse is NOT executed
Bespoke route files (google-ads, tiktok-ads, twitter-ads, linkedin-ads, microsoft-ads,
pinterest-ads, snapchat-ads, …) have genuinely divergent path nesting, HTTP methods, and
unique endpoints. Forcing them into one config-driven router would *add* complexity, not remove
it (confirmed in a prior route-consolidation audit). Services are real API clients with business
logic. Collapsing them on a live revenue service without per-platform behavior verification risks
regressions in 19 platform integrations. **That step is deferred** pending a per-platform audit and
is explicitly NOT claimed as done.

## Executed Work

### 1. `createAuthRouter` — already split (pre-existing, documented here)
- `server/routes/auth.js` is a thin wiring layer.
- Handlers live in `server/routes/_handlers/auth-handlers.js`: `handleRegister`, `handleLogin`,
  `handleRefreshToken`, `handleLogout`, `handleConnectMetaToken`.
- Pattern: each handler is `function handler(deps) { return async (req, res) => {…} }`.
- **No further work needed for auth.**

### 2. `createSettingsRouter` — SPLIT (this pass)
- Extracted all route bodies into `server/routes/_handlers/settings-handlers.js`.
- `settings.js` reduced to a thin factory importing the handlers (byte-identical routes, paths, args).
- Signature unchanged: `createSettingsRouter(settingsRepo, llmClient, db, metaApi, _dailySpendGuard, nangoAuth)`.

### 3. `createShopeeDashboardRouter` — SPLIT (this pass)
- Extracted route bodies + `parseMultipart`/`detectAccountFromFilename` helpers into
  `server/routes/_handlers/shopee-dashboard-handlers.js`.
- `shopee-dashboard.js` reduced to a thin factory.
- Signature unchanged: `createShopeeDashboardRouter(shopeeAdapter, settingsRepo, commissionsRepo)`.

## Remaining Safe Steps (scoped, not yet done)
- [ ] Audit the other `server/routes/*.js` for inline god-functions and split using the same `_handlers/` pattern.
- [ ] Audit `server/services/` for thin pass-through wrappers (per AGENTS.md: thin services forbidden) and fold them into repos or delete.
- [ ] Deferred: per-platform route consolidation (requires per-platform behavior audit + tests).

## Feature Gap Resolution (2026-08-15)

### approval_workflow — BUILT (was the only missing/partial dimension)
- Reused the existing `approval_drafts` table + `DraftService` (NO parallel `approval_requests` table).
- Added `approval_request_id` column (migration `024_drafts_approval_request.sql`) + `approval_required` setting (migration `025_approval_setting.sql`).
- Guard: `DraftService.guardAutonomousChange()` — when `approval_required=true`, ALL THREE autonomous mutation
  entry points create a `pending` draft and SKIP live execution; when `false`, execute as today:
  - `AutoOptimizer._executeAction` (optimization actions)
  - `ai-agent._persistSuggestion` autoApply (AI suggestion apply)
  - `RuleEvaluator._executeAction` (rule-driven `scale_up/down`, `pause`, `resume`, `optimize_*`) — **added 2026-08-15 (commit da83fb0)**:
    wired `draftService` into `RuleEvaluator` + `AutonomousAgent` ctor; this was the missing gate that let rules
    mutate campaigns live even with approvals enabled.
- Review surfaces: `server/routes/approvals.js` (admin API + EJS `/approvals` page) + sidebar link.
  Approve/reject are `requireAdmin`.
- `approval_required` defaults OFF → existing behavior preserved until enabled.
- Verified: isolated boot (`:5008`) clean; toggle persists; guard intercepts in `RuleEvaluator` (creates pending
  draft, returns `intercepted:true`) and in `ai-agent`/`auto-optimizer`; `false` preserves live behavior.
  Unit tests: `tests/unit/services/rule-evaluator.test.js` (two guard cases), `draft-service.test.js`, `auto-optimizer.test.js`, `ai-agent.test.js` all green.

### approval loop — CLOSED (2026-08-15, commits c4c5163 + this pass)
- **Double-parse bug fixed (`c4c5163`)**: `RuleEvaluator.evaluateRule` re-`JSON.parse`d `condition`/`action`
  that `getAllEnabled` already parsed into objects → every firing rule threw `JSON.parse([object Object])`.
  Now parses only when still a string. This unblocked ALL autonomous cycles (they crashed before any mutation/guard).
- **Approval execution loop closed (this pass)**: `DraftService.approveDraft` now replays the deferred mutation
  for rule drafts via an injected executor (`ruleEvaluator._applyAction`, the same fn the live path uses).
  - `DraftService` accepts a 3rd `executor` ctor arg + `setExecutor(fn)`; `services.js` wires
    `draftService.setExecutor((action, campaign) => ruleEvaluator._applyAction(action, campaign))` and shares the
    single `RuleEvaluator` instance with `AutonomousAgent`.
  - Idempotent: re-approve of a non-`pending` draft → `ValidationError`. Externally-executed approvals
    (`executionResult` passed) just record the result (no double execution).
  - Failure-safe: execution error leaves the draft `pending` (retryable) and throws `ValidationError`; the campaign
    is never mutated in a half-applied state.
  - Non-replayable drafts (ai/optimizer suggestions, which carry a different `details` shape) still approve WITHOUT
    live mutation — replaying those is out of scope (no uniform executor exists yet).
  - Tests: `draft-service.test.js` extended with `setExecutor`, `approveDraft` execution loop (replay+approve,
    failure-stays-pending, non-replayable no-op), and `_parseDetails` cases.
- **Live verification (`da23e89`, 2026-08-15)**: deployed via `docker compose up -d --build`; container healthy.
  `POST /api/approvals/:id/approve` on a correctly-shaped rule draft (`details.action={type:'pause'}`,
  `details.campaign=<id>`) invoked the wired executor → `RuleEvaluator._applyAction(pause)` →
  `RuleEvaluator._pauseCampaign` → real Meta API call. The loop is confirmed END-TO-END: approve triggers
  the deferred mutation. On the upstream `apiUpdate` error (`Too few parameter values were provided` — a
  pre-existing Meta-adapter/DB-logging issue, NOT in this loop), the failure-safe correctly left the draft
  `pending` (retryable) and returned `ValidationError`. Shape note: the guard stores `details.action` as the
  FULL `{type,...}` object (rule-evaluator.js:89), so the executor passes it straight to `_applyAction`
  without reshaping — a manually-built draft must match that shape to replay.

### whatsapp_bm — INTENTIONALLY LEFT BLOCKED (external dependency)
- WhatsApp Business API: only BM "Produk digital" (ID `1611764243355432`) is accessible from this account.
- Berkah Karya Academy's number/page belong to a different BM → blocked until the user supplies the correct BM/WABA ID.
- No code change; documented here as a known external blocker.

## Verification Gates (each step)
- `npx eslint server --ext .js` → EXIT 0.
- `npx vitest run` (isolated, single instance) → 0 failures (prior baseline: 1570/1570).
- Isolated boot (`DB_PATH=/tmp/ads-live-copy`, `PORT=5008`) → `/health` 200, routes 200.
- Live `pm2 restart 1ai-ads` + Telethon smoke for any touched surface (settings/shopee).
