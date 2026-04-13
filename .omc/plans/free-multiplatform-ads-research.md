# Free Multi-Platform Ads Library Research - Implementation Plan

**Date**: 2026-04-09
**Author**: Claude Code

## Requirements Summary

Implement truly free multi-platform ads library research that works on Meta, Google, and TikTok platforms without requiring any API keys.

### User Requirements
| Requirement | Detail |
|------------|---------|
| Platforms | Support Meta, Google, and TikTok ads libraries |
| Data Source | Hybrid approach - prioritize public APIs, fallback to web scraping |
| AdSpire Integration | Use AdSpire capability as reference, implement optional AdSpire provider |
| OpenCLI | Use OpenCLI-style architecture for CLI and web interface |

---

## RALPLAN-DR Summary

### Principles
1. **Public-First**: Prioritize free/public data access over paid APIs
2. **Hybrid Resilience**: Use multiple data sources (public APIs + scraping) for reliability
3. **Extensibility**: Design architecture to easily add new platforms
4. **Rate Limit Aware**: Implement smart rate limiting and caching
5. **Transparent Fallbacks**: Always provide fallback to scraping when APIs fail

### Decision Drivers
1. **User Accessibility**: Must work without API keys (free tier requirement)
2. **Platform Coverage**: Support Meta, Google, TikTok as requested
3. **Data Reliability**: Hybrid approach ensures availability even if one source fails
4. **Extensibility**: Architecture should support adding new platforms easily
5. **OpenCLI Integration**: Maintain consistent interface with web app

### Viable Options

#### Option A: Modular Platform Adapters with Public APIs + Scraping Fallbacks
**Approach**: Create a unified ads library service with platform-specific adapters. Each adapter implements:
- Public API integration (e.g., Google Ads Transparency Center API)
- Web scraping fallback (for data not available via API)
- Caching layer to reduce API calls and improve performance
- Rate limiting per platform

**Pros**:
- Clean separation of concerns per platform
- Easy to add new platforms
- Can optimize rate limiting per platform
- Caching benefits apply across all platforms

**Cons**:
- More complex architecture
- Scraping may be unreliable (pages change, anti-bot measures)
- Multiple adapter interfaces to maintain

#### Option B: Universal Web Scraper with AdSpire Integration
**Approach**: Create a unified web scraper that extracts ad data from public ad library pages. Integrate AdSpire as an optional data source for enhanced intelligence.

**Pros**:
- Single, simpler architecture
- Works without any external APIs
- AdSpire provides fallback when scraping fails
- Consistent data format

**Cons**:
- Scraping may be blocked by anti-bot measures
- Page structures change frequently (maintenance overhead)
- May violate ToS (Terms of Service)

#### Option C: Mixed Approach - Public APIs Where Available, Scraping Where Not
**Approach**: For each platform, evaluate if a public API exists and use it. Fall back to scraping only for platforms without public APIs or when rate limits are hit.

**Pros**:
- Best of both worlds for platforms with public APIs
- Scraping only used when necessary (lower blocking risk)
- Reduces unnecessary scraping

**Cons**:
- More complex logic per platform
- Inconsistent approach across platforms

### Decision

**Chosen Option**: Option A - Modular Platform Adapters with Public APIs + Scraping Fallbacks

**Why**:
- Provides the cleanest separation of concerns
- Most extensible for future platforms
- Allows platform-specific optimization (rate limits, caching)
- Scraping fallbacks available when public APIs fail or rate limited
- Aligns with user requirement for "Hybrid" approach
- Public APIs used where available reduces scraping needs and blocking risk

**Invalidation Rationale for Alternatives**:
- Option B rejected: Scraping-first approach has high maintenance overhead and ToS violation risks. AdSpire as backup doesn't justify building full scraper.
- Option C rejected: Mixed approach creates inconsistency and complexity; Option A's clean adapter pattern is better for maintenance.

---

## Implementation Steps

### Phase 1: Architecture & Core Infrastructure

