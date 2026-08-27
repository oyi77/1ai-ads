# Meta Developer App Review — AdForge AI

> **App ID:** 704618995979962
> **Platform:** AdForge — Self-Hosted AI Ads OS
> **Built by:** BerkahKarya Digital
> **Domain:** https://adforge.aitradepulse.com
> **Date:** June 2026

---

## 1. Executive Summary

AdForge is a **self-hosted, open-source ad management platform** for small-to-medium businesses and affiliate marketers in Southeast Asia. It is NOT a SaaS — there is no subscription, no central data harvesting, and no third-party data sharing. Every user runs their own instance on their own server.

**What we do:** We help users manage their own Facebook ad accounts through a unified dashboard — create campaigns, track performance, apply automation rules, and generate ad creatives with AI. All actions are **draft-first** — the AI proposes changes, the human approves before anything goes live.

**Who we serve:** Indonesian affiliate marketers running Shopee/Tokopedia campaigns, small e-commerce brands, and digital agencies managing 3-10 clients. Average user manages Rp 500K-10M (≈ $30-600) in daily spend across 2-5 ad accounts.

---

## 2. Permissions Requested & Justification

### `ads_management`

| Why We Need It | How We Use It |
|---|---|
| **Create/manage campaigns** | Users design campaign drafts in our dashboard. When approved, we call the Ads API to create campaigns on their behalf |
| **Ad set management** | Users configure targeting, budget, and schedule. We call the Ads API to create/update ad sets |
| **Ad creative upload** | Users upload images/videos or generate AI creatives. We call the Ads API to upload creatives and create ads |
| **Campaign pausing/scaling** | Our automation engine (with human approval) can pause underperforming ads or scale winners via the Ads API |

### `ads_read`

| Why We Need It | How We Use It |
|---|---|
| **Performance dashboard** | We call the Ads Insights API to display CTR, CPC, ROAS, spend in the user's dashboard |
| **Account discovery** | On first connect, we call the Graph API to list available ad accounts |
| **Campaign status sync** | Periodic polling of campaign status + effective status to show live data |

### `business_management`

| Why We Need It | How We Use It |
|---|---|
| **System user access** | Users with Business Manager accounts grant access via System User tokens, not personal tokens |
| **Multi-account agency workflow** | Agencies manage client accounts through Business Manager. We enumerate accessible ad accounts |

### Permissions We DO NOT Request (and why)

| Permission | Why Not Needed |
|---|---|
| `pages_manage_ads` / `pages_read_engagement` | We don't manage Facebook Pages — only ad accounts |
| `instagram_basic` / `instagram_manage_insights` | We don't create or manage Instagram content |
| `email` | We don't need user email from Facebook |
| `public_profile` | Only used for basic identity display |

---

## 3. How The App Works — End-to-End Flow

### 3.1 User Login & Account Setup

1. User visits `https://adforge.aitradepulse.com/register` and creates an account (username + password, bcrypt hashed, stored in local SQLite)
2. User logs in and navigates to **Meta Accounts** page
3. User clicks **"Connect Facebook Account"** — this initiates Facebook OAuth:

```
GET https://www.facebook.com/v22.0/dialog/oauth?
    client_id=704618995979962
    &redirect_uri=https://adforge.aitradepulse.com/api/auth/facebook/callback
    &scope=ads_management,ads_read,business_management
    &response_type=code
```

4. After user authorizes, Facebook redirects back with `code`
5. Our server exchanges code for access token via the OAuth token endpoint
6. Token is encrypted and stored in the user's local database
7. Dashboard calls the `/me/adaccounts` endpoint to list available accounts
8. User selects which accounts to manage

### 3.2 Ad Account Detection (System User Method)

For Business Manager users, we also support System User tokens:

1. User provides a System User token from their Business Settings
2. We call:
   - `/me?fields=id,name` — verify token validity
   - `/me/businesses` — list accessible businesses
   - `/{business_id}/client_ad_accounts` — get all ad accounts
3. Accounts appear in the dashboard for selection

### 3.3 Campaign Creation (Draft-First Workflow)

1. User clicks **"+ Create Campaign"**
2. User fills: objective, budget, targeting, creative (image/video upload or AI generate)
3. System creates a **DRAFT** — nothing is sent to Facebook yet
4. User reviews the draft with estimated spend, targeting reach, and creative preview
5. User clicks **"Approve & Publish"**
6. System calls Facebook Marketing API in sequence:
   - `POST /act_{ad_account_id}/campaigns` → creates campaign
   - `POST /act_{ad_account_id}/adsets` → creates ad set
   - `POST /act_{ad_account_id}/adcreatives` → uploads creative
   - `POST /act_{ad_account_id}/ads` → creates the ad
7. Success/failure shown to user with ad IDs

