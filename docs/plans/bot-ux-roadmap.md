# 1ai-ads (AdForge) Telegram Bot UX Roadmap

> **Target spec source**: user-pasted Indonesian product flowchart (2026-08-23):
> `/start` → MENU UTAMA `[Dashboard][Buat Kampanye][Monitor][AI Optimize][Setting]`;
> Setting = OAuth 2.0 connect 8 platforms; Dashboard aggregates + normalizes all platforms;
> Buat Kampanye = wizard; Monitor = per-platform actions; AI Optimize = LLM → `[Apply]`;
> Scheduler = dry-run → Telegram confirm → execute.
>
> **This diagram is the TARGET, not the current build.** Every phase below was derived by
> reading source first (not from the diagram). The bot is a *thin Telegram front-end over the
> web dashboard (`/app`)* — most flows correctly defer to `/app`.

---

## 1. Verified architecture facts (ground truth)

| Fact | Evidence |
|---|---|
| Bot + web are the **same process** | `server/app.js:174` `initBot(app, { repos, services })`; `server/bot/index.js:53` `bot.context.services = deps.services` |
| Handlers reach `ctx.services.draftService` / `ctx.services.ruleEvaluator` **in-process** — NO HTTP hop | same as above |
| `approval_drafts` columns | `server/repositories/drafts.js:15-28` — `id, type, summary, details_json, proposed_by, status, reviewed_at, reviewed_by, rejection_reason, execution_result, created_at, updated_at` + **`user_id`** (migration 028, P2). `proposed_by`/`reviewed_by` are free-text, default `'ai'`. |
| `DraftsRepository.create({type, summary, details, proposedBy, userId, campaignId, approvalRequestId})` | `drafts.js:53-60` (`userId` added P2); `findByUser(userId, {status})` added P2 |
| `approveDraft(id, userId, executionResult=null)` | `draft-service.js:42` — only checks `status==='pending'`; records `reviewedBy`. **No owner-scoping** |
| `rejectDraft(id, userId, rejectionReason=null)` | `draft-service.js:82` — same, no owner-scoping |
| `guardAutonomousChange({type, summary, details, proposedBy='ai', userId=null, campaignId=null})` | `draft-service.js:99` — stamps `userId`; returns created draft when approval ON, `false` otherwise |
| Executor already wired | `server/app/services.js` (~L94) `draftService.setExecutor((action, campaign) => _ruleEvaluator._applyAction(action, campaign))` |
| `guardAutonomousChange` gates on GLOBAL `approval_required` (settings, migration 025), NOT per-rule | `draft-service.js:100` `if (!settingsRepo.getApprovalRequired()) return false` — separate from `autonomous_rules.user_id` (used only for ownership routing). |
| `autonomous_rules` table EXISTS (per-rule; has `user_id`) | `rules.js:10` `this.table='autonomous_rules'`; `:110` `countEnabled(userId)` → `WHERE user_id = ? AND enabled = 1`. Scheduler loop (`scheduler.js:215`) iterates `rule` rows that carry `user_id` for ownership. |
| Scheduler job #5 "Rule Guard" creates owner-scoped drafts + Telegram Approve/Reject | `scheduler.js:231-277` — `guardAutonomousChange({…, userId: rule.user_id})` → inline keyboard `approval:approve:<id>` / `approval:reject:<id>`; no telegram_id → admin `TELEGRAM_CHAT_ID` alert fallback |
| Per-rule owner used for draft + notification routing | `scheduler.js:215,220` loop has `rule.user_id`; resolved to `telegram_id` via `usersRepo.getTelegramIdByUserId` (P2) |
| Web approval routes are **admin-gated** | `server/routes/approvals.js:53` `POST /api/approvals/:id/approve` `requireAuth, requireAdmin` |
| `/platforms` deep-link from bot is **DEAD** | `start.js:34` links `adforge.aitradepulse.com/platforms`; `client/src/App.tsx` has lazy import but **no `<Route>`** → `*` NotFound |
| `/settings` deep-link is **VALID** | `start.js:80,85` → `App.tsx:67` |
| AI Optimize is **stubbed** | `menu.js:115-126` `handleOptimizeAction` — no LLM call, no Apply; replies "use web dashboard /app" |
| Connect = token/API-key **PASTE**, Meta only live | `connect-account.js` |
| API envelope unwrapped client-side | `client/src/lib/api.ts:97` `(json.data ?? json) as T` |