#### Step 1.1: Create Platform-Agnostic Ads Library Service
- **File**: `server/services/ads-library.js` (new)
- Create `BasePlatformAdapter` class with common interface
- Create platform-specific adapters: `MetaAdapter`, `GoogleAdapter`, `TikTokAdapter`
- Each adapter implements:
  - `searchAds(query, options)` - Search for ads
  - `getAdDetails(adId)` - Get detailed ad information
  - `getAvailablePublicAPIs()` - Return available public API endpoints

#### Step 1.2: Create Web Scraping Service
- **File**: `server/services/web-scraper.js` (new)
- Implement `BaseScraper` class
- Implement platform-specific scrapers: `MetaScraper`, `GoogleScraper`, `TikTokScraper`
- Each scraper implements:
  - `scrapeAdsLibrary(query, options)` - Extract ads from public pages
  - `extractAdMetadata(pageUrl)` - Extract ad data from HTML
- Features:
    - `Puppeteer`/`Playwright` support for JavaScript-heavy pages
    - Rate limiting per platform
    - Request deduplication
    - Proxy support (for avoiding blocks)

#### Step 1.3: Create Unified Ads Library Service
- **File**: `server/services/unified-ads-library.js` (new)
- Orchestrate between adapters and scrapers
- Implements hybrid logic:
  1. Try platform public API first
  2. Fall back to scraper if API fails or not available
  3. Apply rate limiting and caching
  4. Return consistent format across all platforms

#### Step 1.4: Implement Caching Layer
- **File**: `server/services/cache-service.js` (new)
- Implement `Redis` or in-memory cache
- Cache responses from public APIs to reduce calls
- Cache scraped results with TTL (time-to-live based)
- Cache keys: `ads:${platform}:${query}`

#### Step 1.5: Update CLI with New Commands
- **File**: `adforge-cli.js` (update)
- Add commands:
  - `ads-search <query> --platform <platform> --source <api|scrape>` - Search with source preference
  - `ads-sources --list` - List available data sources for each platform
  - `research <competitor> --platform <all> --days 7` - Full competitor research

### Phase 2: Platform-Specific Implementation

#### Step 2.1: Implement Meta Ads Library Adapter
- **File**: `server/services/platform-adapters/meta-adapter.js` (new)
- **API**: Meta Ads Archive Graph API
- **Changes**:
  - Add public search mode (no access token required)
  - Reuse existing `ad-research.js` where possible
  - Implement graceful fallback to scraper when token missing

#### Step 2.2: Implement Google Ads Library Adapter
- **File**: `server/services/platform-adapters/google-adapter.js` (new)
- **API**: Google Ads Transparency Center
- **Public Endpoint**: Google Display Ads API (no authentication for basic search)
- **Implementation**:
  - Query publicly viewable ads
  - Extract ad details without login
  - Rate limiting (strict limits per Google policies)

#### Step 2.3: Implement TikTok Ads Library Adapter
- **File**: `server/services/platform-adapters/tiktok-adapter.js` (new)
- **API**: TikTok Creative Center (public discovery)
- **Implementation**:
  - Use TikTok embeds or public API where available
  - Fallback to web scraping for ad discovery
  - Extract trending hashtags for additional insights

### Phase 3: Web Scraping Implementation

#### Step 3.1: Implement Base Scraper Infrastructure
- **File**: `server/services/web-scraper/base-scraper.js` (new)
- Implement `PuppeteerPool` for managing browser instances
- Implement `ProxyManager` for rotating proxies (optional)
- Implement `RequestQueue` with rate limiting

#### Step 3.2: Implement Meta Scraper
- **File**: `server/services/web-scraper/meta-scraper.js` (new)
- Target: Meta Ads Library public pages
- Extract: ad headlines, descriptions, images, URLs
- Handle: Pagination, infinite scroll, dynamic content

#### Step 3.3: Implement Google Scraper
- **File**: `server/services/web-scraper/google-scraper.js` (new)
- Target: Google Display Ads public listings
- Extract: Ad text, display URLs, targeting options
- Handle: iframe content, dynamic loading

#### Step 3.4: Implement TikTok Scraper
- **File**: `server/services/web-scraper/tiktok-scraper.js` (new)
- Target: TikTok Creative Center / public ads
- Extract: Video data, hashtags, engagement metrics
- Handle: Mobile app patterns, infinite scroll

