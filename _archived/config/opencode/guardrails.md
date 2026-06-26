# 1ai-ads — Global Guardrails (Active During Development)

> **Single source of truth for all agents.** Violations = immediate rework.

---

## 🏗️ Architecture Rules (Non-Negotiable)

### Server: Layered Architecture
```
Request → Route (thin) → Service (logic) → Repository (data) → SQLite
```
- **Routes**: `server/routes/*.js` — Validate → Delegate → Respond
- **Services**: `server/services/*.js` — Inject repos, business logic
- **Repositories**: `server/repositories/*.js` — Parameterized SQL only
- **Shared**: `server/lib/*.js` — Auth, errors, validate, logger, rate-limiter

### Scripts: Engine-Only Pattern
```python
# ✅ ALWAYS
from vilona_trakpro_engine import ACCESS_TOKEN, API, fb_get, fb_post, log, WORKSPACE, DATA_DIR

# ❌ NEVER
import requests; requests.get("https://graph.facebook.com/...")
import os; os.getenv("META_ACCESS_TOKEN")
```

### MCP for External Integrations
| Integration | Location |
|-------------|----------|
| Ads Library | `server/services/ads-library/*-adapter.js` |
| Competitor Spy | `server/services/competitor-spy.js` |
| Web Scraping | `server/services/web-scraper/*-scraper.js` |
| Meta Ads MCP | `mcp.js`, `server/services/mcp-server.js` |

---

## 📁 File Placement (Enforced)

| Code Type | Directory | Naming |
|-----------|-----------|--------|
| API Routes | `server/routes/` | `feature.js` |
| Services | `server/services/` | `feature-service.js` |
| Repositories | `server/repositories/` | `feature.js` |
| Utilities | `server/lib/` | `utility.js` |
| Meta Ads Scripts | `scripts/` | `descriptive_name.py` |
| Tests | `tests/` | `feature.test.js` / `feature.spec.js` |
| State/Data | `data/` | (gitignored) |
| Config | `server/config/` | `index.js`, `prompts.js` |

**Root directory = NO CODE FILES**

---

## 🚫 Universal Forbidden Patterns

| Pattern | Why | Alternative |
|---------|-----|-------------|
| Direct Meta API calls | Bypasses rate limiting, token mgmt | `fb_get`/`fb_post` from engine |
| Duplicate token loading | Inconsistent, breaks rotation | `from vilona_trakpro_engine import ACCESS_TOKEN` |
| Hardcoded `/home/openclaw/...` | Not portable | `WORKSPACE`, `DATA_DIR` from engine |
| `console.log` / `print()` in prod | Pollutes logs | `server/lib/logger.js` |
| Committing `data/*.json` | Auto-regenerated | `.gitignore` handles |
| Multiple concerns per file | Unmaintainable | Single responsibility |
| Silent `catch (e) {}` | Hides bugs | Throw typed errors |
| Relative imports across layers | Brittle | Factory DI + `server/lib/` |

---

## ✅ Universal Required Patterns

### Error Handling (Server)
```javascript
import { ApiError, NotFoundError, ValidationError } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';

throw new ValidationError('Invalid input', { field: 'email' });
throw new NotFoundError('Campaign', id);
```

### Database (Repository)
```javascript
// ✅ Parameterized, null-safe
this.db.prepare('SELECT * FROM campaigns WHERE id = ? AND account_id = ?')
  .get(campaignId, accountId) || null;

// ❌ Never string interpolation
// this.db.prepare(`SELECT * FROM campaigns WHERE id = '${id}'`)
```

### Validation (Route Boundary)
```javascript
import { validateBody } from '../lib/validate.js';
import { z } from 'zod';

const schema = z.object({ email: z.string().email() });
const data = validateBody(schema, req.body); // Throws ValidationError
```

### Logging
```javascript
import { logger } from '../lib/logger.js';
logger.info({ campaignId, action: 'scale' }, 'Campaign scaled');
```

---

## 🔄 Workflow Enforcement (During Development)

### Before Writing Any Code
1. **Search** `server/lib/` for existing utility
2. **Check** `scripts/vilona_trakpro_engine.py` for Meta patterns
3. **Read** similar existing implementation
4. **Confirm** file placement matches table above

### While Coding
1. **Follow exact patterns** from reference files
2. **Use LSP diagnostics** after each file (`lsp_diagnostics`)
3. **No shortcuts** — if pattern unclear, ask `explore` agent

### Before Committing
1. **Run tests**: `npm test` + `npm run test:e2e`
2. **Single atomic commit** — one logical change
3. **Conventional commit msg**: `type: scope — description`
4. **No scattered files** — `git diff --stat` shows focused change

---

## 🎯 Agent-Specific Rules

| Agent | Key Rule |
|-------|----------|
| **Sisyphus** (main) | Orchestrate, delegate, verify. Never implement alone when specialists exist. |
| **Build** (Sisyphus-Jr) | Execute directly. Follow patterns exactly. No delegation. |
| **Explore** | Read-only. Find patterns. Reference files with lines. |
| **Oracle** | Read-only. Advise only. Reference actual files. |
| **Librarian** | External refs only. Production OSS examples. Version-aware. |
| **Plan (Metis)** | Assess codebase first. Identify ambiguities. Check guardrails. |
| **Plan (Momus)** | Reject vague plans. Every step verifiable. Guardrail checklist. |
| **Visual-Eng** | `visual-engineering` category only. Frontend/UI/UX. |

---

## 🚨 Violation = Rework

**No exceptions.** If you produce code that violates these guardrails:
1. It will be rejected
2. You must rewrite following patterns
3. Reference the specific guardrail violated

---

## 📚 Reference Files (Always Current)

| Pattern | Reference File |
|---------|----------------|
| Route handler | `server/routes/campaigns.js` |
| Service class | `server/services/campaign-monitor.js` |
| Repository | `server/repositories/campaigns.js` |
| Error types | `server/lib/errors.js` |
| Validation | `server/lib/validate.js` |
| Auth middleware | `server/middleware/auth.js` |
| Meta Ads engine | `scripts/vilona_trakpro_engine.py` |
| MCP server | `mcp.js` |
| Test patterns | `tests/unit/routes/campaigns.test.js` |

---
*Updated: 2026-06-10 | Enforced by all agents during development*