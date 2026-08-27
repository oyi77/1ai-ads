# Compliance Audit — AdForge vs Ad Platform Policies

> **Refreshed:** 2026-08-27 (prev: 1 July 2026). Method: code audit with file:line receipts, not assumption.
> **Scope:** Meta, Google, TikTok, LinkedIn, Twitter, Snapchat, Pinterest, Microsoft.
> **Gate:** This audit + `META_APP_REVIEW.md` + `GAP-RESOLUTION-PLAN.md` (T1 CSRF) must be green before app-review submission.

---

## 1. Summary (RECONCILED)

The 1-Jul audit concluded **"TIDAK COMPLIANT, must fix before submit."** A 2026-08-27 code audit shows **all CRITICAL rate-limit items, all HIGH data/encryption items, and the empty-catch MEDIUM are RESOLVED in code.** The doc's own pre-submit checklist was right; its summary was stale.

**Remaining real risks (do not submit without these):**
1. 🔴 **`google-scraper.js`** still scrapes Google Ads Transparency Center (Google ToS §3) — present & wired (`unified-ads-library.js:24`). Outstanding.
2. ⚠️ **Automation oversight** — autonomous mode executes pause/budget (`auto-optimizer.js:147,173`); must be disclosed honestly in Meta review (Meta §3.2). Not a violation if framed as user-authored + audit-logged + default approval-gated.
3. 🔴 **CSRF protection absent** (`server/middleware/` has no `csrf.js`) — review-risk. Tracked as T1.

---

## 2. Verified Resolution Table

| # | Original finding | Severity | Status | Receipt |
|---|---|---|---|---|
| 2 | Google rate limit 50/s (limit 10) | CRIT | ✅ Resolved | `platform-client.js:8` = `RateLimiter(8,1000)` |
| 6 | Meta rate limit 30/s | CRIT | ✅ Resolved | `platform-client.js:7` = `RateLimiter(5,1000)` |
| 10 | Per-platform limiters missing | HIGH | ✅ Resolved | `platform-client.js:9-14` (TikTok/LinkedIn/Twitter/Snap/Pinterest/MS) |
| 5 | Disconnect = soft delete (creds kept) | HIGH | ✅ Resolved | `platform-accounts.js:160` `DELETE FROM platform_accounts` |
| 4 | Token encryption plaintext fallback | HIGH | ✅ Resolved | `config/index.js:103`, `crypto.js:20` **throw** if unset |
| 7 | Perf history never purged | HIGH | ✅ Resolved | `data-cleanup.js` 90-day purge |
| 9 | 15+ empty catch blocks | MED | ✅ Resolved | `grep "catch(...) {}"` = **0** |
| 8 | `autonomous_rules` missing user_id | MED | ✅ Resolved (PR#3) | `rules.js` `WHERE user_id=?` |
| 11 | Audit log no request body | MED | ✅ Resolved (PR#5) | `audit.js` captures + redacts body |
| 12 | Test JWT secret fallback | MED | ✅ Resolved | `auth.js:11` **throws** if unset |
| 3 | Automation w/o per-action consent | CRIT | ⚠️ By-design | approval-first default + audit; disclose in review (§3) |
| 1 | Google Transparency scraping | CRIT | 🔴 **OUTSTANDING** | `web-scraper/google-scraper.js` ← `unified-ads-library.js:24` |
| — | CSRF protection | HIGH | 🔴 Gap | no `middleware/csrf.js` → T1 |

---

## 3. Outstanding Actions (ACTIONABLE)

### A1 — Google scraper (🔴 blocker for Google Ads API review)
```bash
# Verify what the scraper actually hits
grep -rniE "adstransparency|transparencycenter|puppeteer|goto\(" server/services/web-scraper/google-scraper.js | head
```
- If it hits `adstransparency.google.com` → **ToS §3 violation**. Either:
  - (a) disable the scraper path (`source='api'` only in `unified-ads-library.js`), or
  - (b) replace with official **Google Ads Library API** (no scraping).
- Owner: eng · Verify: competitor-spy path returns data via API, not Puppeteer.

### A2 — CSRF (T1)
Add `server/middleware/csrf.js`, mount after auth, before routes. Client sends `X-CSRF-Token`. Verify: `curl -X POST` without token → 403.

### A3 — Honest automation narrative (Meta §3.2)
Use `META_APP_REVIEW.md` §3.3 wording: user-authored rules, full audit trail, default approval-gated, autonomous tier optional with owner consent. Do NOT claim "no action without approval" (false post-autonomous-mode).

---

## 4. Pre-Submission Consolidated Checklist

```bash
# Security
[ ] CSRF live (T1) — POST without token → 403
[ ] Server refuses start without ENCRYPTION_KEY + JWT_SECRET (config/index.js)
[ ] Rate limits confirmed: meta 5/s, google 8/s (platform-client.js)

# Platform policy
[ ] google-scraper disabled or on official API (A1)
[ ] Automation disclosed per META_APP_REVIEW §3.3 (A3)
[ ] Disconnect hard-deletes creds (platform-accounts.js:160)

# Public endpoints (verify resolve 200)
[ ] /privacy  /terms  /data-deletion  (curl -sI)
[ ] /api/auth/facebook/deauthorize + /google/deauthorize

# Submit
[ ] Meta App Review (META_APP_REVIEW.md checklist C1–C6)
[ ] Google Ads API review (after A1)
```

---

## 5. Cross-References
- `META_APP_REVIEW.md` — review narrative + scope correction
- `GAP-RESOLUTION-PLAN.md` — T1 (CSRF), T3 (trust mode / oversight tie-in)
- `COMPETITIVE_GAP_ANALYSIS.md` — why approval-first + Telegram-native = differentiator
