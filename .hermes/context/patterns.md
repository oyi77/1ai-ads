# 1ai-ads Code Patterns (Hermes Context)

> **Load before writing any code.** These are the EXACT patterns to follow.

---

## Server Route Pattern (Thin Handler)

```javascript
// server/routes/campaigns.js
import { validateBody } from '../lib/validate.js';
import { logger } from '../lib/logger.js';

export default function campaignRoutes(campaignService) {
  return {
    list: async (req, res, next) => {
      try {
        const campaigns = await campaignService.list(req.query);
        res.json({ campaigns });
      } catch (e) { next(e); }
    },

    create: async (req, res, next) => {
      try {
        const data = validateBody(createCampaignSchema, req.body);
        const campaign = await campaignService.create(data);
        res.status(201).json({ campaign });
      } catch (e) { next(e); }
    },

    get: async (req, res, next) => {
      try {
        const campaign = await campaignService.getById(req.params.id);
        if (!campaign) {
          return res.status(404).json({ error: 'Not found' });
        }
        res.json({ campaign });
      } catch (e) { next(e); }
    },
  };
}
```

**Rules:**
- ✅ Validate at boundary
- ✅ Delegate ALL logic to service
- ✅ Try/catch with `next(e)` for error middleware
- ❌ No business logic in routes
- ❌ No raw SQL in routes

---

## Service Pattern (Business Logic)

```javascript
// server/services/campaign-service.js
import { logger } from '../lib/logger.js';

export class CampaignService {
  constructor({ campaignRepo, platformClient }) {
    this.campaignRepo = campaignRepo;
    this.platformClient = platformClient;
  }

  async list(filters) {
    return this.campaignRepo.findAll(filters);
  }

  async create(data) {
    logger.info({ data }, 'Creating campaign');
    // Business logic here (validation, orchestration)
    const campaign = await this.campaignRepo.create(data);
    await this.platformClient.sync(campaign);
    return campaign;
  }

  async getById(id) {
    return this.campaignRepo.findById(id);
  }
}
```

**Rules:**
- ✅ Constructor injection of dependencies
- ✅ Business logic only
- ✅ Composes repos + external clients
- ❌ No raw SQL
- ❌ No req/res handling

---

## Repository Pattern (Data Access)

```javascript
// server/repositories/campaigns.js
export class CampaignRepository {
  constructor(db) {
    this.db = db;
  }

  findAll(filters = {}) {
    // Parameterized queries ONLY
    return this.db.prepare(`
      SELECT * FROM campaigns
      WHERE account_id = ? AND status = ?
      ORDER BY created_at DESC
    `).all(filters.accountId, filters.status);
  }

  findById(id) {
    return this.db.prepare(`
      SELECT * FROM campaigns WHERE id = ?
    `).get(id) || null;  // null for missing, never undefined
  }

  create(data) {
    return this.db.prepare(`
      INSERT INTO campaigns (id, name, account_id, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.id, data.name, data.accountId, data.status, new Date().toISOString());
  }
}
```

**Rules:**
- ✅ Parameterized queries (?, ?, ?)
- ✅ Return `null` for missing
- ✅ Single responsibility (data access)
- ❌ No business logic
- ❌ No string interpolation in SQL

---

## Error Handling Pattern

```javascript
// server/lib/errors.js
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message, details) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource, id) {
    super(404, 'NOT_FOUND', `${resource} not found`, { resource, id });
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}
```

**Usage:**
```javascript
// Throw typed errors
throw new ValidationError('Invalid email', { field: 'email' });
throw new NotFoundError('Campaign', id);
```

**Rules:**
- ✅ Always throw typed errors
- ✅ Include context (resource, id, field)
- ❌ No silent catch
- ❌ No generic `throw new Error(...)`

---

## Validation Pattern (Zod + validate.js)

```javascript
// server/lib/validate.js
import { z } from 'zod';
import { ValidationError } from './errors.js';

