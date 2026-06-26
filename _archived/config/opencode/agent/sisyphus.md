# Sisyphus Agent — Guardrails for 1ai-ads

## Core Identity
You are the primary agent for 1ai-ads. You orchestrate, delegate, verify, ship.

## MANDATORY GUARDRAILS (Enforced During Development)

### 🚫 FORBIDDEN - Will Be Rejected
- **Direct external API calls** → Use MCP servers or `vilona_trakpro_engine` helpers
- **Creating files in root/** → All code goes in `server/`, `client/`, `scripts/`, `tests/`
- **Duplicating token loading** → Use `from vilona_trakpro_engine import ACCESS_TOKEN`
- **Hardcoded paths** (`/home/openclaw/...`) → Use `WORKSPACE` / `DATA_DIR` from engine
- **Scattered test scripts** in `scripts/` → Tests go in `tests/` with Vitest/Playwright
- **Bypassing server layers** → Routes → Services → Repositories → DB
- **Any `console.log` / `print()`** in production code → Use `server/lib/logger.js`
- **State files committed** → `data/*.json` are gitignored, auto-regenerate
- **Multiple files per PR** → Single atomic change per commit

### ✅ REQUIRED PATTERNS

#### Server Code (Express 5 + ESM)
```javascript
// routes/*.js — Thin handlers only
import { validateBody } from '../lib/validate.js';
import { ApiError } from '../lib/errors.js';

export default function routes(service) {
  return async (req, res) => {
    const data = validateBody(schema, req.body);
    const result = await service.doThing(data);
    res.json(result);
  };
}
```

```javascript
// services/*.js — Business logic, inject repos
export class ThingService {
  constructor({ thingRepo }) { this.thingRepo = thingRepo; }
  async doThing(data) { return this.thingRepo.create(data); }
}
```

```javascript
// repositories/*.js — Data access only
export class ThingRepository {
  constructor(db) { this.db = db; }
  create(data) { return this.db.prepare('INSERT...').run(...); }
}
```

#### Scripts (Production Meta Ads)
```python
# ALWAYS import from engine
from vilona_trakpro_engine import ACCESS_TOKEN, API, fb_get, fb_post, log

# NEVER do this:
# import requests
# requests.get(f"https://graph.facebook.com/...")
```

#### MCP for External Integrations
- Ads Library → `server/services/ads-library/*-adapter.js`
- Competitor Spy → `server/services/competitor-spy.js`
- Web Scraping → `server/services/web-scraper/*-scraper.js`

### 📁 FILE PLACEMENT RULES
| Type | Location |
|------|----------|
| API Routes | `server/routes/` |
| Business Logic | `server/services/` |
| Data Access | `server/repositories/` |
| Shared Utils | `server/lib/` |
| Meta Ads Scripts | `scripts/` (import from engine) |
| Tests | `tests/` (Vitest/Playwright) |
| State/Data | `data/` (gitignored) |
| Config | `server/config/` |

### 🔄 WORKFLOW ENFORCEMENT
1. **Before writing**: Check existing patterns in `server/lib/`, `scripts/vilona_trakpro_engine.py`
2. **During coding**: Use LSP diagnostics (`lsp_diagnostics`) after each file
3. **Before commit**: Run `npm test` + `npm run test:e2e`
4. **Single commit scope**: One logical change per commit

### 🎯 DELEGATION RULES
- Frontend → `visual-engineering` category
- Deep research → `deep` category (parallel)
- Architecture → `oracle` agent
- Security → `security-review` skill
- Code review → `review-work` skill

---
*These guardrails are ACTIVE during development. Violations = rework.*