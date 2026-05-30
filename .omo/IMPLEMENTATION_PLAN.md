# 1ai-ads Comprehensive Implementation Plan

**Status**: Ready for Execution | **Created**: 2026-05-30 | **Target Completion**: 13-16 weeks

---

## 📊 Executive Summary

This plan addresses **14 identified gaps** across the codebase, organized into **4 sequential phases** with **24 specific, executable tasks**.

| Phase | Objective | Duration | Effort | Dependencies |
|-------|-----------|----------|--------|--------------|
| **A** | Fix critical database & API issues | 3-4 wks | M | None |
| **B** | Build frontend architecture & integrate data | 4-5 wks | L | Phase A |
| **C** | Complete testing, docs, consolidation | 3-4 wks | M | Phase A, B |
| **D** | Optimize, secure, deploy to production | 2-3 wks | M | Phase A, B, C |

**Total Effort**: ~13-16 weeks (team of 3-4)  
**Critical Path**: A → B → C → D (sequential)

---

## 🎯 What We're Solving

### Gaps Being Addressed (14 total)

| # | Gap | Type | Impact |
|---|-----|------|--------|
| 1 | Dual databases (`1ai-ads.db` + `adforge.db`) | P0 Critical | Data integrity, confusion |
| 2 | Google Ads API is stub | P0 Critical | No Google Ads support |
| 3 | TikTok Ads API is empty class | P0 Critical | No TikTok API support |
| 4 | Campaigns view has hardcoded dummy data | P0 Critical | Users see fake data |
| 5-14 | 10+ views placeholders, no state mgmt, no error handling, deferred tests, empty alerts, bad docs, unintegrated tools | P1-P2 Moderate/Minor | UX issues, technical debt |

---

# PHASE A: Critical Foundation (Database & APIs)

**Duration**: 3-4 weeks | **Effort**: M | **Goal**: Single DB, working Google/TikTok APIs, real campaign data

## A.1: Resolve Dual Database Problem

### Task A.1.1: Audit & Choose Canonical Database
**What**: Understand both databases, decide which to keep  
**How**: Compare schemas, row counts, decide on `adforge.db` (newer, 268KB vs 244KB)  
**Deliverable**: `docs/db-strategy.md` (decision + migration plan)  
**Success Criteria**:
- [ ] Schema comparison complete
- [ ] Data counts for all tables documented
- [ ] Migration plan written
- [ ] Stakeholder approval

---

### Task A.1.2: Migrate Data to Single Database
**What**: Move data from old DB to new (if needed)  
**How**: 
1. Backup both databases
2. Write migration script: `scripts/db-migration.js`
3. Validate migration: `scripts/db-validate.js`
4. Test in staging

**Deliverable**: Working migration scripts + validation report  
**Success Criteria**:
- [ ] 100% of data migrated
- [ ] Row count verification: 0 discrepancies
- [ ] Foreign key integrity verified
- [ ] All tests pass (npm test)

---

### Task A.1.3: Update Server Configuration
**What**: Remove hardcoded DB references, use single canonical DB  
**Files Changed**:
- `server.js` — remove DB path selection
- `.env.example` — set `DB_PATH=./adforge.db` only
- `db/index.js` — single database instance

**Success Criteria**:
- [ ] Server starts with single DB
- [ ] All routes functional
- [ ] No hardcoded DB paths in code

---

### Task A.1.4: Archive Old Database
**What**: Backup `1ai-ads.db` for compliance/recovery  
**How**: 
```bash
mkdir -p backups/
tar -czf backups/1ai-ads.db.backup.tar.gz 1ai-ads.db
```

**Deliverable**: Compressed archive + recovery procedure in `docs/RECOVERY.md`  
**Success Criteria**:
- [ ] Backup verified
- [ ] Recovery procedure documented

---

## A.2: Implement Google Ads API (Stub → Real)