export function validateBody(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid request body', result.error.flatten());
  }
  return result.data;
}
```

**Schemas in route files or separate `*/schemas.js`:**
```javascript
import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  accountId: z.string().uuid(),
  objective: z.enum(['OUTCOME_TRAFFIC', 'OUTCOME_SALES', 'OUTCOME_LEADS']),
  dailyBudget: z.number().int().positive(),
  targeting: z.object({
    ageMin: z.number().int().min(13).max(65),
    ageMax: z.number().int().min(13).max(65),
    geoLocations: z.array(z.string()).min(1),
  }),
});
```

---

## Logging Pattern

```javascript
// server/lib/logger.js (pino-based)
import { logger } from '../lib/logger.js';

logger.info({ campaignId, action: 'scale' }, 'Campaign scaled');
logger.error({ error: e, campaignId }, 'Failed to scale campaign');
```

**Rules:**
- ✅ Structured logging (pino)
- ✅ Include context object
- ❌ No `console.log`
- ❌ No string concatenation in logs

---

## Auth Middleware Pattern

```javascript
// server/middleware/auth.js
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../lib/errors.js';

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return next(new UnauthorizedError('Missing token'));
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    next(new UnauthorizedError('Invalid token'));
  }
}
```

---

## Meta Ads Script Pattern (vilona_trakpro_engine)

```python
#!/usr/bin/env python3
"""Script description"""
import sys
from pathlib import Path

# Add scripts dir to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

# Import from engine ONLY
from vilona_trakpro_engine import (
    ACCESS_TOKEN, API, ACCOUNTS,
    fb_get, fb_post, log,
    WORKSPACE, DATA_DIR,
)

# Configuration
ACCOUNT_ID = ACCOUNTS["1041"]["id"]

# Use helpers, NEVER raw requests
campaigns = fb_get(f"{ACCOUNT_ID}/campaigns", fields="id,name,status", limit="200")

# Use engine paths
report_path = DATA_DIR / "brain" / "report.json"

# Structured logging
log(f"Processing {len(campaigns.get('data', []))} campaigns", "INFO")
```

**Rules:**
- ✅ Import from `vilona_trakpro_engine`
- ✅ Use `fb_get`/`fb_post` helpers
- ✅ Use `WORKSPACE`/`DATA_DIR` paths
- ❌ No `import requests` for Meta API
- ❌ No hardcoded `/home/openclaw/...`
- ❌ No duplicate token loading

---

## MCP Integration Pattern

```javascript
// server/services/ads-library/meta-adapter.js
import { BaseAdapter } from './base-adapter.js';

export class MetaAdsLibraryAdapter extends BaseAdapter {
  constructor({ mcpClient }) {
    super();
    this.mcpClient = mcpClient;
  }

  async searchAds(query) {
    // Use MCP client, not direct API calls
    return this.mcpClient.call('meta_ads_library', 'search', { query });
  }
}
```

---

## Test Pattern (Vitest)

```javascript
// tests/unit/services/campaign-service.test.js
import { describe, it, expect, vi } from 'vitest';
import { CampaignService } from '../../../server/services/campaign-service.js';

describe('CampaignService', () => {
  const mockRepo = { create: vi.fn(), findById: vi.fn() };
  const mockPlatform = { sync: vi.fn() };
  const service = new CampaignService({
    campaignRepo: mockRepo,
    platformClient: mockPlatform,
  });

  it('creates campaign and syncs to platform', async () => {
    const data = { name: 'Test', accountId: 'acc-1' };
    mockRepo.create.mockResolvedValue({ id: '1', ...data });

    const result = await service.create(data);

    expect(mockRepo.create).toHaveBeenCalledWith(data);
    expect(mockPlatform.sync).toHaveBeenCalled();
    expect(result.id).toBe('1');
  });
});
```

**Rules:**
- ✅ Mock dependencies
- ✅ Test behavior, not implementation
- ✅ One assertion focus per test

---

## Quick Reference

| Pattern | Reference File |
|---------|----------------|
| Route | `server/routes/campaigns.js` |
| Service | `server/services/campaign-service.js` |
| Repository | `server/repositories/campaigns.js` |
| Errors | `server/lib/errors.js` |
| Validation | `server/lib/validate.js` |
| Auth | `server/middleware/auth.js` |
| Meta Ads | `scripts/vilona_trakpro_engine.py` |
| MCP | `mcp.js`, `server/services/mcp-server.js` |
| Test | `tests/unit/routes/campaigns.test.js` |