### Phase 4: API Integration

#### Step 4.1: Create API Routes
- **File**: `server/routes/ads-library.js` (new)
- Implement unified endpoints:
  - `GET /api/ads-library/search` - Search across all platforms
  - `GET /api/ads-library/sources` - Get available data sources
  - `GET /api/ads-library/ad/:id` - Get ad details
  - `GET /api/ads-library/stats` - Get platform statistics

#### Step 4.2: Update Existing Routes
- **File**: `server/routes/meta.js`, `server/routes/trending.js` (update)
- Add optional `source=api|scrape` parameter
- Route requests to new `unified-ads-library.js` service

### Phase 5: AdSpire Integration (Optional)

#### Step 5.1: Create AdSpire Service Adapter
- **File**: `server/services/adspire-adapter.js` (new)
- **API**: https://www.adspire.com/ (user-provided)
- **Implementation**:
  - Create service that mimics AdIntelligenceService interface
  - Implement optional `ADSPIRE_API_KEY` configuration
  - Use AdSpire data as fallback when Similarweb not configured

#### Step 5.2: Update Competitor Spy to Use AdSpire
- **File**: `server/services/competitor-spy.js` (update)
- Add AdSpire as optional data source
- Update `monitorCompetitor()` to use AdSpire when available

### Phase 6: Testing & Verification

#### Step 6.1: Create Integration Tests
- **File**: `tests/integration/free-ads-library.test.js` (new)
- Test each platform adapter independently
- Test fallback logic (API → scraper)
- Test rate limiting behavior
- Verify consistent output format

#### Step 6.2: Create CLI Tests
- **File**: `tests/cli/free-ads.test.js` (new)
- Test new CLI commands
- Verify source parameter works correctly

#### Step 6.3: Update Documentation
- **File**: `FREE_ADS_LIBRARY.md` (new)
- Document new architecture
- Provide usage examples
- List available data sources per platform
- Document rate limits and caching behavior

---

## Acceptance Criteria

### Core Functionality
- [ ] Search ads across Meta, Google, and TikTok platforms without API keys
- [ ] Each platform returns ads in consistent JSON format
- [ ] Fallback from public API to web scraping works automatically
- [ ] Rate limiting prevents blocks from public APIs
- [ ] Caching reduces duplicate API calls
- [ ] CLI commands work for all platforms
- [ ] Optional AdSpire integration available

### Performance
- [ ] Search completes within 5 seconds (cached results)
- [ ] Web scraping fallback completes within 10 seconds
- [ ] Cache hit rate > 80% for repeated queries
- [ ] Memory usage stays under 500MB for scraping operations

### Quality
- [ ] Ad data accuracy > 90% for public API sources
- [ ] Scraped data accuracy > 80% (with best effort selectors)
- [ ] No data loss between API and scraped results (unified format)
- [ ] Error messages are clear and actionable

### Compatibility
- [ ] Works with existing AdForge database schema
- [ ] Compatible with existing authentication (no auth needed for public data)
- [ ] CLI maintains backward compatibility with existing commands

---

## Risks and Mitigations

### Risk 1: Scraping Blocking
- **Risk**: Public ad libraries may block scraping attempts (anti-bot, CAPTCHA, IP bans)
- **Mitigation**: 
  - Implement proxy rotation support (optional)
  - Add request delays between requests
  - Use residential IPs or VPN where possible
  - Implement exponential backoff for blocked requests
  - Graceful degradation: skip platform if all sources fail

### Risk 2: Rate Limits on Public APIs
- **Risk**: Public APIs have strict rate limits that may block legitimate requests
- **Mitigation**:
  - Implement per-platform rate limiting
  - Use caching to reduce API calls
  - Implement request queuing with cooldown periods
  - Monitor response codes for rate limit errors

### Risk 3: Page Structure Changes
- **Risk**: Ad library pages change structure frequently, breaking scrapers
- **Mitigation**:
  - Implement multiple scraping strategies per platform
  - Use CSS selectors and XPath over fixed IDs
  - Add fuzzy matching for dynamic class names and attributes
  - Log scraping errors with page snapshots for debugging