### Task A.2.1: Design OAuth Flow
**What**: Plan Google Ads OAuth (like Meta)  
**Deliverable**: `docs/google-ads-oauth.md`

**Content outline**:
- User clicks "Connect Google Ads"
- OAuth consent screen
- Authorization code exchange
- Token storage in `platform_accounts` table
- Token refresh logic

**Success Criteria**:
- [ ] Flow diagram created
- [ ] Env vars defined: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

---

### Task A.2.2: Implement Google Ads API Client
**What**: Replace stub with real implementation  
**File**: `server/services/google-ads-api.js`  
**Methods to implement** (6 minimum):

```javascript
async authenticate(authCode)        // OAuth token exchange
async getAccounts()                 // List accounts
async getCampaigns(customerId)      // List campaigns
async getAds(campaignId)            // List ads
async createCampaign(customerId, campaign) // Create
async updateCampaign(customerId, campaignId, updates) // Update
```

**Reference**: Use `server/services/meta-api.js` as pattern (43KB, comprehensive)  
**Deliverable**: `server/services/google-ads-api.js` + tests  
**Success Criteria**:
- [ ] All 6 methods implemented (not stubs)
- [ ] Unit tests: `tests/unit/services/google-ads-api.test.js` (>80% coverage)
- [ ] Can authenticate with test account
- [ ] Error handling for rate limits & auth failures

---

### Task A.2.3: Wire to Express Routes
**What**: Create routes for Google Ads  
**File**: Create `server/routes/google-ads.js`

**Endpoints**:
- `GET /api/google-ads/accounts` — List linked accounts
- `POST /api/google-ads/accounts` — Link new account (OAuth)
- `DELETE /api/google-ads/accounts/:id` — Unlink
- `GET /api/google-ads/campaigns` — List campaigns
- `POST /api/google-ads/campaigns` — Create campaign

**Deliverable**: New route file + integration tests  
**Success Criteria**:
- [ ] All endpoints callable via API
- [ ] Integration tests pass
- [ ] Proper error responses

---

### Task A.2.4: Add Settings UI for Google Ads
**What**: Frontend UI to connect Google Ads  
**File**: Update `client/src/views/settings.js`

**Add**:
- "Connect Google Ads" button
- List of connected accounts
- Disconnect button

**Success Criteria**:
- [ ] OAuth flow works in browser
- [ ] Accounts display after connection
- [ ] Can disconnect & reconnect

---

## A.3: Implement TikTok Ads API (Empty → Real)

### Task A.3.1: Implement TikTok API Client
**What**: Replace empty class with real implementation  
**File**: `server/services/tiktok-api.js`

**Methods** (6 minimum):
```javascript
async authenticate(accessToken)
async getAccounts()
async getCampaigns(accountId)
async getAds(campaignId)
async createCampaign(accountId, campaign)
async updateCampaign(accountId, campaignId, updates)
```

**Note**: TikTok uses Business Account Token (no OAuth like Meta)

**Deliverable**: Implementation + tests  
**Success Criteria**:
- [ ] All 6 methods implemented
- [ ] Unit tests (>80% coverage)
- [ ] Rate limiting: 1500 reqs/hour

---

### Task A.3.2: Wire to Routes & Settings UI
**What**: Create routes + frontend UI  
**File**: Create `server/routes/tiktok-ads.js`, update `settings.js`

**Success Criteria**:
- [ ] All endpoints work
- [ ] Settings UI functional
- [ ] Can add/remove TikTok token

---

## A.4: Fix Critical Frontend Issue

### Task A.4.1: Replace Campaigns Hardcoded Data with API
**What**: Campaigns view shows fake data; wire to real `/api/campaigns`  
**File**: `client/src/views/campaigns-list.js`

**Change**:
```javascript
// BEFORE: const campaigns = [{ id: '1', name: 'Dummy Campaign' }];
// AFTER: const campaigns = await api.getCampaigns();
```