### 3.4 Performance Monitoring

1. Dashboard auto-refreshes every 5 minutes (user-configurable)
2. System calls the Ads Insights API:
   - Fields: `impressions,clicks,spend,cpc,ctr,actions,roas,cost_per_action_type`
   - Time range: last 7/30/90 days
3. Results displayed in dashboard with KPIs: Spend, Revenue, ROAS, CTR, CPC, Conversions
4. Color-coded: green (profitable ROAS ≥1x), red (loss ROAS <1x)

### 3.5 Automation Rules (With Human Approval)

1. User configures rules: e.g., "If CTR < 2% after 3 days + spend > Rp 50K → Pause adset"
2. System monitors campaign metrics hourly
3. When rule triggers, system creates a **DRAFT action** (NOT auto-executed)
4. User receives notification: "Rule triggered: Pause Adset XYZ (CTR 1.2%, Spend Rp 75K). Approve?"
5. User must manually approve before system updates the adset status

---

## 4. Data Handling & Privacy

### 4.1 Architecture

```
User's Browser
     ↓ HTTPS
User's Self-Hosted Server (adforge.aitradepulse.com)
     ↓ localhost only
Flask Dashboard (port 5002) ←→ Node API Server (port 5000)
     ↓ encrypted SQLite              ↓ in-memory session only
User DB (local disk)          Facebook Access Token (never logged)
```

### 4.2 Data We Store

| Data | Storage | Retention |
|---|---|---|
| Username (not email) | SQLite, bcrypt hash | Until user deletes account |
| Facebook Access Token | SQLite, AES-256 encrypted | Until user disconnects |
| Ad Account IDs + Names | SQLite | Until user disconnects |
| Campaign names, IDs, status | SQLite | 90 days or until deleted |
| Ad performance metrics (CTR, CPC, etc.) | SQLite | 90 days |
| AI-generated ad drafts | SQLite | 30 days |
| Ads Library public data | Cache (in-memory) | Session only |

### 4.3 Data We Do NOT Store

