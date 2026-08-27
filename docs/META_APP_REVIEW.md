# Meta Developer App Review — AdForge AI

> **App ID:** 704618995979962
> **App Name:** AdForge
> **Domain:** https://adforge.aitradepulse.com
> **Refreshed:** 2026-08-27 (prev: June 2026 — STALE: wrong stack, wrong business model, wrong scopes)
> **Why this matters:** Meta approval is the **scale gate** for multi-account. Without it, AdForge stays single-token. This is P0 for "best in industry."

---

## 1. Executive Summary (CORRECTED)

AdForge is a **hosted, multi-tenant SaaS** ad-management platform for SMBs and agencies in Southeast Asia (Indonesian affiliate marketers, e-commerce brands, agencies managing 3–10 client accounts). It is **NOT** self-hosted-per-user; a single AdForge instance (`adforge.aitradepulse.com`) serves many users, each isolated by `user_id` (verified: `server/lib/resolve-owner-platform.js:3`, `bot/scheduler.js:507` plan-expiry billing).

What we do: unified dashboard to create campaigns, track performance, apply automation rules, and generate creatives with AI — across Meta, Google, TikTok, LinkedIn, and 18+ adapters. Actions are **default approval-first**; an optional autonomous tier executes user-configured rules with a full audit trail.

**Business model:** self-serve plans (Free / Pro) via Duitku checkout + plan gating (commit `238da0b`). Users own their ad accounts and tokens; we never co-mingle credentials.

---

## 2. Permissions Requested — ACTUAL (from `server/routes/auth.js:40`)

```js
const fbScope = 'email,ads_management,ads_read,business_management,'
  + 'pages_show_list,pages_read_engagement,pages_manage_ads,'
  + 'pages_manage_metadata,pages_manage_posts';
```

> ⚠️ **The June doc listed only 3 scopes and explicitly claimed we DON'T request `pages_*`. That is false and would fail review.** The real request is 9 scopes. Justify ALL of them below.

| Scope | Needed? | Justification (must match code use) |
|---|---|---|
| `ads_management` | ✅ | Create/update campaigns, adsets, adcreatives, ads; pause/scale via API |
| `ads_read` | ✅ | Insights API for dashboard KPIs; account discovery |
| `business_management` | ✅ | System-User token + agency multi-account enumeration |
| `pages_show_list` | ✅ | Ad accounts are discovered via `/me/accounts` (Pages). Required to list a user's ad accounts |
| `pages_read_engagement` | ⚠️ verify | Needed if reading Page-level engagement for ad context. **If only used for ad creatives, consider dropping** |
| `pages_manage_ads` | ⚠️ verify | Required to publish ads that belong to a Page. Likely needed for campaign creation |
| `pages_manage_metadata` | ⚠️ verify | Used for Page metadata during ad setup. **Confirm necessity; drop if unused** |
| `pages_manage_posts` | ⚠️ verify | **Highest-risk scope** — implies posting to Page feeds. AdForge creates *ads*, not Page posts. **Strongly recommend removing unless a feature genuinely needs it** |
| `email` | ⚠️ verify | Requested but doc previously said "not needed." Either justify (account identity) or remove for least-privilege |

**Action (owner + eng):** Run a least-privilege pass. Remove `pages_manage_posts` and any unused `pages_*` / `email` unless a code path requires them. Meta rewards minimal scope. Update `auth.js:40` and this table together.

---

## 3. How The App Works (ACCURATE)

### 3.1 Auth & Account Setup
1. User registers at `/register` (bcrypt + JWT). Self-serve plan via Duitku.
2. **Meta Accounts** → "Connect Facebook" → OAuth (`auth.js:44`) with the 9 scopes above.
3. Code↔token exchange, long-lived token, **AES-256-GCM encrypted** at rest (`server/lib/crypto.js`).
4. `/me/accounts` lists ad accounts (needs `pages_show_list`).

### 3.2 Campaign Creation (Draft-First)
1. User fills objective/budget/targeting/creative → saved as **DRAFT** locally.
2. "Approve & Publish" → sequential Marketing API calls (campaigns → adsets → adcreatives → ads).

### 3.3 Automation — HONEST DESCRIPTION (Meta §3.2 human oversight)
- **Default:** approval-first. Rules create a draft action; user approves before API call.
- **Autonomous tier:** user-enabled rules CAN auto-execute pause/budget via `auto-optimizer.js:147,173` and `autonomous-agent.js:64 runAutonomousMode()`.
- **Oversight safeguards (must be stated in review):**
  - Every mutation is **user-configured** (user wrote the rule), not vendor-decided.
  - Full **audit log** of every action (`server/middleware/audit.js`, mounted before routes).
  - Per-user scoping; rules only run on accounts the user owns.
  - Rate-limited (Meta ≤5 req/s; see §6).