**Deliverable**: Updated view  
**Success Criteria**:
- [ ] Shows real campaigns from DB
- [ ] Filters work (platform, status, date)
- [ ] Sorting works (name, date, status)
- [ ] Pagination works (if >20 campaigns)
- [ ] E2E test verifies real data loads

---

### Task A.4.2: Add Create Campaign Modal
**What**: Users can create campaigns from UI  
**Changes**: Add "New Campaign" button + modal form  
**Success Criteria**:
- [ ] Form validation works
- [ ] POST to `/api/campaigns` succeeds
- [ ] New campaign appears in list

---

## Phase A Success Metrics

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Database | 1 canonical DB | `sqlite3 adforge.db ".tables"` shows all tables |
| Data migration | 100% success | Migration validation script returns 0 errors |
| Google Ads API | 6 methods + tests | `npm test -- google-ads-api.test.js` passes |
| TikTok Ads API | 6 methods + tests | `npm test -- tiktok-api.test.js` passes |
| Frontend data | Real campaigns | E2E test loads campaigns from DB |
| All tests | Pass | `npm test` returns 0 failures |

---

# PHASE B: Frontend Architecture & Data Integration

**Duration**: 4-5 weeks | **Effort**: L | **Goal**: State management, error handling, real data in all views

## B.1: Implement State Management with Zustand

### Task B.1.1: Design & Install Zustand
**What**: Choose state management (Zustand = lightweight, battle-tested)  
**Steps**:
1. Install: `npm install zustand`
2. Create stores in `client/src/lib/stores/`:
   - `user-store.js` (auth, profile)
   - `campaign-store.js` (campaigns, selected)
   - `ad-store.js` (ads, selected)
   - `ui-store.js` (modals, loading, errors)

**Deliverable**: 4 store files + `docs/state-management-design.md`  
**Success Criteria**:
- [ ] Zustand installed
- [ ] All stores created
- [ ] No build errors
- [ ] Can import in views

---

### Task B.1.2: Migrate All 26 Views to Use Stores
**What**: Replace local state with Zustand  
**Before**:
```javascript
const [campaigns, setCampaigns] = useState([]);
useEffect(() => {
  api.getCampaigns().then(setCampaigns);
}, []);
```

**After**:
```javascript
const { campaigns, loading } = useCampaignStore();
useEffect(() => {
  useCampaignStore.getState().fetchCampaigns();
}, []);
```

**Priority order**:
1. Campaigns list (most used)
2. Ads list
3. Analytics
4. Dashboard
5. Settings
6. Others (20 more)

**Deliverable**: 26 updated view files  
**Success Criteria**:
- [ ] All views migrated
- [ ] No local state for shared data
- [ ] Views share data via store
- [ ] All tests pass

---

## B.2: Error Handling & Loading States

### Task B.2.1: Create Error Boundary Component
**What**: Catch and display errors gracefully  
**File**: `client/src/components/error-boundary.js`

**Functionality**:
- Catches rendering errors
- Shows user-friendly message
- "Try Again" button
- Logs error for debugging

**Success Criteria**:
- [ ] Component works
- [ ] Catches errors in views
- [ ] Shows appropriate message

---

### Task B.2.2: Add Loading & Error States to All Views
**What**: Every view needs loading, error, empty states  
**Pattern for each view**:
```javascript
if (error) return showError(error);      // Error state
if (loading) return showSpinner();       // Loading state
if (!data.length) return showEmpty();    // Empty state
return showData(data);                   // Content
```

**Deliverable**: 26 updated views  
**Success Criteria**:
- [ ] All views have loading state
- [ ] All views have error state
- [ ] All views have empty state
- [ ] Spinners/messages appear correctly

---

### Task B.2.3: Create Shared Error Handler
**What**: Centralize error handling  
**File**: `client/src/lib/error-handler.js`