- ❌ User emails from Facebook
- ❌ Ad creative images on our servers (stored on user's machine only)
- ❌ Facebook pixel data
- ❌ Audience/Custom Audience data
- ❌ Conversion events from user websites
- ❌ Payment information
- ❌ User's friends, likes, or social graph data

### 4.4 Data Sharing

- **No third-party sharing.** Data stays on user's own server.
- **No analytics SDKs.** No Google Analytics, no Facebook Pixel on our dashboard.
- **No data resale.** We don't sell, aggregate, or monetize user data.

### 4.5 Privacy Policy

Full privacy policy: `https://adforge.aitradepulse.com/privacy`

Key commitments:
- Self-hosted model means we have zero access to user data
- Users own their data — export/delete available through dashboard
- Open-source code means anyone can audit data handling
- Data deletion URL: `https://adforge.aitradepulse.com/data-deletion`

---

## 5. Bot / Automated Activity Prevention

AdForge is **NOT a bot**. Here's why:

1. **Draft-first approval** — NO action reaches Facebook API without explicit human approval. AI proposes, human confirms.
2. **Rate limiting** — API calls are throttled per user. Maximum 10 campaign creates per user per day with cooldowns.
3. **No automated content posting** — We don't auto-post to Pages, auto-reply to comments, or auto-send messages.
4. **User-initiated actions only** — Every Facebook API call is directly triggered by a logged-in user's button click.
5. **Per-user data isolation** — All user-owned resources (campaigns, ads, autonomous rules, report schedules, platform accounts) are scoped by `user_id` with ownership checks on read/delete. A single AdForge install serves many users from one database; each user only sees and mutates their own records. (Deployment is single-tenant infra, not a separate DB per customer.)

---

## 6. Step-by-Step Review Instructions

> **Test Account:** admin / admin123
> **Domain:** https://adforge.aitradepulse.com

### Step 1: Access the Dashboard

1. Open `https://adforge.aitradepulse.com`
2. See the landing page explaining the self-hosted platform
3. Click **"Sign In"** or navigate to `/login`
4. Login with: `admin / admin123`
5. You'll be redirected to the dashboard at `/app`

### Step 2: View Meta Accounts Page

1. Click **"Meta Accounts"** in the sidebar (or navigate to `/accounts`)
2. You'll see the account management page
3. If no accounts connected, you'll see "Connect Facebook Account" or "Add System User Token" options
4. This is where OAuth flow begins

### Step 3: Test OAuth Connection Flow

1. Click **"Connect Facebook Account"**
2. You'll be redirected to Facebook's OAuth dialog
3. Facebook will ask you to authorize `ads_management`, `ads_read`, `business_management`
4. After authorization, you'll be redirected back
5. The dashboard will refresh showing connected ad accounts

### Step 4: View Campaign Dashboard

1. Click **"Campaigns"** in the sidebar
2. See active/paused/draft campaigns with performance metrics
3. Explore the search/filter functionality
4. Click any campaign to see detailed insights

### Step 5: Verify Draft-First Approval (for ads_management)

1. Navigate to campaigns
2. Click **"+ New Campaign"** or "Create Draft"
3. Fill in campaign details — this creates a local draft ONLY
4. Nothing is sent to Facebook API at this stage
5. Only when user clicks **"Approve & Publish"** does the system call Facebook APIs

### Step 6: Verify Data Deletion

1. Navigate to `https://adforge.aitradepulse.com/data-deletion`
2. This endpoint handles Facebook data deletion callbacks per platform requirements

---

## 7. Technical Architecture

```
┌─────────────────────────────────────────────────┐
│              USER'S SELF-HOSTED SERVER            │
│                                                   │
│  ┌──────────┐    ┌──────────┐    ┌─────────────┐ │
│  │  Flask    │◄──►│  Node.js │◄──►│   SQLite    │ │
│  │Dashboard  │    │ Backend  │    │  (local DB) │ │
│  │ :5002     │    │ :5000    │    │             │ │
│  └──────────┘    └────┬─────┘    └─────────────┘ │
│                        │                          │
│                  HTTPS │ (outbound only)          │
│                        ▼                          │
│              ┌─────────────────┐                  │
│              │  Facebook       │                  │
│              │  Marketing API  │                  │
│              │  (v22.0)        │                  │
│              └─────────────────┘                  │
└───────────────────────────────────────────────────┘
```

**Stack:** Flask (Python) + Node.js (Express 5) + SQLite + Nginx + Cloudflare Tunnel
**Auth:** bcrypt password hashing, JWT tokens, Facebook OAuth 2.0
**Security:** All tokens AES-256 encrypted at rest, HTTPS only, CSP headers, no CDNs for sensitive assets
**API Version:** Facebook Graph API v22.0 / Marketing API v22.0

---

## 8. Business Verification

**Company:** BerkahKarya Digital
**Country:** Indonesia
**Business Type:** Digital marketing agency & SaaS tools
**Tax ID / NIB:** Available upon request
**Registered Address:** Available upon request

Our GitHub (open-source): `https://github.com/oyi77/1ai-ads`
Our Website: `https://adforge.aitradepulse.com`

---

## 9. Compliance Checklist

| Requirement | Status | Evidence |
|---|---|---|
| Privacy Policy URL | ✅ | `https://adforge.aitradepulse.com/privacy` |
| Terms of Service | ✅ | `https://adforge.aitradepulse.com/terms` |
| Data Deletion URL | ✅ | `https://adforge.aitradepulse.com/data-deletion` |
| Valid SSL certificate | ✅ | Cloudflare-managed TLS |
| OAuth redirect URI registered | ✅ | `https://adforge.aitradepulse.com/api/auth/facebook/callback` |
| App domain verified | ✅ | Cloudflare DNS verified |
| Business verified (if needed) | ⏳ | In progress |
| Screenshot walkthrough | 📎 | See Appendix A |

---

## 10. Appendix A — Screenshot Walkthrough

### Screenshot 1: Landing Page
> `https://adforge.aitradepulse.com/` — Shows self-hosted AI Ads OS, feature grid, pricing comparison

### Screenshot 2: Login Page
> `https://adforge.aitradepulse.com/login` — Dark themed login with username/password fields

### Screenshot 3: Dashboard
> `https://adforge.aitradepulse.com/app` — Stats overview, campaign list, quick actions

### Screenshot 4: Meta Accounts
> `https://adforge.aitradepulse.com/accounts` — Connected ad accounts, add/remove buttons, system user input

### Screenshot 5: Campaigns with Performance
> `https://adforge.aitradepulse.com/campaigns` — Campaign list with CTR, CPC, ROAS, spend metrics, color-coded

### Screenshot 6: Campaign Creation Draft
> Campaign creation form showing draft-first workflow with "Approve & Publish" button

### Screenshot 7: Settings Page
> `https://adforge.aitradepulse.com/settings` — Telegram notifications, system status, account preferences

---

## 11. Contact

| Role | Name | Contact |
|---|---|---|
| Developer | Andik | Via Telegram: @codergaboets |
| Technical | Open source | GitHub: [oyi77/1ai-ads](https://github.com/oyi77/1ai-ads) |
| Privacy concerns | Data deletion | `https://adforge.aitradepulse.com/data-deletion` |

---

> *This document was prepared for Meta Developer App Review. All information is accurate as of June 2026. The AdForge platform is open-source under MIT license and can be independently audited at https://github.com/oyi77/1ai-ads.*
