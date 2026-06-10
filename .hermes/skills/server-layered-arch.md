---
name: server-layered-arch
description: How to implement the Routes → Services → Repositories layered architecture in 1ai-ads
version: 1.0
---

# Server Layered Architecture Skill

> **The only way to add server-side functionality in 1ai-ads.**

## When to Use This Skill
- Adding a new API endpoint
- Adding a new database table/query
- Adding business logic that orchestrates data
- Modifying existing routes/services/repositories

## The Layers

```
Request
  │
  ▼
Route (validate, delegate, respond)
  │
  ▼
Service (business logic, orchestration)
  │
  ▼
Repository (parameterized SQL only)
  │
  ▼
SQLite (better-sqlite3)
```

## Layer 1: Route (`server/routes/`)

**Responsibility:** Validate input, delegate to service, return JSON.

```javascript
// server/routes/campaigns.js
import { validateBody } from '../lib/validate.js';
import { createCampaignSchema } from '../schemas/campaigns.js';

export default function campaignRoutes(campaignService) {
  return {
    create: async (req, res, next) => {
      try {
        const data = validateBody(createCampaignSchema, req.body);
        const campaign = await campaignService.create(data);
        res.status(201).json({ campaign });
      } catch (e) { next(e); }
    },

    list: async (req, res, next) => {
      try {
        const campaigns = await campaignService.list(req.query);
        res.json({ campaigns });
      } catch (e) { next(e); }
    },
  };
}
```

**Route Rules:**
- ✅ Validate at boundary
- ✅ Delegate ALL logic
- ✅ Try/catch with `next(e)`
- ❌ No business logic
- ❌ No raw SQL
- ❌ No `console.log` — use `logger`

## Layer 2: Service (`server/services/`)

**Responsibility:** Business logic, orchestration, data transformation.

```javascript
// server/services/campaign-service.js
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

export class CampaignService {
  constructor({ campaignRepo, platformClient, aiAgent }) {
    this.campaignRepo = campaignRepo;
    this.platformClient = platformClient;
    this.aiAgent = aiAgent;
  }

  async list(filters) {
    return this.campaignRepo.findAll(filters);
  }

  async create(data) {
    logger.info({ accountId: data.accountId }, 'Creating campaign');
    const campaign = await this.campaignRepo.create(data);
    await this.platformClient.sync(campaign);
    return campaign;
  }

  async getById(id) {
    const campaign = await this.campaignRepo.findById(id);
    if (!campaign) {
      throw new NotFoundError('Campaign', id);
    }
    return campaign;
  }
}
```

**Service Rules:**
- ✅ Constructor injection of deps
- ✅ Business logic + orchestration
- ✅ Composes repos + clients
- ❌ No raw SQL
- ❌ No req/res handling
- ❌ No direct `db` access

## Layer 3: Repository (`server/repositories/`)

**Responsibility:** Database access only, parameterized queries.

```javascript
// server/repositories/campaigns.js
export class CampaignRepository {
  constructor(db) {
    this.db = db;
  }

  findAll(filters = {}) {
    return this.db.prepare(`
      SELECT * FROM campaigns
      WHERE account_id = ? AND status = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(filters.accountId, filters.status, filters.limit || 100);
  }

  findById(id) {
    return this.db.prepare(`
      SELECT * FROM campaigns WHERE id = ?
    `).get(id) || null;  // null, never undefined
  }

  create(data) {
    return this.db.prepare(`
      INSERT INTO campaigns (id, name, account_id, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.id,
      data.name,
      data.accountId,
      data.status,
      new Date().toISOString()
    );
  }
}
```

**Repository Rules:**
- ✅ Parameterized queries (`?`)
- ✅ Return `null` for missing
- ✅ JSON fields: parse/stringify
- ❌ No business logic
- ❌ No string interpolation in SQL
- ❌ No external API calls

## Factory Pattern (Dependency Injection)

```javascript
// server/app/repositories.js
export function createRepositories(db) {
  return {
    campaignRepo: new CampaignRepository(db),
    userRepo: new UserRepository(db),
    // ...
  };
}

// server/app/services.js
export function createServices(repos, clients) {
  return {
    campaignService: new CampaignService({
      campaignRepo: repos.campaignRepo,
      platformClient: clients.platform,
    }),
    // ...
  };
}

// server/app/routers.js
export function createRouters(services) {
  return {
    campaigns: campaignRoutes(services.campaignService),
    // ...
  };
}

// server/app.js
export function createApp({ db }) {
  const repos = createRepositories(db);
  const services = createServices(repos, clients);
  const routers = createRouters(services);

  const app = express();
  app.use('/api/campaigns', createCampaignRouter(routers.campaigns));
  // ...
}
```

## Validation (Zod Schemas)

```javascript
// server/schemas/campaigns.js
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
  }).strict(),
});

// In route:
const data = validateBody(createCampaignSchema, req.body);
```

## Error Handling (Typed Errors)

```javascript
import { ApiError, NotFoundError, ValidationError, UnauthorizedError } from '../lib/errors.js';

// Throw with context
throw new NotFoundError('Campaign', id);
throw new ValidationError('Invalid email', { field: 'email' });
throw new UnauthorizedError('Token expired');
```

## Logging (Structured)

```javascript
import { logger } from '../lib/logger.js';

logger.info({ campaignId, action: 'scale' }, 'Campaign scaled');
logger.error({ error: e.message, stack: e.stack }, 'Failed to scale');
```

## Common Mistakes to Avoid

### ❌ Route doing business logic
```javascript
// WRONG
app.post('/api/campaigns', async (req, res) => {
  const exists = await db.prepare('SELECT * FROM campaigns WHERE name = ?').get(req.body.name);
  if (exists) return res.status(400).json({ error: 'Duplicate' });
  const result = await db.prepare('INSERT...').run(req.body);
  await platformClient.sync(result);
  res.json(result);
});
```

### ✅ Route delegating to service
```javascript
// CORRECT
app.post('/api/campaigns', async (req, res, next) => {
  try {
    const data = validateBody(createCampaignSchema, req.body);
    const campaign = await campaignService.create(data);
    res.status(201).json({ campaign });
  } catch (e) { next(e); }
});
```

### ❌ Raw SQL in service
```javascript
// WRONG
export class CampaignService {
  async getActive(accountId) {
    return this.db.prepare('SELECT * FROM campaigns WHERE...').all(accountId);
  }
}
```

### ✅ Service using repository
```javascript
// CORRECT
export class CampaignService {
  constructor({ campaignRepo }) { this.campaignRepo = campaignRepo; }
  async getActive(accountId) {
    return this.campaignRepo.findActive(accountId);
  }
}
```

## Reference Files

| Layer | Reference File |
|-------|----------------|
| Route | `server/routes/campaigns.js` |
| Service | `server/services/campaign-monitor.js` |
| Repository | `server/repositories/campaigns.js` |
| Errors | `server/lib/errors.js` |
| Validation | `server/lib/validate.js` |
| Auth | `server/middleware/auth.js` |
| App factory | `server/app.js` |

## Quick Checklist

When adding new server functionality:
- [ ] Identify which layer (route/service/repo)?
- [ ] Search for existing similar implementation
- [ ] Add to repository (if data access)
- [ ] Add to service (if business logic)
- [ ] Add to route (if HTTP endpoint)
- [ ] Use existing lib utilities (errors, validate, logger)
- [ ] Write tests in `tests/unit/`
- [ ] Run `npm test` before commit