**Handles**:
- Log error
- Show user notification
- Retry logic for transient errors
- Error analytics (optional)

**Success Criteria**:
- [ ] All API errors flow through handler
- [ ] User sees appropriate message
- [ ] Errors logged

---

## B.3: Component Library

### Task B.3.1: Create 8 Reusable Components
**What**: Extract common UI patterns into components  
**Components** (in `client/src/components/`):
1. `Button.js` (primary, secondary, danger)
2. `Modal.js` (with header, body, footer)
3. `Form.js` (input fields, validation)
4. `Table.js` (sortable, paginated)
5. `Card.js` (content container)
6. `Badge.js` (status badges)
7. `Toast.js` (notifications)
8. `Spinner.js` (loading indicator)

**Deliverable**: 8 component files  
**Success Criteria**:
- [ ] All components created
- [ ] Consistent styling
- [ ] Reusable in any view
- [ ] Props well-documented

---

### Task B.3.2: Refactor Views to Use Components
**What**: Replace inline UI with components  
**Before**:
```javascript
const btn = document.createElement('button');
btn.textContent = 'Save';
btn.className = 'btn btn-primary';
```

**After**:
```javascript
import { Button } from '../components/Button';
const btn = Button({ label: 'Save', variant: 'primary' });
```

**Success Criteria**:
- [ ] All views use components
- [ ] No inline HTML creation
- [ ] Consistent styling

---

### Task B.3.3: Implement Responsive Design (Optional)
**What**: Make UI work on mobile  
**Changes**:
- CSS media queries for 375px+ viewport
- Touch-friendly buttons (44px+ height)
- Responsive tables
- Mobile-optimized modals

**Success Criteria**:
- [ ] App works on mobile
- [ ] Touch targets 44px+
- [ ] E2E tests verify mobile UX

---

## B.4: Complete Placeholder Views

### Task B.4.1: Implement Analytics View
**What**: Replace placeholder with real analytics  
**File**: `client/src/views/analytics.js`

**Show**:
- Campaign performance (CTR, CPC, ROI)
- Ad performance (impressions, clicks, conversions)
- Charts (line, bar)
- Date range picker
- Export to CSV

**Success Criteria**:
- [ ] Fetches real analytics data
- [ ] Charts render correctly
- [ ] Date filtering works
- [ ] Can export CSV

---

### Task B.4.2-5: Implement 4 More Views
**Views**: Creator Dashboard, Optimizer, AI Suggestions, Settings (complete)

**For each**:
- [ ] Real data from API
- [ ] Full CRUD operations
- [ ] Proper error handling
- [ ] E2E tests pass

---

## B.5: Input Validation & Forms

### Task B.5.1: Create Validation System
**What**: Reusable form validators  
**File**: `client/src/lib/validation.js`

**Validators**:
```javascript
validators.required (value) // Must have value
validators.email(value)     // Valid email
validators.minLength(3)     // Min 3 chars
validators.number(value)    // Must be number
validators.budget(value)    // Must be > 0
```

**Success Criteria**:
- [ ] All validators implemented
- [ ] validateForm() works
- [ ] Error messages display

---

### Task B.5.2: Wire Validation to All Forms
**What**: Add validation to all forms  
**Forms**:
- Login/Register
- Create/Edit Campaign
- Create/Edit Ad
- Create/Edit Landing Page
- Settings forms
- Webhooks

**Success Criteria**:
- [ ] All forms validate before submit
- [ ] Error messages display
- [ ] Cannot submit invalid data

---

## Phase B Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| State mgmt | Zustand | App uses store for all shared data |
| Error handling | 100% of views | All 26 views show error states |
| Loading states | 100% of async views | Spinners during data fetch |
| Components | 8 reusable | Component library complete |
| Views | 26 functional | No placeholder text |
| Forms | 100% validated | All forms have validation |
| Mobile | 375px+ | E2E tests pass on mobile |
| Test coverage | >85% frontend | Coverage report shows 85%+ |