---

## 2. Gap table (target vs current)

| Target (diagram) | Current | Phase |
|---|---|---|
| `/start` → MENU UTAMA | `/start` gates menu behind connect picker | **P1** |
| Setting = OAuth 8 platforms | Token paste, Meta only; `/platforms` 404 | **P1** (route) / **P4** (OAuth) |
| Dashboard aggregates all platforms | Meta-only, no aggregation | **P5** |
| Buat Kampanye = wizard | "use /app" stub | keep /app (ensure deep-link works) |
| Monitor = per-platform actions | Meta-only (`/ads`) | (out of scope; Meta works) |
| AI Optimize → LLM → Apply | stub | **P3** |
| Scheduler → Telegram confirm → execute | alert-only to admin | **P2** |

---

## 3. Phase plan

### Phase 1 — Menu-first + dead-route fix (lowest risk, kills broken handoff)
**Goal**: `/start` shows MENU UTAMA immediately; Setting shows a "1 action needed" badge if no active account; `/platforms` deep-link resolves instead of 404.

**Todos**
1. `client/src/App.tsx`: add `<Route path="/platforms" element={<PlatformsPage/>}/>` inside the `RequireAuth`/Shell group, **before** the `*` catch-all. (Lazy import already exists.)
2. `server/bot/commands/start.js`: stop gating the menu behind connect; render MENU UTAMA with nav buttons `[Dashboard][Buat Kampanye][Monitor][AI Optimize][Setting]`. Add badge on ⚙️ Setting when `platformAccountsRepo.getByPlatform(userId,'meta')` is empty.
3. `menu.js`: ensure Dashboard/Monitor empty-states render (no crash on zero accounts).
4. Verify `/platforms` no longer 404 (browser-navigate the live URL or assert the Route exists).
5. Lint: `npm run lint`. Test: `npm run test`. Deploy: `docker compose up -d --build` (NEVER `--no-cache`). Verify `/health` → 200 + sha256 parity.

**Acceptance**: `/start` returns menu without forcing connect; `/platforms` returns 200 (not NotFound); lint + vitest green.
**Rollback**: `git revert` + rebuild. Pure UI/route change, no DB.

### Phase 2 — Scheduler dry-run → owner Telegram Approve/Reject
**Goal**: autonomous rule evaluation creates an owner-scoped `approval_draft` and sends the **owning user** (not admin) a Telegram Approve/Reject; approving executes via the existing in-process executor.

**Gating (resolved this session)**: `approval_drafts` has no `user_id`; `guardAutonomousChange` has no `userId`. Both must change.

**Todos**
1. Migration `db/migrations/028_approval_drafts_user_id.sql`: `ALTER TABLE approval_drafts ADD COLUMN user_id TEXT;` (nullable; harmless if left). Provide down note (`ALTER TABLE … DROP COLUMN` requires SQLite ≥3.35 — verify; else leave column).
2. `server/repositories/drafts.js`: `create()` accepts `userId` → `INSERT … user_id`. Add `findByUser(userId, {status})` helper.
3. `server/services/draft-service.js`: `guardAutonomousChange({type, summary, details, proposedBy='ai', campaignId=null, userId=null})` → stamp `userId` into the draft.
4. `server/bot/scheduler.js`: in the rule loop (`scheduler.js:215-240`) replace the `safeSend` alert with:
   - `const draft = await draftService.guardAutonomousChange({type:'autonomous', summary, details:{action, campaign}, proposedBy:'ai', campaignId:campaign.id, userId: rule.user_id})`
   - resolve `rule.user_id` → `telegram_id` (usersRepo); send Telegram message with inline keyboard `✅ Approve` / `❌ Reject` → callbacks `approval:approve:<id>` / `approval:reject:<id>`.
   - Keep admin alert as a fallback when `telegram_id` missing.
