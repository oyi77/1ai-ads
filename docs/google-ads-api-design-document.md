# Google Ads API — Design Document

## Company Information

| Field | Value |
|---|---|
| **Company Name** | BerkahKarya Digital |
| **Website** | https://adforge.aitradepulse.com |
| **Business Model** | SaaS Ad Management Platform — multi-platform campaign management, analytics, and AI-powered optimization for digital advertisers |
| **Industry** | AdTech / MarTech |
| **Primary Market** | Indonesia (ID), expanding to Southeast Asia |

---

## 1. Product Overview

**AdForge** is a hosted, multi-tenant SaaS ad management platform that allows advertisers to manage campaigns across **22 ad platforms** (Meta, Google, TikTok, LinkedIn, Twitter, Snapchat, Microsoft, Pinterest, Amazon, + 13 more) from a single dashboard. See `architecture.md`.

### Core Features
- **Multi-platform campaign management**: Create, read, update, pause, and activate campaigns across 8 ad platforms
- **Unified analytics dashboard**: Aggregate performance metrics (spend, impressions, clicks, conversions, ROAS) across all platforms
- **AI-powered ad generation**: Generate ad copy, landing pages, and creative variations using LLM
- **Automation rules engine**: Set rules like "pause campaign if ROAS < 1.0" with automatic execution
- **Creative fatigue detection**: Detect when ad creatives need refresh based on performance decay
- **Attribution tracking**: Track conversions back to specific ad campaigns via UTM parameters
- **Competitor intelligence**: Monitor competitor ad strategies across platforms

---

## 2. Google Ads API Use Case

### What we do with the Google Ads API

We use the Google Ads API to provide our users with the ability to:

1. **Read campaign data**: Retrieve campaign names, statuses, budgets, and performance metrics
2. **Read ad group and keyword data**: Access targeting settings and keyword performance
3. **Create and update campaigns**: Allow users to create new campaigns and modify existing ones
4. **Pull performance reports**: Fetch conversion metrics (spend, impressions, clicks, conversions, CTR, CPC, ROAS) for dashboard display
5. **Sync account structure**: Automatically discover and sync the user's Google Ads account hierarchy

### API methods we access

| Method | Purpose |
|---|---|
| `customers.listAccessibleCustomers` | Discover which Google Ads accounts the user can access |
| `customers/{id}/googleAds:searchStream` | Run GAQL queries for campaign/ad group/keyword data |
| `customers/{id}/campaigns:mutate` | Create and update campaigns |
| `customers/{id}/campaignBudgets:mutate` | Set and adjust campaign budgets |
| `customers/{id}/adGroups:mutate` | Create and manage ad groups |

### Access level requested
- **Read access**: Campaign structure, performance metrics, conversion data
- **Write access**: Campaign creation, status changes, budget adjustments

---

## 3. Data Handling & Security

### Authentication
- We use **OAuth 2.0** for user authorization
- Refresh tokens are stored encrypted at rest using AES-256-GCM
- Access tokens are obtained on-demand and never persisted
- Each user's Google Ads credentials are isolated per-tenant

### Data Storage
- Campaign metadata (name, status, budget) is stored in our SQLite database for offline access
- Performance metrics are cached for up to 6 hours to reduce API calls
- Raw API responses are never stored — only normalized data
- All data is encrypted at rest using industry-standard encryption

### Data Access
- Users can only see their own connected Google Ads accounts
- Multi-tenant isolation: `WHERE user_id = ?` on all queries
- No cross-user data leakage — verified by integration tests

### Data Retention
- Campaign data: retained as long as the user account is active
- Performance history: 90-day rolling window
- Users can disconnect their Google Ads account at any time, which deletes stored credentials

---

## 4. Rate Limiting & Quotas

### Our rate limiting strategy
- **Client-side rate limiter**: Maximum **8 requests/second** per Google Ads customer ID (verified `server/lib/platform-client.js:8` = `RateLimiter(8,1000)`; 10/s is the dev-token hard limit, 8 gives safe margin)
- **Exponential backoff**: Automatic retry with backoff on 429 responses
- **Request batching**: Multiple GAQL queries batched where possible
- **Caching**: 6-hour TTL on performance data to minimize API calls

### Expected API usage
| Metric | Estimate |
|---|---|
| Accounts per user | 1-5 |
| Read requests per day | 100-500 per account |
| Write requests per day | 10-50 per account |
| Total concurrent users | 50-200 |

---

## 5. Compliance

### Google Ads API Compliance
- We comply with the [Google Ads API Terms of Service](https://developers.google.com/google-ads/api/terms)
- We **do** support user-authored automation (pause/budget/bid via `auto-optimizer.js`), approval-first by default with full audit trail — disclosed honestly per `COMPLIANCE-AUDIT.md` §3.3
- We do not scrape Google Ads data — **except** `server/services/web-scraper/google-scraper.js` which currently hits the Ads Transparency Center; this is an **outstanding ToS item** tracked in `COMPLIANCE-AUDIT.md` (must disable or move to official Google Ads Library API before submission)
- We respect rate limits and implement proper error handling

### User Consent
- Users explicitly connect their Google Ads account via OAuth consent flow
- Users can disconnect at any time through the Settings page
- We display clear information about what data we access

### Data Protection
- GDPR-compliant data handling
- Users can request data deletion
- No data sharing with third parties
- All API keys and tokens stored encrypted

---

## 6. Technical Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Express    │────▶│  Google Ads  │
│   React SPA  │     │   Backend    │     │     API      │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │   SQLite     │
                     │   Database   │
                     └──────────────┘
```

### Google Ads API Integration
- **Library**: `google-ads-api` npm package (community-maintained TypeScript SDK)
- **Authentication**: OAuth 2.0 with refresh token flow
- **Query language**: GAQL (Google Ads Query Language) for all data retrieval
- **Error handling**: Automatic retry on transient errors, proper error codes on auth failures

---

## 7. Screenshots / Mockups

### Dashboard with Google Ads data
The dashboard displays unified metrics from all connected platforms including Google Ads:
- Total spend, revenue, ROAS across platforms
- Campaign-level breakdown by platform
- Real-time performance updates via WebSocket

### Campaign Management
Users can view, create, pause, and activate Google Ads campaigns directly from the UI.

### Settings — Google Ads Connection
The Settings page allows users to connect their Google Ads account via OAuth or by pasting their refresh token.

---

## 8. Contact

| Field | Value |
|---|---|
| **Developer** | BerkahKarya Digital |
| **Email** | admin@aitradepulse.com |
| **Website** | https://adforge.aitradepulse.com |

---

*This document is provided as part of the Google Ads API access application. All features described are implemented and tested in our production environment.*