---

# PHASE C: Testing, Documentation & Consolidation

**Duration**: 3-4 weeks | **Effort**: M | **Goal**: Complete deferred tests, fix docs, consolidate tools

## C.1: Complete Deferred Unit Tests

### Task C.1.1: Write meta-video-service Tests (E1)
**What**: Complete deferred unit tests  
**File**: `tests/unit/services/meta-video-service.test.js`

**Test cases** (10+):
- authenticate() with valid/invalid token
- uploadVideo() with valid/oversized/invalid format file
- uploadVideo() with network error (retry)
- attachCaption() with LLM output
- Concurrent uploads (queue)
- Cancel upload in progress
- Rate limiting (30 reqs/min)

**Success Criteria**:
- [ ] 10+ test cases
- [ ] All pass
- [ ] Coverage >85%
- [ ] Error paths tested

---

### Task C.1.2: Write content-scheduler Tests (E2)
**What**: Scheduler service tests  
**File**: `tests/unit/services/content-scheduler.test.js`

**Test cases** (9+):
- addToQueue() with valid schedule
- addToQueue() with past date (error)
- getQueue() by status
- executeSchedule() at scheduled time
- cancelSchedule() removes from queue
- retryFailed() retries items
- Status updates (pending → completed)
- Persistence (queue survives restart)
- Concurrent execution limit

**Success Criteria**:
- [ ] 9+ test cases
- [ ] All pass
- [ ] Coverage >85%

---

### Task C.1.3: Write Full Pipeline Integration Test (E3)
**What**: End-to-end integration test  
**File**: `tests/integration/full-pipeline.test.js`

**Flow**:
1. Create campaign → `POST /api/campaigns`
2. Create ad → `POST /api/ads`
3. Generate video → `POST /api/ai/generate-video`
4. Schedule upload → `POST /api/schedules`
5. Execute → Call scheduler
6. Verify → Check platform for content

**Success Criteria**:
- [ ] Full pipeline works
- [ ] All steps verified
- [ ] Handles failures gracefully

---

## C.2: Implement Spend Alerts

### Task C.2.1: Implement Alert Functions
**What**: Replace empty functions with real alerts  
**File**: `scripts/spend_monitor_1041.py`

**Implement**:
```python
def send_alert(msg, **kw):
  """Send alert via email/slack/webhook"""
  # email, slack, webhook, push notification options
  
def send_batch_alerts(msg, **kw):
  """Send alert to multiple users"""
```

**Success Criteria**:
- [ ] Alerts send via email
- [ ] Alerts send via Slack (if configured)
- [ ] Alerts send via webhook
- [ ] User receives alert within 1 minute

---

### Task C.2.2: Wire Alerts to Spend Monitor
**What**: Trigger alerts at thresholds  
**Changes**:
- 80% threshold → alert
- 100% threshold → alert + escalate

**Success Criteria**:
- [ ] Alerts trigger correctly
- [ ] Configurable per user
- [ ] E2E test verifies

---

## C.3: Update Documentation

### Task C.3.1: Audit All AGENTS.md Files
**What**: Check accuracy of documentation  
**Files**:
- `/AGENTS.md`
- `server/AGENTS.md`
- `server/routes/AGENTS.md`
- `server/services/AGENTS.md`
- `client/AGENTS.md`
- `client/src/AGENTS.md`
- `db/AGENTS.md`
- `tests/AGENTS.md`

**Success Criteria**:
- [ ] All declared files exist
- [ ] All descriptions accurate
- [ ] No broken references

---

### Task C.3.2: Remove Non-Existent References
**What**: Delete declarations for non-existent files  
**Files that don't exist**:
- `routes/platform-client.js`
- `routes/escape.js`
- `routes/rate-limiter.js`
- `routes/validate.js`

**Success Criteria**:
- [ ] No orphan references
- [ ] All declarations match reality

