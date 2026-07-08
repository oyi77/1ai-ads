# Google Ads API Access Review — Reply

**To:** Google Ads API Compliance Team
**Subject:** Re: Google Ads API Access Review — BerkahKarya Digital

---

Dear Google Ads API Compliance Team,

Thank you for the follow-up. Happy to provide specifics.

---

## 1. Core Business Model

BerkahKarya Digital (berkahkarya.org) operates **AdForge**, a SaaS ad management platform built for digital advertisers and marketing agencies in Indonesia and Southeast Asia.

Our customers are SMBs and agencies who run paid campaigns across multiple platforms simultaneously. The value exchange is a monthly subscription for access to a unified dashboard that replaces manual work across 8 ad platforms — Meta, Google, TikTok, LinkedIn, Twitter, Snapchat, Microsoft, and Pinterest — with a single interface for campaign management, performance analytics, and AI-assisted optimization.

We are not an ad network, reseller, or data broker. We act as a management layer on top of accounts that customers own and have explicitly connected to our platform.

---

## 2. Functional API Necessity

Google Ads API access is a core dependency, not a convenience. Our Google Ads integration is non-functional without it.

**Specific API methods we call:**

| Method | Purpose |
|---|---|
| `customers.listAccessibleCustomers` | Discover which Google Ads accounts the authenticated user can access |
| `customers/{id}/googleAds:searchStream` | GAQL queries for campaign, ad group, keyword, and performance data |
| `customers/{id}/campaigns:mutate` | Create, pause, and activate campaigns from our UI |
| `customers/{id}/campaignBudgets:mutate` | Set and adjust campaign budgets |
| `customers/{id}/adGroups:mutate` | Create and manage ad groups |

**How this directly enables our service:**

Our core user workflow is: connect Google Ads account via OAuth → view unified performance metrics alongside Meta/TikTok data → create or modify campaigns without leaving AdForge → let our automation rules engine act on thresholds (e.g. pause if ROAS < 1.0) → monitor results on the dashboard.

Every step touches the API. Without it, we cannot read campaign data for the dashboard, cannot write campaign changes on behalf of users, and cannot execute automation rules — the product's core value proposition collapses for the Google channel.

**Authentication and consent model:**

- Users connect via OAuth 2.0 consent flow
- Refresh tokens are stored encrypted at rest (AES-256-GCM), per-tenant isolated
- Access tokens are never persisted — obtained on-demand only
- Users can disconnect and delete credentials at any time from the Settings page
- We do not share access with any third party

We are happy to provide a live demo at https://adforge.aitradepulse.com or share screenshots of the OAuth consent flow and campaign management UI if that would help the review.

Best regards,

BerkahKarya Digital
admin@aitradepulse.com
https://adforge.aitradepulse.com
