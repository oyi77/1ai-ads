# Remaining Improvements Plan

**Created**: 2026-05-31
**Status**: Ready for Execution
**Total Effort**: ~10 hours
**Dependencies**: None (all independent)

---

## Overview

5 remaining improvements identified from autoresearch scan. All are independent and can be executed in any order.

| # | Item | Priority | Effort | Risk |
|---|------|----------|--------|------|
| 1 | Webhook event processor | Medium | 2h | Low |
| 2 | Base class for platform API clients | Low | 4h | Medium |
| 3 | Route error handler consolidation | Low | 2h | Low |
| 4 | Auto-activation for high-performing campaigns | Low | 1h | Low |
| 5 | Data retention/cleanup for old records | Low | 1h | Low |

---

## Task 1: Webhook Event Processor

### Problem
Webhook events from Meta are stored in `webhook_events` table but never processed. The `processed` flag is never set to 1.

### Solution
Create a `WebhookProcessor` service that:
1. Polls `webhook_events` where `processed = 0`
2. Routes events by `event_type` to appropriate handlers
3. Marks events as processed after handling

### Implementation

**File**: `server/services/webhook-processor.js`

```javascript
export class WebhookProcessor {
  constructor(webhookEventsRepo, campaignsRepo, settingsRepo) {
    this.webhookEventsRepo = webhookEventsRepo;
    this.campaignsRepo = campaignsRepo;
    this.settingsRepo = settingsRepo;
    this._interval = null;
  }

  start(intervalMs = 60 * 1000) {
    this._interval = setInterval(() => this.processBatch(), intervalMs);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }

  async processBatch(limit = 50) {
    const events = this.webhookEventsRepo.findUnprocessed(limit);
    for (const event of events) {
      await this.processEvent(event);
      this.webhookEventsRepo.markProcessed(event.id);
    }
  }

  async processEvent(event) {
    const payload = JSON.parse(event.payload);
    switch (event.event_type) {
      case 'campaign_status_change':
        await this.handleCampaignStatusChange(payload);
        break;
      case 'lead':
        await this.handleLead(payload);
        break;
      default:
        // Unknown event type, mark as processed
        break;
    }
  }

  async handleCampaignStatusChange(payload) {
    // Update local campaign status
    if (payload.campaign_id && payload.status) {
      await this.campaignsRepo.updateStatus(payload.campaign_id, payload.status);
    }
  }

  async handleLead(payload) {
    // Forward lead to notification service or store
    // For now, just log
    console.log('Lead received:', payload);
  }
}
```

**Wire in app.js**:
```javascript
import { WebhookProcessor } from './services/webhook-processor.js';

// After creating repos
const webhookProcessor = new WebhookProcessor(webhookEventsRepo, campaignsRepo, settingsRepo);
webhookProcessor.start();
```

### Success Criteria
- [ ] `webhook-processor.js` created with processBatch, processEvent, handleCampaignStatusChange
- [ ] Wired in `app.js` to start automatically
- [ ] Events marked as processed after handling
- [ ] Unit test: `tests/unit/services/webhook-processor.test.js`
- [ ] All 822+ tests pass

---

## Task 2: Base Class for Platform API Clients

### Problem
Meta, Google, TikTok API clients share patterns (token management, HTTP methods, error handling) but have no base class. Adding a new platform requires duplicating code.

### Solution
Create `BasePlatformApiClient` with shared:
- Token resolution (from settingsRepo)
- `_get()`, `_post()` methods with retry
- Error normalization
- Logging

### Implementation

**File**: `server/lib/base-platform-api.js`

