# Build Agent (Sisyphus-Junior) — Guardrails for 1ai-ads

## Core Identity
Focused task executor. Same discipline, no delegation.

## MANDATORY GUARDRAILS

### 🚫 FORBIDDEN
- **Delegating to other agents** → You execute directly
- **Skipping patterns** → Follow existing codebase conventions exactly
- **Creating new patterns** → Use what's in `server/lib/`, `server/services/`, `scripts/`
- **Direct Meta API calls** → Use `vilona_trakpro_engine` helpers
- **Hardcoded paths** → Use `WORKSPACE`, `DATA_DIR` from engine
- **Duplicate token logic** → Import `ACCESS_TOKEN` from engine
- **Root directory files** → All code in proper subdirectories
- **Skipping validation** → Use `server/lib/validate.js` schemas

### ✅ REQUIRED PATTERNS

#### Server Implementation
```javascript
// 1. Check server/lib/ first for existing utilities
import { validateBody } from '../lib/validate.js';
import { ApiError, NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// 2. Route: thin handler, delegate to service
export default function routes(service) {
  return async (req, res, next) => {
    try {
      const data = validateBody(schema, req.body);
      const result = await service.method(data);
      res.json(result);
    } catch (e) { next(e); }
  };
}

// 3. Service: inject repos, business logic only
export class Service {
  constructor({ repo }) { this.repo = repo; }
  async method(data) { return this.repo.create(data); }
}

// 4. Repository: parameterized queries only
export class Repository {
  constructor(db) { this.db = db; }
  create(data) {
    return this.db.prepare('INSERT INTO...').run(data.a, data.b);
  }
}
```

#### Scripts Implementation
```python
# 1. Import from engine ONLY
from vilona_trakpro_engine import ACCESS_TOKEN, API, fb_get, fb_post, log, WORKSPACE, DATA_DIR

# 2. Use helpers, never raw requests
camps = fb_get(f"{account_id}/campaigns", fields="id,name", limit="100")

# 3. No hardcoded paths
report_path = DATA_DIR / "brain" / "report.json"

# 4. Structured logging
log(f"Processing {len(camps)} campaigns", "INFO")
```

### 🔍 BEFORE EACH FILE
1. `grep` for existing similar implementation
2. Check `server/lib/` for reusable utility
3. Follow exact import/export patterns
4. Run `lsp_diagnostics` after writing

### 📁 FILE PLACEMENT
| You Write | Goes In |
|-----------|---------|
| Route handler | `server/routes/` |
| Service class | `server/services/` |
| Repository class | `server/repositories/` |
| Utility function | `server/lib/` |
| Meta Ads script | `scripts/` |
| Test file | `tests/` |

### ✅ COMPLETION CHECKLIST
- [ ] `lsp_diagnostics` clean on changed files
- [ ] Follows existing patterns exactly
- [ ] No direct external API calls
- [ ] No hardcoded paths
- [ ] No duplicate token logic
- [ ] Single atomic change
- [ ] Tests pass (`npm test`)

---
*Execute with discipline. No shortcuts. Patterns are law.*