---

### Task C.3.3: Document All Routes & Services
**What**: Add missing files to AGENTS.md  
**Files to document**:
- 35+ route files
- 45+ service files

**Success Criteria**:
- [ ] 100% of files documented
- [ ] One-line description each
- [ ] No gaps

---

### Task C.3.4: Complete Documentation TODOs
**What**: Fill in placeholder TODOs in `docs/references/adcp.md`  
**Success Criteria**:
- [ ] No [TODO] tags remain
- [ ] All sections have real content

---

## C.4: Consolidate Standalone Tools

### Task C.4.1: Audit Standalone Directories
**What**: Understand each tool, decide: integrate or archive  
**Directories**:
1. `adforge-dashboard/` — Separate dashboard
2. `adforge-generator/` — Ad generation tool
3. `ads-optimizer/` — Python spend optimizer
4. `shopee-ads-optimizer/` — Shopee optimizer

**Decision criteria**:
- Is it duplicate of main app?
- Does it add unique value?
- Should it be integrated or kept external?

**Deliverable**: `docs/standalone-tools.md` (decision for each)  
**Success Criteria**:
- [ ] All tools documented
- [ ] Integration recommendations clear
- [ ] Stakeholder approval

---

### Task C.4.2: Execute Consolidation Decision
**What**: Archive duplicates, integrate valuable tools  
**Recommendation**:
- Archive: `adforge-dashboard`, `adforge-generator`
- Keep: `shopee-ads-optimizer` (valuable niche)
- Evaluate: `ads-optimizer` (merge into autonomous agent?)

**Success Criteria**:
- [ ] Codebase consolidated
- [ ] No confusion about what to use

---

## C.5: Create Deployment Guides

### Task C.5.1: Update README
**What**: Document current state + quick start  
**Changes**:
- Feature checklist (% complete)
- Supported platforms list
- Architecture diagram
- Deployment instructions

**Success Criteria**:
- [ ] Accurate & complete
- [ ] Can be used as quick-start

---

### Task C.5.2: Create Deployment Guide
**What**: Step-by-step deployment procedure  
**File**: `docs/DEPLOYMENT.md`

**Content**:
- Database migration steps
- Environment variables
- Testing checklist
- Rollback procedure
- Post-deploy verification

**Success Criteria**:
- [ ] Clear step-by-step
- [ ] Any team member can follow
- [ ] Rollback documented

---

## Phase C Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Tests E1-E3 | Complete | All tests pass, >85% coverage |
| Alert system | Functional | Alerts trigger at thresholds |
| AGENTS.md | 100% accurate | Zero discrepancies |
| Documentation | Complete | No TODOs, comprehensive README |
| Consolidation | Decision made | Codebase organized |
| Deployability | Production-ready | DEPLOYMENT.md works |

---

# PHASE D: Optimization, Security & Launch

**Duration**: 2-3 weeks | **Effort**: M | **Goal**: Production-ready app

## D.1: Performance Optimization

### Task D.1.1: Frontend Bundle Optimization
**What**: Reduce initial load time  
**Goals**:
- Bundle < 500KB
- First Contentful Paint < 2s
- Lighthouse score > 85

**Steps**:
1. Analyze: `npm run build -- --analyze`
2. Remove unused deps
3. Code splitting for routes
4. Lazy-load components

**Success Criteria**:
- [ ] Bundle < 500KB
- [ ] Load time < 2s on 3G
- [ ] Lighthouse > 85

---

### Task D.1.2: Database Query Optimization
**What**: Add indexes, implement caching  
**Steps**:
1. Profile slow queries
2. Add missing indexes
3. Implement Redis caching
4. Archive old records

**Success Criteria**:
- [ ] Queries < 100ms at scale
- [ ] No table scans
- [ ] Cache hit rate > 50%

---