- **Roadmap:** tiered autonomy (trust mode) is planned (`GAP-RESOLUTION-PLAN.md` T3) — set-and-forget only after N verified actions.

> Do NOT claim "no action reaches API without approval" — that is false post-autonomous-mode. Frame as "user-authored rules, audit-logged, default approval-gated."

### 3.4 Monitoring
Dashboard polls Insights (configurable, ≤5 min). KPIs: Spend, ROAS, CTR, CPC. Color-coded.

---

## 4. Data Handling & Privacy (RECONCILED)

**Architecture:** Node.js (Express) API `:5000` + Vite/React client (NO Flask — June doc wrong).

| Data | Storage | Notes |
|---|---|---|
| User credentials (bcrypt) | SQLite/Postgres | per-user |
| Platform access tokens | AES-256-GCM encrypted | `crypto.js` |
| Ad account IDs, campaign data, metrics | DB | 90-day rolling purge (`data-cleanup.js`) |
| AI drafts | DB | 30-day |

**Risks to close before submit (from `COMPLIANCE-AUDIT.md`):**
- ⚠️ Token encryption **silent fallback to plaintext** if `ENCRYPTION_KEY` unset. **Must** refuse start without it (verify in prod env).
- ⚠️ DB engine ambiguous: `1ai-ads.db` (0-byte SQLite present) + `MIGRATION-POSTGRES.md` exists. State current = SQLite; Postgres path documented.

**We do NOT:** store creative binaries on server, store FB pixel/conversion events, resell data, load analytics SDKs (CSP permits `google-analytics.com` but no GA is loaded — verified).

**Endpoints:** `/facebook/deauthorize` + `/google/deauthorize` (GET+POST, `auth.js:108,120`) → data-deletion-status. Disconnect = hard-delete credentials (COMPLIANCE-AUDIT PR #3).

---

## 5. Bot / Automated-Activity Prevention

- User-authored rules, not vendor bots.
- No auto-posting to Pages/comments/messages.
- Rate-limited per user.
- Per-user isolation (`WHERE user_id = ?`).

---

## 6. Security (Meta will probe)
| Item | Status | Action |
|---|---|---|
| AES-256-GCM tokens | ✅ | verify ENCRYPTION_KEY set in prod |
| Rate limits (Meta 5/s, Google 8/s, all platforms) | ✅ (COMPLIANCE PR #2) | confirm in `platform-client.js` |
| Audit log | ✅ | already capturing body+redaction (PR #5) |
| **CSRF protection** | 🔴 GAP | **T1 — add `middleware/csrf.js` before submit** |
| JWT secret fallback | ⚠️ | refuse start without JWT_SECRET (verify) |
| Test creds `admin/admin123` exposed in old doc | 🔴 | removed below; use staging creds |

---

## 7. Pre-Submission Checklist (ACTIONABLE)

```bash
# C1 Business verification — owner
[ ] BerkahKarya Digital business docs (NIB/Tax ID) uploaded in Meta Business Manager
[ ] App "AdForge" linked to BM, status = Verified

# C2 Public URLs resolve 200 (verify, don't assume)
[ ] curl -sI https://adforge.aitradepulse.com/privacy   → 200
[ ] curl -sI https://adforge.aitradepulse.com/terms      → 200
[ ] curl -sI https://adforge.aitradepulse.com/data-deletion → 200
[ ] OAuth redirect URI registered: /api/auth/facebook/callback

# C3 Least-privilege scopes (eng)
[ ] Review auth.js:40 — drop pages_manage_posts + unused pages_*/email
[ ] Re-test connect flow with reduced scope

# C4 Security gates
[ ] CSRF middleware live (T1) — curl POST without token → 403
[ ] ENCRYPTION_KEY + JWT_SECRET required at boot (prod env)
[ ] Rate limits confirmed in platform-client.js

# C5 Honest review narrative
[ ] Use §3.3 automation description (user-authored, audit-logged, default approval-gated)
[ ] Screenshots: login, connect, draft-first create, dashboard, settings, data-deletion

# C6 Submit
[ ] Submit for App Review (ads_management + business_management categories)
[ ] Respond to Meta questions within 24h
```

---

## 8. Business Verification
- **Company:** BerkahKarya Digital (Indonesia)
- **Type:** Digital agency + SaaS tools
- **Status:** ⏳ Business verification IN PROGRESS — **C1 is the top blocker.**

## 9. Contact
- Dev: @codergaboets (Telegram)
- Repo: https://github.com/oyi77/1ai-ads

---
> Refreshed 2026-08-27 from code audit (`auth.js`, `auto-optimizer.js`, `resolve-owner-platform.js`, `COMPLIANCE-AUDIT.md`). The June version contained false claims (Flask stack, no-SaaS, 3 scopes) that would have failed review. Cross-refs: `COMPETITIVE_GAP_ANALYSIS.md`, `GAP-RESOLUTION-PLAN.md` (T1 CSRF, T3 trust mode).