5. `server/bot/commands/approvals.js` (new): callbacks `approval:approve:<id>` / `approval:reject:<id>`:
   - **Owner-scoping**: load draft; if `draft.user_id && draft.user_id !== ctx.userId` → reply "Not your draft" + stop. (Keeps web admin `requireAdmin` flow untouched — admin may still approve any draft via `/api/approvals`.)
   - On approve: `draftService.approveDraft(id, ctx.userId)` → executor runs `_applyAction`. On reject: `draftService.rejectDraft(id, ctx.userId, reason)`.
6. Wire `approvals.js` in `server/bot/index.js` (same pattern as `ads.js`).
7. `server/repositories/users.js`: confirm/add `getTelegramIdByUserId(userId)` (or `getByUserId`).
8. Tests: `tests/unit/services/draft-service.test.js` (userId stamped; owner-scoping helper); `tests/unit/bot/approvals.test.js` (owner-only reject of foreign draft; approve executes).
9. Lint + test + deploy + verify as P1.

**Acceptance**: a triggered rule creates an `approval_draft` with `user_id`; owning user receives Telegram Approve/Reject; approve mutates the campaign via the executor; a different user's approve is rejected.
**Status: IMPLEMENTED (2026-08-23)** — migration 028; `DraftsRepository` userId + `findByUser`; `DraftService` userId passthrough + missing-`await` fix; scheduler job #5 rule→draft→owner Telegram; `server/bot/commands/approvals.js` + `index.js` callbacks; 3 test files. Gates: lint exit 0; vitest **1751/1751** (113 files).
**Deviation from step 5 text**: ownership guard is **fail-closed** — `draft.user_id !== ctx.userId` (no null short-circuit), so ownerless/legacy drafts are rejected for everyone (stricter than the `draft.user_id &&` fail-open sketch; matches `ads.js:288`). `approveDraft`/`rejectDraft` remain unscoped by design (§5) so the web admin route keeps working.

### Phase 3 — AI Optimize → Apply (reuses P2 infra)
**Goal**: `AI Optimize` produces a real suggestion draft (owner-scoped) and an inline `Apply` button; Apply executes via the same executor.

**Todos**
1. `menu.js` `handleOptimizeAction`: call `ruleEvaluator`/optimizer to get a suggestion for the user's active Meta campaign; create an owner-scoped draft via `guardAutonomousChange({…, userId})`; send Telegram message with `✅ Apply` (`approval:approve:<id>`) / `❌ Dismiss` (`approval:reject:<id>`).
2. Reuse Phase 2 `approvals.js` callbacks (no new code).
3. Tests: `tests/unit/bot/menu.test.js` (optimize creates draft + Apply button).
4. Lint + test + deploy + verify.

**Status: IMPLEMENTED (2026-08-23)** — `handleOptimizeAction` (menu.js:115-167) resolves the owner's active Meta campaign with the **lowest ROAS** (`roas` number, else `spend>0 ? revenue/spend : 0`), creates an owner-scoped draft via `guardAutonomousChange({ type:'ai_optimize', summary, details:{action:{type:'pause'}, campaign}, proposedBy:'ai', userId:ctx.userId, campaignId })`, and replies with `✅ Apply` (`approval:approve:<id>`) / `❌ Dismiss` (`approval:reject:<id>`). New test file `tests/unit/bot/menu.test.js` (7 cases). Gates: lint exit 0; vitest **1758/1758** (114 files).
**Deviation from Todos**: suggestion is **deterministic worst-ROAS pause**, not LLM — no LLM client exists in bot-command `deps`. Action is replayable: `details.action = { type:'pause' }` (OBJECT) so the P2 executor (`_applyAction` → `ACTION_HANDLERS.pause` → `_pauseCampaign`) re-fetches by `campaign.id` and pauses the real Meta campaign; a flat-string `details.action` would log "Unknown action type" and no-op. Guard-false branch replies with `/app` Settings hint (no keyboard).

