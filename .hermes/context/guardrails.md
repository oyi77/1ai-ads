# 1ai-ads Guardrails (Hermes Quick Reference)

> **Condensed reference.** Full rules in `SOUL.md`.

---

## 🚨 Top 10 Violations (Auto-Reject)

| # | Violation | Why Bad | Correct Pattern |
|---|-----------|---------|-----------------|
| 1 | `import requests; requests.get("https://graph.facebook.com/...")` | Bypasses engine, breaks rate limits | `fb_get()` from `vilona_trakpro_engine` |
| 2 | `os.getenv("META_ACCESS_TOKEN")` | Duplicates token logic, breaks rotation | `from vilona_trakpro_engine import ACCESS_TOKEN` |
| 3 | `/home/openclaw/...` hardcoded path | Not portable, breaks on other machines | `WORKSPACE`, `DATA_DIR` from engine |
| 4 | `console.log()` / `print()` in prod | Pollutes logs, no context | `logger.info({...}, 'msg')` from `lib/logger.js` |
| 5 | Committing `data/*.json` | Auto-regenerated, pollutes git | Already in `.gitignore` |
| 6 | Raw SQL in route/service | Breaks layered architecture | Repository only |
| 7 | `catch (e) {}` silent error | Hides bugs | Throw typed error |
| 8 | `throw new Error('...')` generic | No status, no context | `throw new NotFoundError('Resource', id)` |
| 9 | Test script in `scripts/test_*.py` | Should be in `tests/` with Vitest | `tests/unit/` or `tests/e2e/` |
| 10 | Code in root directory | Violates structure | `server/`, `client/`, `scripts/`, `tests/` |

---

## ✅ Pre-Code Checklist (Every Time)

Before writing ANY code:
- [ ] Searched `server/lib/` for existing utility?
- [ ] Checked `scripts/vilona_trakpro_engine.py` for Meta patterns?
- [ ] Read similar existing implementation?
- [ ] Confirmed file placement matches `SOUL.md`?
- [ ] Identified which layer (route/service/repo)?

---

## 🔄 During-Code Checklist

- [ ] Following exact patterns from reference files
- [ ] Using existing utilities (no re-inventing)
- [ ] Parameterized queries (no string interpolation)
- [ ] Typed errors (not generic `Error`)
- [ ] Structured logging (not `console.log`)
- [ ] Validation at boundary (Zod schema)

---

## 🧪 Pre-Commit Checklist

- [ ] `npm test` passes
- [ ] `npm run test:e2e` passes (if full-stack change)
- [ ] `git diff --stat` shows focused change
- [ ] Single logical change
- [ ] Conventional commit msg
- [ ] No scattered files

---

## 📁 File Placement Quick Ref

| What You're Writing | Where It Goes |
|---------------------|---------------|
| HTTP handler | `server/routes/` |
| Business logic | `server/services/` |
| Database query | `server/repositories/` |
| Helper function | `server/lib/` |
| Auth/middleware | `server/middleware/` |
| Meta Ads script | `scripts/` |
| Vitest test | `tests/unit/` or `tests/integration/` |
| Playwright test | `tests/e2e/` |
| State file | `data/` (gitignored) |
| Config | `server/config/` |

---

## 🎯 Engine Import Cheat Sheet

```python
# Meta Ads scripts — ALL you need:
from vilona_trakpro_engine import (
    ACCESS_TOKEN,      # Token (single source of truth)
    API,                # Graph API base URL
    ACCOUNTS,           # Account ID configs
    fb_get, fb_post,    # API helpers with retry/rate-limit
    log,                # Structured logging
    WORKSPACE, DATA_DIR # Paths (no hardcoding)
)
```

---

## 🚫 When to STOP and Ask

Stop and ask the user when:
- Ambiguous requirements (multiple valid interpretations)
- Choosing between 2+ existing patterns
- Touching files in `db/migrations/`
- Changing API contracts (routes/responses)
- Modifying auth/JWT logic
- Database schema changes
- External API integration changes

**Don't guess. Clarify.**