# AdForge — Phase 7 Delivery Plan (2026-11-18)

Authoritative companion to `docs/architecture-consolidation-2026-11.md`. This
is the execution plan for the remainder of the mission; the architecture doc
holds the design, this holds the how and when.

## 1. Executive summary

Phase 1 closed 14 production defects across 9 commits (test baseline 205
files / 2335 passing, up from 202/2287). Phase 2 verified 8 reference repos
and drove three adopt/adapt decisions now shipped inline. Phase 3 begins the
architecture consolidation — PolicyEngine and trust tier are the first
primitives landing.

The remaining mission work is 4–6 engineering days across five tracks. No
track requires external credentials, no destructive DB change, and every
change is additive with a documented rollback.

## 2. Current system architecture

See `docs/architecture.md` (refreshed 2026-08-27) for the full picture.
Highlights:
- Express 5 ESM, Node 22, SQLite (WAL) with 55 migrations, PostgreSQL path
  documented in `MIGRATION-POSTGRES.md`.
- 83 services, 22 platform adapters, 12 repositories, MCP server + SSE.
- React 18 + TypeScript SPA, Playwright e2e, 200+ vitest suites.
- Auth: JWT + refresh + httpOnly cookies + CSRF origin check + API-key path.
- Background: 7 schedulers, bot cron jobs, webhook batch processor (DLQ).

## 3. Verified defect register (Phase 1)

Closed in `c17c99d`..`a563b88`. Reproductions live in the test files named
per defect (e.g., `tests/unit/services/autonomous-agent.test.js`,
`tests/unit/services/mcp-server.test.js`). See `docs/CHANGELOG.md` 1.6.1–1.6.3
for the register with file:line evidence. Two items deliberately not fixed:
DEF-11 (opt-in cached gate instead of global JWT check) and
DEF-17 (Meta OAuth dedupe — done, `7cf3028`).

## 4. Feature capability matrix

Available in `docs/PARITY-ROADMAP.md` + `docs/COMPETITIVE_GAP_ANALYSIS.md`
(2026-08 refresh). Status refresh appended to `GAP-RESOLUTION-PLAN.md` 2026-
11-18. Key updates: CSRF shipped, Fase 9–14 still open, Phase 1 closed 14
defects.

## 5. Open-source comparison matrix

Verified via `gh api` on 2026-11-17. Full detail in
`memory/adforge-audit-20261117.md` (repo-local memory). Headline:

| Repo | Stars | License | Verdict |
|---|---|---|---|
| browser-use/browser-use | 121k | MIT | INTEGRATE (optional browser fallback) |
| luukalleman/meta-ads-system | 31 | none | REJECT code (no license) |
| attainmentlabs/meta-ads-mcp | 17 | MIT | ADAPT — clean safety model, no tests |
| TensorOpsAI/YieldAgent | 13 | MIT | ADOPT — draft-only + allowlist + live flag |
| RoyAzran/mcp-ads | 4 | MIT | INTEGRATE later — multi-platform |
| themagicmkt/sobe-tudo | 5 | MIT | REJECT — Vercel dashboard, localStorage keys |
| getmcpads-com/meta-ads-mcp-server | 2 | Apache-2.0 | ADOPT patterns (55 tools, preview gates) |
| aria-agentworks/ariaagent-solutions | 0 | MIT | REJECT |

## 6. Adopt/Adapt/Integrate/Implement decisions

- **ADOPT** getmcpads preview/confirm pattern → ported into
  `services/meta/index.js` (`_verifyWrite`, `assertOwnsAccount`,
  `toMinorUnits`).
- **ADOPT** YieldAgent allowlist + live-flag pattern →
  `lib/account-allowlist.js`, `rule-evaluator._executeAction`.
- **ADAPT** getmcpads zero-decimal currency list → `toMinorUnits` (IDR
  included via lib/money.js legacy).
- **INTEGRATE** browser-use → Phase 4. Optional browser fallback only after
  API-parity adapter missing.
- **IMPLEMENT** PolicyEngine, idempotency keys, trust tier, action envelope —
  no open-source project covers our approval-first + multi-platform +
  approval_drafts shape.
- **REJECT** sobe-tudo (insecure key handling), ariaagent (no tests/safety),
  meta-ads-system (no license).

## 7. Target architecture

See `docs/architecture-consolidation-2026-11.md`.

## 8. Prioritized implementation phases