**Rollback**: revert `menu.js` to stub + rebuild.

### Phase 4 — Hybrid OAuth connect (largest; decision point)
**Target wants in-bot OAuth 2.0 for 8 platforms.** The bot is a thin frontend; building a full OAuth redirect server in-bot is high-risk.

**Recommended (pragmatic)**: Setting → per-platform "Connect" buttons that **deep-link to `/app/settings?platform=<p>`** (web already does real OAuth). Bot shows status (connected/empty) read from `platform_accounts`. Meta stays in-bot token paste (already live). This satisfies "connect 8 platforms" without a second OAuth server.
**Alternative** (heavy): add Google/LinkedIn in-bot OAuth — bot sends OAuth URL → user pastes `code` → server exchanges via env `client_id/secret`. Meta unchanged.

**Todos (recommended path)**
1. `start.js`/`menu.js` Setting: list 8 platforms with connected/empty status; each "Connect" → `https://adforge.aitradepulse.com/settings?platform=<p>` (valid route, `App.tsx:67`).
2. Confirm `/settings` renders a per-platform connect UI (web side; likely exists).
3. Keep Meta in-bot paste as-is.

**Acceptance**: all 8 platforms reachable for connect from the bot; no 404; Meta still works in-bot.
**Rollback**: revert menu/start + rebuild.

### Phase 5 — Cross-platform normalization (enhancement, Meta-first)
**Goal**: Dashboard/Monitor aggregate a common metric shape across platforms; Meta rich, others "Coming soon".

**Todos**
1. `server/services/metrics-normalizer.js` (new): map each platform's raw stats → `{spend, revenue, roas, impressions, clicks, conversions}` common shape.
2. Dashboard API + frontend: aggregate normalized metrics; show "Coming soon" for platforms without sync.
3. Tests: `tests/unit/services/metrics-normalizer.test.js`.

**Acceptance**: Dashboard shows combined metrics for connected platforms; Meta populated, others flagged.
**Rollback**: revert + rebuild.

---

## 4. Standing verification gate (every phase)
- `npm run lint` (eslint `server/`) — **separate** from test; both must pass.
- `npm run test` (vitest run only).
- Deploy: `docker compose up -d --build` (NO `--no-cache` — better-sqlite3 native gyp breaks under Node v22.23.2).
- Live verify: `curl /health` → 200; `docker exec 1ai-ads sha256sum /app/<f>` vs `git show <sha>:<f> | sha256sum` → MATCH.
- Full suite green: `npm run test` → **1758 passed / 1758** (114 files), 2026-08-23. (`tests/unit/repositories/settings.test.js` no longer fails; P3 added `tests/unit/bot/menu.test.js` 7 cases.)

## 5. Open items
- `approveDraft` owner-scoping is enforced in the **bot callback** (Phase 2 step 5), NOT inside `approveDraft`, to keep the admin web route working. Decision recorded; do not move scoping into `approveDraft`.
| Advisory reconciliation (2026-08-23): an assertion that "there is NO `autonomous_rules` table" is **false** — verified `rules.js:10` + `:110`. The table exists and carries `user_id`. Valid advisory points already reflected: `guardAutonomousChange` keys off the global `approval_required` setting flag, and `approveDraft`/`rejectDraft` have zero ownership scoping (any Telegram user could approve any draft by id) — Phase 2 adds the `user_id` linkage + ownership check as **required** new scope, not existing behavior. |
- Phase 4 path is a **recommendation** pending user sign-off (in-bot OAuth vs deep-link). Default = deep-link.