```javascript
import { safeFetch } from './platform-client.js';
import { createLogger } from './logger.js';
import { ConfigurationError } from './errors.js';

export class BasePlatformApiClient {
  constructor(platformName, settingsRepo) {
    this.platformName = platformName;
    this.settingsRepo = settingsRepo;
    this.log = createLogger(`${platformName}-api`);
  }

  _getToken() {
    const creds = this.settingsRepo.getCredentials(this.platformName);
    if (!creds?.access_token) {
      throw new ConfigurationError(
        `${this.platformName} access token not configured. Go to Settings.`
      );
    }
    return creds.access_token;
  }

  async _get(baseUrl, path, params = {}) {
    const token = this._getToken();
    const url = new URL(`${baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const res = await safeFetch(this.platformName, url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return await res.json();
  }

  async _post(baseUrl, path, body = {}) {
    const token = this._getToken();
    const res = await safeFetch(this.platformName, `${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return await res.json();
  }
}
```

**Refactor Meta API** to extend base:
```javascript
import { BasePlatformApiClient } from '../lib/base-platform-api.js';

export class MetaAdsAPI extends BasePlatformApiClient {
  constructor(settingsRepo) {
    super('meta', settingsRepo);
    this.baseUrl = `https://graph.facebook.com/${config.metaApiVersion}`;
  }

  // Override _getToken for Meta-specific logic (explicit token, system token, etc.)
  _getToken() { ... }

  // Use inherited _get/_post or override
  async getMe() {
    return this._get(this.baseUrl, '/me', { fields: 'id,name' });
  }
}
```

### Success Criteria
- [ ] `server/lib/base-platform-api.js` created
- [ ] Meta, Google, TikTok APIs refactored to extend base (or use composition)
- [ ] No breaking changes to existing API
- [ ] All 822+ tests pass

---

## Task 3: Route Error Handler Consolidation

### Problem
Every route handler has redundant try/catch:
```javascript
try { ... res.json({ success: true, data }) }
catch (err) { res.status(500).json({ success: false, error: err.message }) }
```

The global error handler in `app.js` already catches uncaught errors.

### Solution
Remove redundant try/catch from route handlers. Let errors propagate to global handler.

### Implementation

**Pattern before**:
```javascript
router.get('/', async (req, res) => {
  try {
    const data = await service.getAll();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

**Pattern after**:
```javascript
router.get('/', async (req, res) => {
  const data = await service.getAll();
  res.json({ success: true, data });
});
```

**Files to update** (sample):
- `server/routes/schedule.js`
- `server/routes/pixels.js`
- `server/routes/audiences.js`
- `server/routes/batch.js`
- `server/routes/tokens.js`

**Note**: Keep try/catch where specific error handling is needed (e.g., validation errors returning 400).

### Success Criteria
- [ ] Redundant try/catch removed from 5+ route files
- [ ] Global error handler catches remaining errors
- [ ] All 822+ tests pass

---

## Task 4: Auto-Activation for High-Performing Campaigns

### Problem
All campaigns are created as `PAUSED`. No automatic activation based on quality score.

### Solution
Add optional auto-activation after campaign creation if AI quality score > threshold.

### Implementation

**File**: `server/services/campaign-orchestrator.js`

Add after `createCampaign()`:
```javascript
async createCampaignWithAutoActivate(userId, campaignData) {
  const campaign = await this.createCampaign(userId, campaignData);
  
  // Auto-activate if quality score is high enough
  if (campaign.qualityScore && campaign.qualityScore >= 0.8) {
    // Delay activation by 5 minutes (cancel window)
    setTimeout(async () => {
      await this.activateCampaign(campaign.id);
      log.info('Campaign auto-activated', { campaignId: campaign.id, qualityScore: campaign.qualityScore });
    }, 5 * 60 * 1000);
  }
  
  return campaign;
}
```

### Success Criteria
- [ ] `createCampaignWithAutoActivate()` method added
- [ ] Auto-activates after 5min delay if qualityScore >= 0.8
- [ ] Can be cancelled during delay window
- [ ] All 822+ tests pass

---

## Task 5: Data Retention/Cleanup

### Problem
No cleanup of old records: webhook events, completed schedules, expired tokens grow unbounded.

### Solution
Add a cleanup job that runs weekly to delete old records.

### Implementation

**File**: `server/services/data-cleanup.js`

```javascript
export class DataCleanup {
  constructor(db) {
    this.db = db;
    this._interval = null;
  }

  start(intervalMs = 7 * 24 * 60 * 60 * 1000) { // Weekly
    this._interval = setInterval(() => this.cleanup(), intervalMs);
    // Run once on start after 1 minute
    setTimeout(() => this.cleanup(), 60 * 1000);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }

  cleanup() {
    const results = {};
    
    // Delete processed webhook events older than 30 days
    results.webhookEvents = this.db.prepare(
      "DELETE FROM webhook_events WHERE processed = 1 AND created_at < datetime('now', '-30 days')"
    ).run().changes;

    // Delete executed schedules older than 90 days
    results.schedules = this.db.prepare(
      "DELETE FROM schedules WHERE status = 'executed' AND updated_at < datetime('now', '-90 days')"
    ).run().changes;

    // Delete expired refresh tokens
    results.refreshTokens = this.db.prepare(
      "DELETE FROM refresh_tokens WHERE expires_at < datetime('now')"
    ).run().changes;

    // Delete failed queue items older than 7 days
    results.contentQueue = this.db.prepare(
      "DELETE FROM content_queue WHERE status = 'failed' AND created_at < strftime('%s', 'now', '-7 days')"
    ).run().changes;

    return results;
  }
}
```

**Wire in app.js**:
```javascript
import { DataCleanup } from './services/data-cleanup.js';

const dataCleanup = new DataCleanup(db);
dataCleanup.start();
```

### Success Criteria
- [ ] `server/services/data-cleanup.js` created
- [ ] Cleans: webhook events (30d), schedules (90d), expired tokens, failed queue (7d)
- [ ] Wired in `app.js` to run weekly
- [ ] Unit test: `tests/unit/services/data-cleanup.test.js`
- [ ] All 822+ tests pass

---

## Execution Order

All tasks are independent. Recommended order by priority:

1. **Task 1**: Webhook processor (2h) — Medium priority, high impact
2. **Task 5**: Data cleanup (1h) — Quick win, prevents DB bloat
3. **Task 3**: Route error consolidation (2h) — Code quality
4. **Task 4**: Auto-activation (1h) — Nice to have
5. **Task 2**: Base class refactor (4h) — Lowest priority, highest risk

---

## Verification

After all tasks:
- [ ] `npm test` passes (822+ tests)
- [ ] `npm run build` succeeds
- [ ] Manual test: health endpoint works
- [ ] Manual test: webhook processor logs activity
- [ ] Manual test: data cleanup logs activity