### Task D.1.3: API Rate Limiting
**What**: Protect endpoints from abuse  
**Limits**:
- Public: 100 reqs/min
- Authenticated: 1000 reqs/min
- Auth endpoints: 10 reqs/min

**Success Criteria**:
- [ ] Rate limits enforced
- [ ] Returns 429 when exceeded
- [ ] User sees friendly message

---

## D.2: Security Hardening

### Task D.2.1: Security Audit
**What**: Check for vulnerabilities  
**Checklist**:
- [ ] HTTPS enforced
- [ ] CSRF tokens on forms
- [ ] SQL injection protection
- [ ] XSS protection
- [ ] CORS properly configured
- [ ] Secrets not in git
- [ ] Password hashing (bcrypt)
- [ ] JWT expiry
- [ ] Rate limiting on auth
- [ ] Input validation

**Success Criteria**:
- [ ] All checklist items pass
- [ ] No HIGH severity issues

---

### Task D.2.2: Add Security Headers
**What**: Implement response security headers  
**Headers**:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- HSTS: max-age=31536000
- CSP: default-src 'self'

**Success Criteria**:
- [ ] All headers present
- [ ] No CSP violations
- [ ] Security grade A on Observatory

---

## D.3: Monitoring & Logging

### Task D.3.1: Error Logging
**What**: Central error logging  
**Logs include**: timestamp, error type, path, stack trace

**Success Criteria**:
- [ ] All errors logged
- [ ] Can diagnose from logs
- [ ] Errors searchable

---

### Task D.3.2: Performance Monitoring
**What**: Track key metrics  
**Metrics**:
- API response times (by endpoint)
- Database query times
- Error rate
- User count (active)
- Campaign/Ad count

**Success Criteria**:
- [ ] Can see response times
- [ ] Can identify slow endpoints
- [ ] Error rates tracked

---

### Task D.3.3: Set Up Alerts
**What**: Alert on critical issues  
**Alerts**:
- Error rate > 5%
- API response > 1s
- Database down
- Disk < 10%
- Memory > 80%

**Success Criteria**:
- [ ] Team notified quickly
- [ ] False alarms minimized

---

## D.4: Advanced Testing

### Task D.4.1: E2E Test Suite
**What**: Playwright tests for critical flows  
**Flows** (10+):
1. User registration & login
2. Create campaign
3. Create ad
4. Generate ad copy (AI)
5. Schedule content
6. Connect Meta account
7. Connect Google Ads
8. Connect TikTok
9. View analytics
10. Create automation rule

**Success Criteria**:
- [ ] All flows tested
- [ ] Tests pass consistently
- [ ] Runs in CI/CD

---

### Task D.4.2: Load Testing
**What**: Test system under load  
**Scenario**:
- 100 concurrent users
- Each creates 5 campaigns
- Generate ads, schedule content
- View analytics

**Tool**: Apache JMeter or k6

**Success Criteria**:
- [ ] System handles 100 users
- [ ] Response times < 1s
- [ ] No errors under load

---

### Task D.4.3: Achieve >85% Coverage
**What**: Test coverage by layer  
**Targets**:
- Services: >90%
- Routes: >85%
- Views: >75%
- Utilities: >90%
- **Overall**: >85%

**Success Criteria**:
- [ ] Coverage > 85%
- [ ] No untested paths
- [ ] Critical paths at 95%+

---

## D.5: Production Deployment

### Task D.5.1: Prepare Environment
**What**: Set up production infrastructure  
**Steps**:
1. Choose hosting (AWS, DigitalOcean, Render, Railway)
2. CI/CD pipeline (GitHub Actions)
3. Environment variables
4. Database backups (daily)
5. SSL certificates

**Success Criteria**:
- [ ] App runs on production
- [ ] HTTPS enforced
- [ ] Daily backups running

---

### Task D.5.2: Create Production Runbook
**What**: Operational procedures  
**File**: `docs/RUNBOOK.md`