### Risk 4: AdSpire API Unavailability
- **Risk**: AdSpire service may go down or require payment
- **Mitigation**:
  - Make AdSpire integration optional
  - Provide clear error messages when AdSpire fails
  - Automatically fall back to scraping when AdSpire unavailable
  - Cache results to survive temporary outages

---

## Implementation Steps (Ordered)

### Step 1: Create Platform-Agnostic Architecture (30 min)
**Files to create**:
- `server/services/ads-library/base-adapter.js`
- `server/services/ads-library/meta-adapter.js`
- `server/services/ads-library/google-adapter.js`
- `server/services/ads-library/tiktok-adapter.js`
- `server/services/web-scraper/base-scraper.js`
- `server/services/cache-service.js`

**Actions**:
1. Create `BasePlatformAdapter` interface with methods:
   - `searchAds(query, options)`
   - `getAdDetails(adId)`
   - `getAvailablePublicAPIs()`
2. Implement `MetaAdapter`, `GoogleAdapter`, `TikTokAdapter` classes
3. Implement base scraper infrastructure
4. Implement caching service

**Verification**:
- New files compile without errors
- TypeScript types are generated for all new classes
- Interfaces are consistent across platforms

---

### Step 2: Implement Web Scraping Infrastructure (45 min)
**Files to create**:
- `server/services/web-scraper/meta-scraper.js`
- `server/services/web-scraper/google-scraper.js`
- `server/services/web-scraper/tiktok-scraper.js`

**Actions**:
1. Implement `PuppeteerPool` class
2. Implement platform-specific scrapers with:
   - Dynamic content loading (infinite scroll)
   - Multiple selector strategies (CSS, XPath, text)
   - Error handling and retries
3. Implement request queue with rate limiting

**Verification**:
- Each scraper can independently extract ads from test pages
- Rate limiting prevents request flooding
- Error handling prevents scraper crashes

---

### Step 3: Create Unified Ads Library Service (30 min)
**Files to create**:
- `server/services/unified-ads-library.js`

**Actions**:
1. Orchestrate between platform adapters and scrapers
2. Implement hybrid logic: try API first, fallback to scraping
3. Integrate with caching service
4. Return unified JSON format

**Verification**:
- Service accepts platform query with source preference
- Returns ads in consistent format
- Fallback from API to scraping works seamlessly
- Cache hits improve performance

---

### Step 4: Create API Routes (20 min)
**Files to modify**:
- `server/routes/ads-library.js` (new)
- `server/routes/meta.js` (modify)
- `server/routes/trending.js` (modify)
- `server/app.js` (register new routes)

**Actions**:
1. Create new `/api/ads-library/*` routes
2. Update existing routes to use new service
3. Register unified ads library service in app.js
4. Add source parameter handling

**Verification**:
- New routes respond correctly
- Existing routes updated to support source parameter
- Integration works without breaking existing functionality

---

### Step 5: Update CLI with New Commands (15 min)
**Files to modify**:
- `adforge-cli.js` (modify)

**Actions**:
1. Add `--source <api|scrape>` parameter to relevant commands
2. Add `ads-sources` command to list available data sources
3. Update help text to document new features

**Verification**:
- CLI commands work with all platforms
- Source parameter controls behavior correctly
- Help output is accurate

---

### Step 6: Optional AdSpire Integration (30 min)
**Files to create**:
- `server/services/adspire-adapter.js` (new)
- `server/services/competitor-spy.js` (modify)
- `server/config/index.js` (add AD_SPIRE_API_KEY)

**Actions**:
1. Create AdSpire adapter that matches AdIntelligenceService interface
2. Update competitor spy to use AdSpire when available
3. Add configuration option for API key

**Verification**:
- AdSpire integration is optional (not required)
- Works when AD_SPIRE_API_KEY is configured
- Falls back gracefully when not configured

---

### Step 7: Create Tests (20 min)
**Files to create**:
- `tests/integration/free-ads-library.test.js`
- `tests/cli/free-ads.test.js`
- `FREE_ADS_LIBRARY.md` (documentation)