| Phase | Scope | Effort | Status |
|---|---|---|---|
| **P1 Hardening** | 14 defects, DEF-01..DEF-17 | 4 d | ✅ DONE (a563b88) |
| **P2 Research** | 8 reference repos, verdicts | 1 d | ✅ DONE |
| **P3a PolicyEngine + tier** | Unify 4 gates, trust tier column | 1.5 d | 🟡 In progress |
| **P3b Idempotency keys** | Mutating routes | 0.5 d | ⏳ Next |
| **P3c Action envelope** | Platform-independent schema | 3 d | ⏳ Queued |
| **P3d State reconciliation** | Cron re-sync | 1 d | ⏳ Queued |
| **P3e Grafana dashboards** | JSON models for DEF-14 metrics | 0.5 d | ⏳ Queued |
| **P4 Browser fallback + cross-network** | browser-use + adjustBid/shiftSpend | 3 d | ⏳ |
| **P5 AI video generation** | External service wiring | 3 d | ⏳ |

## 9. File-level change proposals (P3)

| File | Change |
|---|---|
| `db/migrations/056_user_autonomy_tier.sql` | ALTER TABLE users ADD COLUMN autonomy_tier / budget_remaining / budget_reset_at |
| `server/lib/policy-engine.js` | New PolicyEngine class |
| `server/services/rule-evaluator.js` | Wire optional PolicyEngine before existing gates |
| `server/app/services.js` | Instantiate PolicyEngine with usersRepo + auditRepo |
| `tests/unit/lib/policy-engine.test.js` | ≥10 cases covering all branches |
| `db/migrations/057_idempotency_keys.sql` | New table |
| `server/middleware/idempotency.js` | Read/write key from header |
| `server/routes/campaigns.js`, `ads.js`, `wizards.js` | Apply middleware |
| `server/domain/actions.js` | New envelope type + dispatcher |
| `services/<platform>/index.js` (22) | `executeAction(envelope)` + not_supported fallback |
| `server/services/reconciliation-cron.js` | Nightly campaign-state re-sync |

## 10. Dependencies and migrations

- Migration runner: `db/migrations/index.js` (55 files, BEGIN/COMMIT/ROLLBACK).
- New migrations 056 (autonomy tier), 057 (idempotency keys) — additive, no
  destructive columns. Drop = `ALTER TABLE users DROP COLUMN autonomy_tier`
  + `DROP TABLE idempotency_keys`.
- prom-client v15 added (Phase 1) for DEF-14. No new runtime deps in P3a/P3b.

## 11. Security and operational risks

| Risk | Mitigation |
|---|---|
| Trust tier grants too much autonomy | Daily budget cap (default 20), per-action audit row, bot command to downgrade |
| Idempotency key collision | Key scoped per-user, expires after 24h, action_hash check prevents wrong-key replay |
| PolicyEngine regression on hot path | 10+ unit tests + existing allowlist/live-flag tests must stay green |
| Action envelope breaks existing routes | Envelope is additive; existing orchestrator paths unchanged |

## 12. Test strategy and acceptance criteria

- Every new module: ≥10 vitest unit tests covering happy path, blocked
  branches, and error path.
- PolicyEngine: property test — for every combination of tier × allowlist ×
  live flag × action type, `evaluate` returns one of three valid outcomes.
- Idempotency: Playwright e2e fires the same create-campaign twice, asserts
  one row in `campaigns`.
- Action envelope: contract test over all 22 adapters, asserting not_supported
  shape instead of throw.
- Reconciliation: cron runs in dry-run mode by default; integration test on
  sandbox account.

## 13. Rollback procedures

- **Code:** `git revert <sha>` (each commit is one concern).
- **DB:** migrations are additive; `ALTER TABLE users DROP COLUMN autonomy_tier;
  DROP TABLE idempotency_keys;` — no data loss.
- **Runtime:** `SCHEDULERS_DISABLED=1` env stops all background schedulers
  instantly (proven kill switch).
- **API:** feature-flag `POLICY_ENGINE_ENABLED=0` bypasses PolicyEngine and
  falls through to legacy gates.

## 14. Estimated complexity and expected impact

- Total remaining effort: ~9 engineering days (P3a–P3e + P4 + P5).
- Highest impact: P3a PolicyEngine (closes 4 gate code paths into one).
- Highest risk: P3c action envelope (22 file touches).
- P0 defects: 0 remaining. Security posture materially improved by Phase 1.

## 15. What already exists vs what is missing

For each improvement in sections 7 and 8, the answer is documented in
`docs/architecture-consolidation-2026-11.md` §Current State and §Target
Primitives. Reference implementations to reuse: getmcpads (preview gates,
readback), YieldAgent (allowlist + budget cap + audit trail), browser-use
(only if P4 browser fallback needed).