**Content**:
- Deployment steps
- Rollback procedure
- Emergency contacts
- Common issues & fixes
- Health check procedures
- Backup/restore procedures

**Success Criteria**:
- [ ] Any team member can follow
- [ ] Clear emergency procedures

---

### Task D.5.3: Post-Launch Monitoring
**What**: Monitor production for first month  
**Checklist**:
- [ ] Check error logs daily
- [ ] Monitor performance
- [ ] Verify backups
- [ ] Respond to user feedback
- [ ] Fix critical issues immediately

**Success Criteria**:
- [ ] Zero critical issues
- [ ] Performance meets targets
- [ ] User satisfaction high

---

## Phase D Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Bundle size | <500KB | Webpack analysis |
| Page load | <2s on 3G | Lighthouse / WebPageTest |
| API response | <100ms (p95) | Monitoring dashboard |
| Uptime | >99.5% | Monitoring |
| Error rate | <1% | Error logs |
| Test coverage | >85% | Coverage report |
| Security | A grade | Observatory.mozilla.org |
| Load handling | 100+ users | Load test |

---

---

# 📅 Timeline & Gantt Chart

```
Weeks: 1    5    10   15   20
         |    |    |    |    |
PHASE A  |====|
         Database & APIs (3-4 wks)
         
PHASE B        |===========|
               Frontend Architecture (4-5 wks)
               
PHASE C              |===========|
                     Testing & Docs (3-4 wks)
                     
PHASE D                    |========|
                           Optimization (2-3 wks)
                           
Total: ~13-16 weeks (team of 3-4)
```

---

# 🚨 Risk Register

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| Database migration data loss | Critical | Medium | Backup both DBs, test staging first, verify counts |
| Google Ads API auth fails | High | Medium | Use test account, implement retry logic |
| Frontend refactor breaks features | High | Medium | Comprehensive E2E tests, feature flags |
| Scope creep | High | High | Strict phase gates, daily standups, burndown chart |
| Performance regression | Medium | Medium | CI/CD performance tests, alert thresholds |
| Team context loss | Medium | Medium | Document decisions in ADRs, pair programming |

---

# ✅ Success Criteria (Project Level)

- ✅ All 14 gaps closed
- ✅ >85% test coverage
- ✅ 0 critical production issues (first month)
- ✅ <2s page load time
- ✅ >99.5% uptime
- ✅ All AGENTS.md accurate
- ✅ Team can explain architecture
- ✅ Ready for 10x user growth

---

# 👥 Resource Allocation

**Team of 3-4 engineers**:
- **Engineer 1**: Database + APIs (Phase A), then Frontend components (Phase B)
- **Engineer 2**: Frontend architecture + views (Phase B), then Testing (Phase C)
- **Engineer 3**: Documentation + consolidation (Phase C), then Production (Phase D)
- **Engineer 4** (if available): Parallel speed-up of Phase B

**PM/Tech Lead**: Daily standups, blocker removal, decision-making

---

# 📝 Execution Checklist

**Before starting Phase A**:
- [ ] Team reviewed this plan
- [ ] Stakeholders approved timeline
- [ ] Database strategy reviewed
- [ ] Environment variables configured

**During each phase**:
- [ ] Daily standups (15 min)
- [ ] Burndown chart tracked
- [ ] Blockers resolved same-day
- [ ] Code review on every PR
- [ ] Tests pass before merge

**Between phases**:
- [ ] Phase success metrics verified
- [ ] Retrospective + lessons learned
- [ ] Adjust timeline if needed
- [ ] Stakeholder sync on progress

**Before production**:
- [ ] All Phase D tasks complete
- [ ] DEPLOYMENT.md followed
- [ ] RUNBOOK.md tested
- [ ] Incident response plan in place
- [ ] On-call rotation established

---

**Status**: Ready for handoff to engineering team  
**Last Updated**: 2026-05-30  
**Next Review**: After Phase A completion