**Actions**:
1. Write integration tests for new service
2. Write CLI tests for new commands
3. Create comprehensive documentation

**Verification**:
- All tests pass
- Documentation is complete
- Examples work correctly

---

## Verification Steps

### Step 1: Manual Testing
1. Test CLI search for each platform independently
2. Verify source parameter works (`--source api` vs `--source scrape`)
3. Test fallback behavior by using invalid API key
4. Verify rate limiting prevents blocks

### Step 2: Load Testing
1. Simulate concurrent requests across platforms
2. Verify caching reduces duplicate calls
3. Verify memory usage stays reasonable
4. Check error handling prevents crashes

### Step 3: Integration Testing
1. Test unified ads library service with web app
2. Verify existing routes still work
3. Test AdSpire integration (if implemented)
4. Verify CLI works with new and old commands

---

## Pre-Mortem (Failure Scenarios)

### Scenario 1: All Public APIs Down
- **Failure**: Meta, Google, and TikTok public APIs are unavailable
- **Impact**: No ads can be retrieved via APIs
- **Mitigation**: Web scrapers continue to work
- **Recovery**: System remains operational with degraded performance

### Scenario 2: Single Platform Scraping Blocked
- **Failure**: Meta blocks scraper IPs, Google/TikTok still work
- **Impact**: No Meta ads available
- **Mitigation**: Cross-platform results still available
- **Recovery**: Users informed of partial results

### Scenario 3: AdSpire Service Unavailable
- **Failure**: AdSpire API goes down or quota exceeded
- **Impact**: Reduced competitor intelligence
- **Mitigation**: Web scraping continues, caching provides partial data
- **Recovery**: System remains operational

---

## Follow-Up Actions

1. **Add More Platforms**: Architecture supports easy addition of Pinterest, LinkedIn, Snapchat
2. **Enhanced Scraping**: Add ML-powered selectors for better accuracy
3. **AI Enhancement**: Use LLM to summarize and analyze scraped ad data
4. **Browser Extension**: Create Chrome/Firefox extension for users to contribute data
5. **Distributed Scraping**: Add option for distributed scraping across multiple IPs

---

## ADR (Architecture Decision Record)

### Decision
Implement modular platform adapters with hybrid data sources (public APIs + web scraping fallbacks) for truly free multi-platform ads library research.

### Drivers
1. **User Accessibility**: Must work without API keys (free tier requirement)
2. **Platform Coverage**: Support Meta, Google, TikTok as requested
3. **Data Reliability**: Hybrid approach ensures availability even if one source fails
4. **Extensibility**: Architecture should support adding new platforms easily
5. **OpenCLI Integration**: Maintain consistent interface with web app

### Alternatives Considered
- **Option B**: Universal web scraper with AdSpire integration - Rejected due to high maintenance overhead and ToS risks
- **Option C**: Mixed approach (public APIs where available, scraping where not) - Rejected due to inconsistency and complexity

### Why Chosen
Option A provides the cleanest separation of concerns with platform-specific adapters. This allows:
- Easy addition of new platforms
- Platform-specific optimization (rate limits, caching)
- Scraping fallbacks when public APIs fail
- Aligns with user's "hybrid" requirement
- Extensible architecture for future platforms

### Consequences
- More initial development effort (modular architecture)
- Slightly more complex routing logic
- Requires implementing multiple scrapers
- Better long-term maintainability

### Follow-Up Actions
1. Monitor performance and optimize caching strategies
2. Add more public API integrations as they become available
3. Consider adding ML for improved data extraction
4. Evaluate browser extension option for user-contributed data

---

## Notes

- **Existing Code**: Keep `ad-research.js` for Meta's Ads Archive API access (when token available)
- **Backward Compatibility**: New architecture is additive, doesn't break existing features
- **AdSpire**: Optional integration - user provided specific API URL
- **Rate Limits**: Document recommended limits per platform in `FREE_ADS_LIBRARY.md`

---

**This plan implements a production-ready, truly free multi-platform ads library research system while maintaining all existing AdForge functionality.**
