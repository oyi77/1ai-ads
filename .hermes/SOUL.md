# 1ai-ads — Hermes Agent SOUL (Personality & Guardrails)

## Identity
You are an autonomous coding agent for **1ai-ads** — a full-stack ad management platform (Express 5 + SQLite + Vite/React + Meta/Google/TikTok Ads APIs).

## Core Principles (NON-NEGOTIABLE)

### 🏗️ Architecture Laws
1. **Layered Architecture**: Routes → Services → Repositories → SQLite
2. **Engine-Only for Meta Ads**: NEVER call `graph.facebook.com` directly. Use `vilona_trakpro_engine` helpers (`fb_get`, `fb_post`, `ACCESS_TOKEN`)
3. **No Hardcoded Paths**: Use `WORKSPACE`, `DATA_DIR` from engine
4. **No Duplicate Token Logic**: Import `ACCESS_TOKEN` from `vilona_trakpro_engine`
5. **MCP for Externals**: Ads Library, Competitor Spy, Web Scraping → MCP servers

### 📁 File Placement (ENFORCED)
| Code Type | Directory |
|-----------|-----------|
| API Routes | `server/routes/` |
| Business Logic | `server/services/` |
| Data Access | `server/repositories/` |
| Shared Utils | `server/lib/` |
| Meta Ads Scripts | `scripts/` |
| Tests | `tests/` (Vitest/Playwright) |
| State/Data | `data/` (gitignored) |
| Config | `server/config/` |

**Root = NO CODE FILES**

### 🚫 FORBIDDEN (Auto-Reject)
- ❌ `import requests; requests.get("https://graph.facebook.com/...")`
- ❌ `os.getenv("META_ACCESS_TOKEN")` or duplicate token loading
- ❌ `/home/openclaw/...` hardcoded paths
- ❌ `console.log` / `print()` in production code
- ❌ Committing `data/*.json` (auto-regenerated)
- ❌ Multiple concerns per file
- ❌ Silent `catch (e) {}` or bare `except:`
- ❌ Raw SQL outside repositories
- ❌ Scattered test scripts in `scripts/` (use `tests/`)

### ✅ REQUIRED PATTERNS

#### Server (Express 5 + ESM)
```javascript
// routes/feature.js — Thin handler
import { validateBody } from '../lib/validate.js';
import { ApiError } from '../lib/errors.js';

export default function routes(service) {
  return async (req, res, next) => {
    try {
      const data = validateBody(schema, req.body);
      const result = await service.method(data);
      res.json(result);
    } catch (e) { next(e); }
  };
}
```

```javascript
// services/feature-service.js — Business logic
export class FeatureService {
  constructor({ featureRepo }) { this.featureRepo = featureRepo; }
  async method(data) { return this.featureRepo.create(data); }
}
```

```javascript
// repositories/feature.js — Data access
export class FeatureRepository {
  constructor(db) { this.db = db; }
  create(data) {
    return this.db.prepare('INSERT INTO...').run(data.a, data.b);
  }
}
```

#### Scripts (Meta Ads Automation)
```python
# ALWAYS import from engine
from vilona_trakpro_engine import ACCESS_TOKEN, API, fb_get, fb_post, log, WORKSPACE, DATA_DIR

# Use helpers
camps = fb_get(f"{account_id}/campaigns", fields="id,name", limit="100")

# No hardcoded paths
report_path = DATA_DIR / "brain" / "report.json"

# Structured logging
log(f"Processing {len(camps)} campaigns", "INFO")
```

#### Error Handling (Server)
```javascript
import { ApiError, NotFoundError, ValidationError } from '../lib/errors.js';
throw new ValidationError('Invalid input', { field: 'email' });
throw new NotFoundError('Campaign', id);
```

#### Database (Repository)
```javascript
// Parameterized, null-safe
this.db.prepare('SELECT * FROM campaigns WHERE id = ? AND account_id = ?')
  .get(campaignId, accountId) || null;
```

#### Validation (Route Boundary)
```javascript
import { validateBody } from '../lib/validate.js';
import { z } from 'zod';
const schema = z.object({ email: z.string().email() });
const data = validateBody(schema, req.body);
```

---

## Context Files (Loaded Every Session)

### `.hermes/context/architecture.md`
- Layered architecture diagram
- Dependency graph
- Data flow patterns

### `.hermes/context/patterns.md`
- Route handler patterns
- Service class patterns
- Repository patterns
- Error handling patterns
- Meta Ads engine patterns

### `.hermes/context/guardrails.md`
- This file (condensed for quick reference)

---

## Skills (Procedural Memory)

### `.hermes/skills/meta-ads-engine.md`
- How to use `vilona_trakpro_engine` for all Meta operations
- Token management
- Rate limiting
- Error handling

### `.hermes/skills/server-layered-arch.md`
- Routes → Services → Repositories pattern
- Dependency injection via factories
- Testing patterns

### `.hermes/skills/mcp-integration.md`
- Ads Library MCP
- Competitor Spy MCP
- Web Scraper MCP

---

## Memory System
- **Persistent memory**: Stores decisions, patterns, user preferences
- **User profile**: Learns your coding style, preferences
- **Project knowledge**: Architecture, guardrails, common pitfalls

---

## MCP Servers (Available)
- `1ai-hub` — Project memory, brain, knowledge graph
- `cf-router` — Cloudflare tunnel management

---

## Behavior Rules
1. **Before coding**: Check existing patterns in `server/lib/`, `scripts/vilona_trakpro_engine.py`
2. **During coding**: Follow exact patterns from reference files
3. **After coding**: Run tests (`npm test`, `npm run test:e2e`)
4. **Single atomic changes**: One logical change per session
5. **Ask when ambiguous**: Don't guess — clarify with user

---

## Reference Files (Always Current)
| Pattern | File |
|---------|------|
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

*This SOUL.md loads every session. Guardrails are ACTIVE during development.*