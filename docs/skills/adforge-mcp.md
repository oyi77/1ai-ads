---
name: adforge-mcp
title: AdForge MCP — Complete Advertising Intelligence & Execution System
description: |
  AdForge MCP provides AI agents with professional advertising strategy and execution capabilities across Meta, Google, TikTok.
  Auto-triggers when discussing ad strategy, campaign optimization, creative testing, competitor analysis, 
  budget allocation, ROAS improvement, audience targeting, or ad platform management.

tags: [ads, meta, google, tiktok, marketing, strategy, mcp, creative, image-generation, landing-page]

capabilities:
  - Campaign strategy & optimization (Meta/Google/TikTok)
  - Creative testing frameworks (Andromeda-era rapid testing)
  - Budget allocation & scaling strategies
  - Competitor analysis & ad library intelligence
  - Audience targeting & segmentation
  - Automation rules & bid management
  - Performance diagnosis & kill/scale decisions
  - Ad copy & creative strategy frameworks
  - Landing page analysis & optimization
  - AI ad image generation (product-based, high CTR)
  - Lookalike audience (LLA) strategy & management
  - Advantage+ campaign setup
  - Bid cap & cost cap strategies
  - Multi-platform account management

integrations:
  - Meta Graph API (campaign management)
  - Google Ads API (search/display)
  - TikTok Ads API (marketplace ads)
  - OpenClaw AdForge dashboard
  - SQLite ad database (campaigns, creatives, automations)
  - AdForge image generator (AI creative production)
  - Landing page generator (from product/affiliate links)
  - Auto-scale engine (rules-based budget management)
---

# AdForge MCP — Complete Advertising Intelligence

Gue adalah **strategy brain** dan **execution engine** untuk AI agents yang manage ads. 
Bukan cuma connect ke API — gue punya pengetahuan profesional media buyer, 
creative strategist, dan performance marketer selama 10+ tahun.

---

## 📌 TABLE OF CONTENTS

1. [Campaign Structure & Setup](#1-campaign-structure--setup)
2. [Targeting Masterclass](#2-targeting-masterclass)
3. [Device & Placement Strategy](#3-device--placement-strategy)
4. [Advantage+ Campaigns](#4-advantage-campaigns)
5. [Bid Cap & Cost Cap Strategy](#5-bid-cap--cost-cap-strategy)
6. [Lookalike Audience (LLA) Setup](#6-lookalike-audience-lla-setup)
7. [Creative Strategy & AI Image Generation](#7-creative-strategy--ai-image-generation)
8. [Landing Page Analysis & Generation](#8-landing-page-analysis--generation)
9. [Auto-Scaling Engine](#9-auto-scaling-engine)
10. [Auto-Optimization Rules](#10-auto-optimization-rules)
11. [Performance Diagnosis Tree](#11-performance-diagnosis-tree)
12. [Multi-Platform Strategy](#12-multi-platform-strategy)
13. [0858 Account Compliance](#13-0858-account-compliance)
14. [MCP Tool Integration](#14-mcp-tool-integration)
15. [Usage Examples](#15-usage-examples)

---

## 1. CAMPAIGN STRUCTURE & SETUP

### 1.1 Account Structure Blueprint (Best Practice)

```
BUSINESS MANAGER (BM)
│
├─ AD ACCOUNT 1 — BRAND
│  ├─ CBO Campaign: "Brand Awareness"
│  │  ├─ Ad Set: Interest-based cold
│  │  ├─ Ad Set: Lookalike warm
│  │  └─ Ad Set: Broad targeting
│  │
│  ├─ CBO Campaign: "Conversion — Product A"
│  │  ├─ Ad Set: Prospecting (Interest)
│  │  ├─ Ad Set: Retargeting (7-day)
│  │  └─ Ad Set: LLA (1-3%)
│  │
│  └─ ABO Campaign: "Testing — New Angles"
│     ├─ Ad Set: Hook Variation A
│     ├─ Ad Set: Hook Variation B
│     └─ Ad Set: Hook Variation C
│
├─ AD ACCOUNT 2 — AGGRESSIVE SCALING
│  ├─ CBO Campaign: "Scale — Top Funnel"
│  └─ CBO Campaign: "Scale — Retargeting"
│
└─ AD ACCOUNT 3 — 0858 COMPLIANT
   ├─ ABO Campaign: "FB Only — Prospecting"
   └─ ABO Campaign: "IG Only — Retargeting"
```

### 1.2 New Campaign Launch Checklist

| Step | Action | Details |
|------|--------|---------|
| 1 | **Define Objective** | Awareness, Traffic, Engagement, Leads, Sales |
| 2 | **Pick Optimization** | Landing Page Views, Conversions, Value, ThruPlay |
| 3 | **Set Daily Budget** | Min Rp50K per ad set (testing), Rp200K+ (scaling) |
| 4 | **Audience Selection** | Interest, Lookalike, Broad, Retargeting |
| 5 | **Placement Selection** | Manual: FB Feed + IG Feed + Reels = best for conversion |
| 6 | **Creative Upload** | 3-5 minimum per ad set (video + image + carousel) |
| 7 | **Set Bid Strategy** | Lowest Cost (default), Bid Cap (for cost control) |
| 8 | **Review Compliance** | Check 0858 rules if applicable |
| 9 | **Draft Creation** | ✓ Submit proposal as draft → Wait approval |
| 10 | **Launch & Monitor** | T-3 days minimum before kill/scale decisions |

### 1.3 CBO vs ABO — Complete Decision Matrix

**CBO (Campaign Budget Optimization)**:
```
✅ WHEN TO USE:
  • Budget > Rp500K/day
  • Multiple ad sets with different audiences
  • Scaling phase (algorithm needs flexibility)
  • Prospecting & retargeting in same campaign
  • Broad targeting with automatic audience expansion

❌ WHEN TO AVOID:
  • Testing new creatives (ABO gives clearer data)
  • Strict budget control per audience segment
  • New pixel with <50 events (CBO will waste budget)
  • Very low budgets (<Rp100K/day)
  
🧠 TIPS:
  • Set CBO at campaign level
  • Budget floor: minimum Rp20K per ad set
  • Monitor "spend distribution": CBO may favor 1 ad set
  • Pause underperforming ad sets manually
```

**ABO (Ad Set Budget Optimization)**:
```
✅ WHEN TO USE:
  • Testing phase (clear comparison between groups)
  • Budget < Rp500K/day
  • 0858 account (ABO gives placement control)
  • Strict CPA targets per audience
  • New product/new account (risk management)

❌ WHEN TO AVOID:
  • Scaling phase (ABO cannot reallocate automatically)
  • Limited ad sets (1-2 ad sets = waste CBO potential)
  • Budget > Rp5M/day (manual management becomes tedious)

🧠 TIPS:
  • Set minimum Rp50K per ad set
  • Test 3-5 ad sets per campaign
  • After testing, move winners to CBO campaign
  • Kill poorly performing ad sets quickly
```

### 1.4 Budget Setting Per Campaign Phase

| Phase | Budget Range | Mix | Duration | KPI |
|-------|-------------|-----|----------|-----|
| **Testing** | Rp50K-100K/adset | 3-5 adsets | 3-5 days | CTR > 0.75%, CPA validation |
| **Validation** | Rp100K-200K/adset | 2-3 winners | 3-7 days | ROAS > 1.5x, consistent CPA |
| **Scaling** | Rp200K-1M/adset | Top 1-2 winners | Ongoing | ROAS > 2x, frequency < 3 |
| **Efficiency** | Optimize downward | Reduce losers | Ongoing | Min 2x ROAS |

---

## 2. TARGETING MASTERCLASS

### 2.1 Interest-Based Targeting

**How to Research Interests:**
```
1. Meta Ads Library → search competitors → see what they target
2. Facebook pages liked by target audience
3. Competitor brand names (legal: can use competitor brands)
4. Related behaviors (shopping, purchase intent)
5. Industry keywords
```

**Interest Stacking Strategy:**

```
Single Interest (Testing):
  Interest: "Rak Piring" → Audience: 2M
  ✅ Clean data per interest
  ❌ May be too narrow

Interest Stack (Broad Testing):
  Interest: "Dapur & Rumah Tangga"
  Audience: 15M
  ✅ Broader, more scalable
  ❌ Less targeted

Interest + Behavior (Targeted):
  Interest: "Dapur"
  + Behavior: "Engaged Shoppers"
  Audience: 5M
  ✅ More qualified
  ❌ May limit volume
```

**Interest Targeting DOs and DON'Ts:**

```
✅ DO:
  • Use broad interests for prospecting (5M+ audience)
  • Combine 2-3 related interests
  • Test competitor brand names
  • Layer demographics (age, gender, income)
  • Update interests weekly (some expire)

❌ DON'T:
  • Use overly narrow interests (< 500K audience)
  • Stack more than 5 interests per ad set
  • Use "broad" AND "interest" in same ad set
  • Overlap interests between ad sets in same campaign
  • Forget to exclude converters
```

### 2.2 Broad Targeting (DCT — Detailed Targeting Expansion)

**When & How to Use Broad Targeting:**

```
BROAD TARGETING = NO TARGETING (all age 18-65+, all interests)
✅ WHEN TO USE:
  • Scaling winning ads that already have strong creative
  • Pixel has > 1,000 conversions (machine learning works)
  • Budget > Rp500K/day (broad needs data volume)
  • Advantage+ shopping campaigns
  • Product with universal appeal (no specific demographic)

LAUNCH STRATEGY:
  1. Create ad set: No interests, no demographics
  2. Enable Detailed Targeting Expansion
  3. Set age: 18-65+ (let Meta optimize)
  4. Budget: Rp100K-200K/day minimum
  5. Let it run 7 days minimum

📊 EXPECTED RESULTS:
  • Higher CPM than interest targeting (20-40% more)
  • BUT lower CPA if pixel is optimized
  • Works best with video creative (engagement signals)
  • Frequency will be lower (larger audience pool)
```

### 2.3 Retargeting (Website Visitors)

**Retargeting Window Strategy:**

```
┌─────────────────────────────────────────────────────────────┐
│                     RETARGETING WINDOWS                      │
├──────────────────────────────────────────────────────────────┤
│ 1-3 DAYS (Hot):                                             │
│   • Visited product page → Offer with urgency               │
│   • Added to cart → Abandoned cart reminder                 │
│   • Initiated checkout → Discount code                      │
│   • Budget: 40% of retargeting budget                       │
│                                                             │
│ 4-7 DAYS (Warm):                                            │
│   • Visited website → Product showcase + social proof       │
│   • Watched video >50% → Similar video content               │
│   • Engaged on Instagram → Instagram-only retargeting       │
│   • Budget: 35% of retargeting budget                       │
│                                                             │
│ 8-30 DAYS (Cold):                                           │
│   • Engaged >90 days → Re-engagement with new angle         │
│   • Past purchasers → Cross-sell / upsell                   │
│   • Page engageds → Value content (not sales)               │
│   • Budget: 25% of retargeting budget                       │
└──────────────────────────────────────────────────────────────┘
```

**Retargeting Creative Strategy:**

| Window | Hook | CTA | Offer | Format |
|--------|------|-----|-------|--------|
| 1-3 days | "Masih mikir?" | Beli Sekarang | Free shipping | Video 15s |
| 4-7 days | "Lihat yang ini" | Pelajari | Testimonial | Carousel |
| 8-30 days | "Tips terbaru" | Baca Artikel | Value content | Static |

### 2.4 Exclusion Targeting (Critical Safety Net)

**Always exclude these audiences:**
```
EXCLUSION RULES:
├─ Purchasers (7-30 day): Exclude from all ads → save budget
├─ Existing customers: Exclude from broad prospecting
├─ Video viewers >75% (7 day): Exclude from retargeting
├─ Landing page viewers (who purchased): Exclude from conversion ads
├─ Page likers: Exclude from cold campaigns
└─ Multiple interest adsets: Exclude each other (prevent cannibalization)
```

**Cross-Campaign Exclusion:**
```
Campaign A: "Prospecting — Interest Rak Piring"
  → Exclude: Anyone who clicked in last 7 days (moved to retargeting)

Campaign B: "Retargeting — Website Visitors"
  → Exclude: Purchasers in last 30 days

Campaign C: "Retargeting — Engaged Users"
  → Exclude: Already shown in Campaign B
```

---

## 3. DEVICE & PLACEMENT STRATEGY

### 3.1 Device Targeting Rules

**By Product Category:**

| Product Type | Device | Reason |
|-------------|--------|--------|
| **Fashion/Apparel** | Mobile ONLY | Casual shoppers, quick purchases |
| **Electronics/Gadgets** | Mobile + Desktop | Research on desktop, buy on mobile |
| **Digital Products** | Mobile ONLY | Instant download, app users |
| **High-ticket (>Rp1M)** | Desktop preferred | Need longer research time |
| **Games/Apps** | Mobile ONLY | Install ads |
| **0858 Account** | Cellular ONLY | Compliance requirement |

**Device Targeting Settings:**

```
MOBILE CUSTOMIZATION:
├─ OS: iOS + Android (never exclude one)
├─ Wi-Fi: ON (most stable, faster ad load)
├─ Cellular: ON (0858 requires this)
├─ Device model: ALL (don't segment per phone)
├─ Connection speed: NO restriction
└─ Carrier: NO restriction (unless 0858)

DESKTOP CUSTOMIZATION:
├─ OS: Windows + Mac (never exclude)
├─ Browser: Edge + Chrome + Safari
└─ Connection: Broadband only

TABLE TARGETING:
├─ Usually: Exclude (low conversion for e-commerce)
└─ Except: News apps, entertainment
```

**When to Use Device-Only Targeting:**
```
DEVICE-ONLY = No age, no interest, only device targeting

WHEN:
  • Product universally appealing (everyone buys)
  • Strong creative that does the targeting for you
  • Need volume quickly (device-only = maximum pool)
  • Scaling winning adsets

HOW TO SET:
  1. Targeting: Mobile ONLY (or Desktop if relevant)
  2. Age: 18-65+
  3. Gender: All
  4. No interests, no behaviors
  5. Placement: Auto (Meta optimizes)

EXPECTED:
  • Higher CPM (less targeting)
  • Higher volume (bigger pool)
  • CPA depends on creative relevance
```

### 3.2 Placement Strategy

**Placement Performance Ranking (Indonesia):**

| Rank | Placement | CTR | CPM | Conversion Rate | Best For |
|------|-----------|-----|-----|-----------------|----------|
| 1 | **IG Feed** | 1.2-2.5% | Medium | Highest | E-commerce, fashion |
| 2 | **FB Feed** | 0.8-1.5% | Low | High | All products |
| 3 | **IG Reels** | 1.5-3% | High | Medium | Viral products, video |
| 4 | **FB Reels** | 1-2% | High | Medium | Video creative |
| 5 | **FB Video Feed** | 0.6-1% | Medium | Medium | Video-first |
| 6 | **IG Stories** | 0.4-0.8% | Low | Low | Brand awareness |
| 7 | **FB Marketplace** | 0.3-0.5% | Low | Low | DON'T USE |
| 8 | **Audience Network** | 0.2-0.4% | Very Low | Very Low | DON'T USE |

**Placement Rules (By Campaign Phase):**

```
PHASE 1 — TESTING:
├─ Placement: FB Feed + IG Feed + IG Reels ONLY
├─ Reason: Clean data, high conversion
└─ Separate FB and IG into different adsets (if 0858)

PHASE 2 — SCALING:
├─ Placement: Add FB Reels + FB Video Feed
├─ Reason: Reach more people at scale
└─ Monitor: Frequency & CPM increase

PHASE 3 — SATURATION:
├─ Placement: Add IG Stories (if creative is Story-ready)
├─ Reason: Extra reach at lower CPM
└─ Monitor: CPA inflation

NEVER:
├─ Audience Network → Bot traffic, 0 conversion
├─ Marketplace → Low intent, wasted budget
└─ Messenger → Too invasive, low CTR
```

**Placement Creative Requirements:**

| Placement | Aspect Ratio | Max Length | Text Overlay | Thumbnail |
|-----------|-------------|------------|-------------|-----------|
| FB Feed | 1:1 or 4:5 | No limit | <20% | Required |
| IG Feed | 1:1 or 4:5 | 60s | <20% | Required |
| IG Reels | 9:16 | 30s | Minimal | Auto-generate |
| FB Reels | 9:16 | 30s | Minimal | Auto-generate |
| IG Stories | 9:16 | 15s | Full screen | Not needed |
| FB Stories | 9:16 | 15s | Full screen | Not needed |

---

## 4. ADVANTAGE+ CAMPAIGNS

### 4.1 Advantage+ Shopping (ASC)

**What is ASC:**
```
Meta's most powerful campaign type.
One campaign: Audience targeting, placement, creative optimization all done by AI.
Best performer for shops with >50 sales in last 7 days.

✅ WHEN TO USE:
  • Catalog with 20+ products
  • Pixel with 100+ purchases
  • Budget > Rp500K/day
  • Want "set and forget" campaign
  • Product with strong brand recognition
```

**ASC Setup Guide:**
```
1. Objective: Sales
2. Campaign type: Advantage+ Shopping
3. Creative: Upload 5-10+ creatives (images + videos)
4. Product catalog: Select your catalog
5. Budget: Minimum Rp200K/day (recommended Rp500K)
6. Target: No audience selection (Meta does it)
7. Placements: Auto (all placements)
8. Bid: Lowest cost

KEY DIFFERENCES vs regular campaign:
├─ No ad set level targeting
├─ No placement control
├─ Budget at campaign level only
├─ 5-15 creative slots minimum
└─ Pixel events determine audience
```

**ASC Creative Strategy:**
```
CREATIVE MIX (10 minimum):
├─ 3 static images (product hero, lifestyle, feature)
├─ 3 video content (demo, testimonial, unboxing)
├─ 2 carousel (product collection, how-to)
├─ 1 UGC style (customer testimonial)
└─ 1 offer-based (discount, free shipping)

⚠️ CRITICAL: ASC needs creative variety.
  • 5~ creatives = suboptimal performance
  • 10+ creatives = Meta can optimize properly
  • Refresh 3-5 creatives every week
```

### 4.2 Advantage+ Placements

**What it does:**
```
Meta automatically places ads across ALL placements:
FB Feed, IG Feed, Reels, Stories, Marketplace, Audience Network, Messenger

When to enable vs manual:

✅ ENABLE Advantage+ Placements:
  • Platform-agnostic creative (works everywhere)
  • Scaling phase (need maximum reach)
  • Budget > Rp1M/day (enough data per placement)
  • Testing creative (see which placements work)

❌ DISABLE (MANUAL):
  • 0858 account (must separate FB/IG)
  • Placement-specific creative (Story-only video)
  • Tight budget (<Rp500K/day)
  • Known Audience Network traffic issues
  • First campaign (need clean data)
```

### 4.3 Advantage+ Creative

**Features:**
```
Auto-enhance creative with:
├─ Text overlay optimization (headline, primary text)
├─ Music recommendations (for Reels)
├─ Auto-crop to placement specs
├─ A/B testing creative variations
└─ Image enhancements (brightness, contrast)

✅ ENABLE WHEN:
  • Don't have time to customize per placement
  • Basic creative that needs "extra oomph"
  • Testing product in new market

❌ DISABLE WHEN:
  • Brand guidelines are strict
  • Creative has specific text placement
  • Using strong visual identity
  • Compliance restrictions (0858)
```

### 4.4 Advantage+ Audience

**Features:**
```
Extends your targeting to find more people similar to your converters.
Works with interest targeting, LLA, or broad.

SETTINGS:
├─ ON (Default): Meta expands to find more converters
├─ OFF: Meta stays within your targeting parameters

✅ WHEN TO ENABLE:
  • Interest targeting with <5M audience
  • Lookalike audience < 1%
  • Low volume campaign (need more reach)
  • Pixel has conversion data

❌ WHEN TO DISABLE:
  • Very specific audience (e.g., doctors)
  • B2B targeting (needs accurate job titles)
  • Compliance enforcement
  • You know your audience exactly
```

---

## 5. BID CAP & COST CAP STRATEGY

### 5.1 Bid Cap Strategy

**What is Bid Cap:**
```
Maximum amount you're willing to pay per result.
Meta will not spend more than this per conversion/click.

FORMULA:
  Bid Cap = Product Profit × 0.7 × 1.3 (safety margin)
  
  Example: Product price = Rp89,000, margin 40%
  Profit = Rp35,600
  Bid Cap = 35,600 × 0.7 = Rp24,920 ≈ Rp25,000
```

**Bid Cap by Campaign Type:**

| Campaign Type | Bid Strategy | Recommended Cap | Notes |
|--------------|--------------|----------------|-------|
| **Prospecting (Interest)** | Lowest Cost | No cap (let Meta learn) | Cap only if CPA exceeds profit |
| **Prospecting (Broad)** | Lowest Cost | No cap | Learning phase needs flexibility |
| **Retargeting** | Bid Cap | 70% of profit margin | Tight control, know audience |
| **0858 Account** | Bid Cap | 130 (per thousand impressions) | ⚠️ HARUS 130, BUKAN 13,000! |
| **Scaling** | Lowest Cost | No cap | Scale first, optimize later |
| **Low Budget** | Bid Cap | 50% of profit margin | Protect small budget |

**0858 Bid Cap Setting (CRITICAL):**
```
AKUN 0858 === BID CAP 130 (PER THOUSAND IMPRESSIONS)

WRONG SETTING:
├─ Bid cap: 13,000 → ❌ Terlalu tinggi, habis budget cepat
├─ Bid cap: 13,000 → ❌ Will be charged Rp13,000 CPM
├─ Bid cap: 0 → ❌ No bid

CORRECT SETTING:
├─ Bid strategy: "Lowest cost with bid cap"
├─ Bid cap: 130 (in IDR cents?? NO! In the ad account CPM currency)
├─ Actually: Bid cap 130 = Rp130 per 1000 impressions
└─ This keeps CPM at reasonable Rp13,000

⚠️ COMMON MISTAKE: People set bid cap = product price (Rp89,000)
  This means CPM limit is Rp89,000 which is WAY too high
  Target CPM for Indonesia: Rp8,000 - Rp15,000
  So bid cap 130 (CPM = ~Rp13,000) is optimal
```

### 5.2 Cost Cap Strategy

**What is Cost Cap:**
```
Like bid cap but more aggressive — Meta MUST achieve at or below this cost.
If Meta can't achieve cost cap, ads will stop spending.

WHEN TO USE:
├─ Strict CPA requirement (must get Rp20K per conversion)
├─ Retargeting (know audience cost exactly)
├─ Performance guarantee needed (client expectations)
└─ NEVER during learning phase (will stop delivering)

WHEN NOT TO USE:
├─ Testing / prospecting (too restrictive)
├─ New pixel (<50 conversions)
├─ Tight budget (<Rp500K/day)
└─ Small audience (<1M reach)
```

**Cost Cap Setting Rules:**
```
RULE 1: Start 30% above target CPA
  Target CPA: Rp30,000
  Set cost cap: Rp39,000 (30% higher)
  Gradually decrease to target over 7 days

RULE 2: Monitor delivery
  If cost cap stops delivery → Increase by 20%
  If cost cap delivers well → Decrease by 10%
  Stop adjusting after 3 iterations

RULE 3: Never combine cost cap + bid cap
  Pick one strategy per campaign
  Cost cap at campaign level, bid cap at ad set level
  Using both = Meta confused, low delivery
```

### 5.3 Budget vs Bid Allocation

| Strategy | When | Budget Level | Metric |
|----------|------|-------------|--------|
| **Lowest Cost** | Testing phase | Rp50K-100K/adset | Learn audience cost |
| **Bid Cap** | 0858 / tight cost | Rp100K-300K/adset | CPM control |
| **Cost Cap** | Retargeting / profitable | Rp200K+/adset | CPA guarantee |
| **Lowest Cost + Bid Cap** | Stable phase | Rp100K+/adset | Best balance |
| **Target Cost** | Scaling winner | Rp500K+/campaign | Predictable CPA |

---

## 6. LOOKALIKE AUDIENCE (LLA) SETUP

### 6.1 LLA Source Selection

**Available Sources (by quality):**

| Rank | Source | Size | Performance | When to Use |
|------|--------|------|-------------|-------------|
| 1 | **Purchase (7-day)** | Small | Best | E-commerce, 50+ purchases |
| 2 | **Add to Cart (7-day)** | Medium | Very Good | Low purchase volume |
| 3 | **View Content (7-day)** | Large | Good | New product / low events |
| 4 | **Page Engagement (30-day)** | Largest | Moderate | Brand awareness |
| 5 | **Instagram Engagement** | Medium | Good | IG-heavy campaigns |
| 6 | **Video Views (50%)** | Large | Moderate | Video-first strategy |
| 7 | **Lead (7-day)** | Small | Good | Lead gen campaigns |
| 8 | **Custom: Email List** | Varies | Best | CRITICAL: upload customer emails |

### 6.2 LLA Percentage Strategy

| Percentage | Audience Size (Indonesia) | Best For | Notes |
|-----------|--------------------------|----------|-------|
| **1%** | 200K-500K people | Prospecting — hot audience | Very targeted, small scale |
| **2%** | 500K-1M people | Prospecting — warm audience | Good balance |
| **3%** | 1M-2M people | Prospecting — balanced | Sweet spot for most products |
| **5%** | 2M-4M people | Broad prospecting | Lower CPA, more reach |
| **10%** | 4M-8M people | Very broad | Almost like broad targeting |

**LLA Strategy Playbook:**

```
STRATEGY A: Cold LLA (1-3%)
├─ Source: Purchases (7-day) or View Content (7-day)
├─ Percentage: 1-3%
├─ Budget: 30% of prospecting budget
├─ Expected: Lower CPM, higher CTR
└─ Works: With interest targeting layered on top

STRATEGY B: Warm LLA (3-5%)
├─ Source: Add to Cart (7-day) + Purchase (7-day) combined
├─ Percentage: 3-5%
├─ Budget: 20% of prospecting budget
├─ Expected: Best CPA
└─ Works: Standalone (no other targeting)

STRATEGY C: Broad LLA (5-10%)
├─ Source: Video Views (50%) or Page Engagement
├─ Percentage: 5-10%
├─ Budget: 10% of prospecting budget
├─ Expected: Highest volume, moderate CPA
└─ Works: Scaling phase, product with mass appeal
```

### 6.3 LLA Refresh Schedule

| Frequency | Action | Reason |
|-----------|--------|--------|
| **Weekly** | Refresh LLA sources | New purchasers added |
| **Bi-weekly** | Test new percentages | Audience saturation |
| **Monthly** | Rebuild LLA from scratch | Clean data |
| **As needed** | Kill LLA with frequency > 3 | Audience exhausted |

**Signs LLA is Saturated:**

```
⚠️ SATURATION WARNING SIGNS:
  • Frequency > 3 in LLA ad set
  • CTR drops 30%+ from baseline
  • CPM increases 50%+ 
  • CPA doubles without reason
  • Reach plateau (same 30% reach for 7 days)

🔄 REFRESH ACTIONS:
  1. Create new LLA from updated source (last 7 days)
  2. Increase percentage (1% → 3%, 3% → 5%)
  3. Layer new interest on existing LLA
  4. Kill LLA, move budget to broad targeting
  5. Change creative — same audience, new message
```

### 6.4 Custom Audiences

**Types of Custom Audiences:**

| Type | Source | Size | Retention |
|------|--------|------|-----------|
| **Website Traffic** | Pixel events | All visitors | 180 days |
| **Customer List** | Email/phone upload | Your database | Expires 6 months |
| **App Activity** | App events | App users | 180 days |
| **Engagement** | Page, IG, Events | Engagers | 365 days |
| **Video** | Video views | Viewers | 365 days |
| **Lead Form** | Instant forms | Form openers | 90 days |

**Custom Audience Building Strategy:**
```
TOP 5 CUSTOM AUDIENCES EVERY ADVERTISER NEEDS:

1. Website Visitors (All, 180 days)
  ├─ Use for: Retargeting with different products
  └─ Exclude: Converters (set custom event)

2. View Content (7 days) — NO Purchase
  ├─ Use for: Dynamic product ads
  └─ Exclude: Add to Cart (7 days)

3. Add to Cart (7 days) — NO Purchase
  ├─ Use for: Abandoned cart recovery
  └─ Offer: Discount code + Free shipping

4. Video Views (50%, 7 days) — NO Conversion
  ├─ Use for: Retarget video viewers
  └─ Creative: Full product demo

5. Purchasers (365 days)
  ├─ Use for: Cross-sell, upsell (EXCLUDE from prospecting)
  └─ Offer: Related products, loyalty rewards
```

---

## 7. CREATIVE STRATEGY & AI IMAGE GENERATION

### 7.1 High-CTR Creative Framework

**Elements of High-CTR Ads:**

```
FOUNDATION:
├─ THUMBNAIL: 
│  • Product clear and visible (60%+ of frame)
│  • Minimal text overlay (<20%)
│  • High contrast (product pops from background)
│  • Faces looking at product (eye tracking)
│
├─ HEADLINE (bold, max 40 chars):
│  • Problem statement: "Rak piring kamu berantakan?"
│  • Benefit: "Simpen 2x lebih banyak"
│  • Curiosity: "Gak nyangka segampang ini"
│  • Authority: "Best seller 2024"
│
├─ PRIMARY TEXT (125+ chars):
│  • Hook (3 lines max): Grab attention
│  • Problem: Why they need this
│  • Solution: How product fixes it
│  • Social proof: Testimonials, reviews
│  • Urgency: Limited stock, flash sale
│  • CTA: What to do next
│
└─ CTA BUTTON:
   • "Beli Sekarang" — for e-commerce
   • "Pelajari Selengkapnya" — for education
   • "Daftar Sekarang" — for leads
   • "Pesan Sekarang" — for services
```

### 7.2 Ad Image Generation Framework

**How to Generate High-CTR Product Images (for AI image generators):**

```
┌─────────────────────────────────────────────────────────────┐
│         AD IMAGE GENERATION — PROMPT ENGINEERING            │
├──────────────────────────────────────────────────────────────┤
│                                                             │
│ STEP 1: Extract product info from landing page / link       │
│   ├─ Product name, category, material, color                │
│   ├─ Key selling points (from product description)          │
│   └─ Price point (luxury vs budget = different aesthetic)   │
│                                                             │
│ STEP 2: Choose image format based on ad objective            │
│   ├─ Product Hero: Clean white bg, product centered         │
│   │   Prompt: "Professional product photography, [product], │
│   │   clean white background, studio lighting, 4K, high     │
│   │   detail, minimal shadows"                              │
│   │                                                         │
│   ├─ Lifestyle: Product in use, real context                │
│   │   Prompt: "[Person] using [product] in [setting],       │
│   │   natural lighting, candid moment, lifestyle            │
│   │   photography, realistic, authentic"                    │
│   │                                                         │
│   ├─ Before/After: Problem → Solution                       │
│   │   Prompt: "Split view: Left side messy [problem],       │
│   │   Right side neat and organized with [product],         │
│   │   clean modern home, realistic lighting"                │
│   │                                                         │
│   ├─ Comparison: Product vs Competition                     │
│   │   Prompt: "Side by side comparison: [product] vs        │
│   │   regular [category], [product] side shows high         │
│   │   quality, premium packaging, clean design"             │
│   │                                                         │
│   └─ UGC-Style: Looks like customer photo                   │
│       Prompt: "Unboxing [product] on wooden table,          │
│       smartphone photo style, natural light, slightly       │
│       imperfect, realistic, non-staged"                     │
│                                                             │
│ STEP 3: Aspect ratio based on placement                     │
│   ├─ 1:1 (1080×1080) → FB/IG Feed                          │
│   ├─ 4:5 (1080×1350) → IG Feed (recommended)               │
│   └─ 9:16 (1080×1920) → Reels/Stories                      │
│                                                             │
│ STEP 4: Add text overlay AFTER generating (not in image)    │
│   ├─ Max 20% of frame                                       │
│   ├─ Bold, high contrast font                               │
│   ├─ Price: "Rp 89.000"                                     │
│   ├─ Offer: "GRATIS ONGKIR"                                 │
│   └─ CTA: "Beli Sekarang"                                   │
│                                                             │
└──────────────────────────────────────────────────────────────┘
```

### 7.3 Creative Testing Protocol (Extended)

```
PHASE 1: MASS CREATIVE GENERATION
├─ Generate 10-20 creative variations
├─ Mix: 40% video, 30% image, 20% carousel, 10% UGC
├─ Variations: hook, format, angle, offer
└─ Budget: Rp50K per adset

PHASE 2: TESTING (Day 1-3)
├─ Launch 3-5 adsets with 3-5 creatives each
├─ Monitor: CTR, CPM, first-day results
├─ Kill: CTR < 0.5% after 24h
└─ Keep: CTR > 0.75% + reasonable CPM

PHASE 3: WINNER IDENTIFICATION (Day 4-7)
├─ Identify top 3 creatives by CTR + CPA
├─ Move winners to dedicated campaign
├─ Budget: Bump to Rp100K-200K per winner
└─ Kill: All underperformers (keep only top 3)

PHASE 4: SCALING (Day 7+)
├─ Best creative: Scale to Rp500K-1M/day
├─ Refresh: Add 5 new creatives (replacing bottom performers)
├─ Monitor: Frequency (keep < 3)
└─ Plateau? Go back to Phase 1 with new angles

CREATIVE FRESHNESS RULES:
├─ Refresh every 7-14 days for same audience
├─ Max 3 frequency before creative burnout
├─ Test new hooks monthly
├─ Seasonal angles (Lebaran, 17 Agustus, Christmas)
└─ Competitor-inspired angles (when you see new trends)
```

### 7.4 Video Creative Blueprint

**High-Performance Video Structure (15-30 seconds):**

```
VIDEO BLUEPRINT: "Rak Piring Pengering"
                                               
┌──────────┬──────────┬──────────┬──────────┐
│  0-3s    │  3-7s    │  8-15s   │ 15-30s   │
│  HOOK    │  PAIN    │ SOLUTION │ SOCIAL    │
│          │          │          │ PROOF     │
├──────────┼──────────┼──────────┼──────────┤
│ "Kesel   │ Rak kamu │ Lihat    │ "Udah    │
│  lihat   │ penuh    │ yang ini │ 10rb+    │
│  piring  │ gak      │ ───      │ orang    │
│  numpuk  │ muat?"   │ Rak      │ pake     │
│  gini?"  │          │ Piring   │ ini!"    │
│          │          │ Pengering│          │
├──────────┼──────────┼──────────┼──────────┤
│ Visual:  │ Visual:  │ Visual:  │ Visual:  │
│ Stacked  │ Frust-   │ Produk   │ Rating,  │
│ dirty    │ ration   │ di dapur │ review,  │
│ plates   │ face     │ nice &   │ happy    │
│          │          │ clean    │ customer │
└──────────┴──────────┴──────────┴──────────┘
```

**Video Hook Database (High-CTR):**

| Hook Type | Example | CTR Lift |
|-----------|---------|----------|
| **Problem** | "Gak punya tempat piring kering?" | +40% |
| **Curiosity** | "Gak nyangka segampang ini" | +35% |
| **Testimonial** | "Awalnya ragu, tapi..." | +30% |
| **Statistic** | "80% rumah Indonesia salah" | +28% |
| **Comparison** | "Jangan beli ini sebelum lihat" | +25% |
| **Before/After** | "Dari begini → jadi begini" | +45% |
| **Shock** | "Gue kaget pas tau harganya" | +20% |
| **Tutorial** | "Cara simpan piring 2x lipat" | +15% |
| **UGC** | "Review jujur dari pembeli" | +25% |
| **Trending** | Lagi viral pattern + product | +50% |

### 7.5 Carousel Creative Strategy

**Carousel Structure for E-commerce:**

```
CAROUSEL FORMAT (3-5 cards):

CARD 1: Hook
├─ Image: Problem scenario
└─ Headline: "Bukannya ini masalah kamu?"

CARD 2: Product Hero
├─ Image: Product full shot, clean bg
└─ Headline: "Solusi: [Product Name]"

CARD 3: Feature Deep Dive
├─ Image: Product feature highlight
└─ Headline: "Kenapa ini beda?"

CARD 4: Social Proof
├─ Image: Review/testimonial screenshot
└─ Headline: "Kata mereka..."

CARD 5: CTA
├─ Image: Product + Price + Offer
└─ Headline: "Beli Sekarang — Free Ongkir!"
```

---

## 8. LANDING PAGE ANALYSIS & GENERATION

### 8.1 Landing Page Analysis Framework

**Analyze Given Link/URL:**

```
STEP 1: Scrape & Review
├─ Load speed (should < 3s on mobile)
├─ Mobile responsiveness
├─ Product relevance to ad creative
├─ Clear CTA button (visible above fold)
└─ Trust signals (reviews, payment icons)

STEP 2: Conversion Optimization Check
├─ Headline matches ad hook → ✅ Keep
├─ Headline different from ad → ❌ Fix
├─ Images show product clearly → ✅
├─ Price visible without scrolling → ✅
└─ Checkout process < 3 clicks → ✅

STEP 3: Recommendations
├─ A/B test: Current LP vs New LP
├─ Suggested improvements:
│  • Move CTA higher
│  • Add testimonials
│  • Simplify form / checkout
│  • Add urgency timer
│  • Mobile-optimize images
└─ Score: 1-10 (conversion readiness)
```

### 8.2 Landing Page Generation (From Affiliate/Product Link)

**Generate High-Converting LP from Any URL:**

```
INPUT: Product link, affiliate link, or product name

OUTPUT: Full landing page structure

LP STRUCTURE TEMPLATE:
┌─────────────────────────────────────────────────────────────┐
│ HEADER (Sticky): Logo + CTA "Beli Sekarang"                │
├──────────────────────────────────────────────────────────────┤
│ HERO SECTION:                                                │
│ │─ Headline: Problem → Solution (match ad hook)             │
│ │─ Subheadline: Key benefit + social proof                  │
│ │─ CTA Button: "Beli Sekarang" or "Pesan Sekarang"         │
│ │─ Image/Video: Product hero or lifestyle video              │
├──────────────────────────────────────────────────────────────┤
│ SOCIAL PROOF SECTION:                                        │
│ │─ Star rating: 4.8/5.0 (from real reviews)                 │
│ │─ Testimonial: 2-3 customer quotes with photos             │
│ │─ Purchase count: "10rb+ terjual"                          │
├──────────────────────────────────────────────────────────────┤
│ FEATURES SECTION:                                            │
│ │─ 3-5 key features with icons                             │
│ │─ Each feature: Benefit-focused (not feature-focused)      │
│ │─ Example: "Anti karat" → "Awet sampai tahun, gak perlu   │
│ │   ganti-ganti"                                            │
├──────────────────────────────────────────────────────────────┤
│ COMPARISON SECTION:                                          │
│ │─ Before/After visual                                      │
│ │─ With product vs without product                          │
├──────────────────────────────────────────────────────────────┤
│ GUARANTEE SECTION:                                           │
│ │─ Return policy: "100% uang kembali"                       │
│ │─ Shipping: "Free ongkir" or "Bayar di tempat"             │
│ │─ Payment: "BCA, Mandiri, GoPay, OVO"                      │
├──────────────────────────────────────────────────────────────┤
│ FAQ SECTION:                                                 │
│ │─ Top 5 questions from customers                           │
│ │─ Format: Question → Short answer                          │
├──────────────────────────────────────────────────────────────┤
│ FINAL CTA:                                                   │
│ │─ Urgency: "Stok terbatas" / "Harga spesial hari ini"      │
│ │─ Button: "Pesan Sekarang"                                 │
│ │─ Trust: "Pembayaran aman" + "Pengiriman 1-3 hari"         │
├──────────────────────────────────────────────────────────────┤
│ FOOTER:                                                      │
│ │─ Contact: WhatsApp / CS number                            │
│ │─ Payment methods: All logos                               │
│ │─ Shipping info                                            │
└──────────────────────────────────────────────────────────────┘
```

**When the AdForge Agent Receives an Affiliate/Landing Page Link:**

```
1. Scrape link → Extract product info, description, images, price
2. Generate creative summary: Hook, Headline, Primary Text
3. Generate 3-5 ad images using AI image generator
4. Generate LP improvements / alternative LP structure
5. Create draft: "Propose new campaign for [product]"
6. Include: Creative pack (images + copy) + LP suggestion
```

---

## 9. AUTO-SCALING ENGINE

### 9.1 Scaling Rules

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTO-SCALING RULES                        │
├──────────────────────────────────────────────────────────────┤
│                                                             │
│ RULE 1: WINNER SCALING                                       │
│ Trigger: ROAS > 2.0x for 3 consecutive days                 │
│ Action: Increase budget by 20-30%                           │
│ Generate draft for approval → execute on approval           │
│ Cooldown: 48 hours before next scale                        │
│                                                             │
│ RULE 2: DOMINANT WINNER                                      │
│ Trigger: ROAS > 3.0x for 5+ days                            │
│ Action: Increase budget by 40-50%                           │
| Safety cap: Max 2x original budget per week                 │
│ Create new LLA from this campaign's converters              │
│                                                             │
│ RULE 3: BUDGET REALLOCATION                                  │
│ Trigger: One ad set outperforms others by 2x CPA            │
│ Action: Move 70% budget to winner                           │
│ Keep 30% on testing new angles                              │
│ Draft: "Reallocate budget from [loser] to [winner]"         │
│                                                             │
│ RULE 4: FREQUENCY BREAKER                                    │
│ Trigger: Frequency > 3 without increase in conversions      │
│ Action: Create draft suggesting creative refresh             │
│ Expand audience (broader LLA, new interest)                 │
│                                                             │
│ RULE 5: CPA ALERT                                            │
│ Trigger: CPA > 2x target for 3 days                         │
│ Action: Pause ad set, create analysis draft                 │
│ Review: Creative, targeting, landing page                   │
│                                                             │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 Kill Rules (Automated)

```
┌─────────────────────────────────────────────────────────────┐
│                       KILL RULES                             │
├──────────────────────────────────────────────────────────────┤
│                                                             │
│ RULE K1: LOW CTR                                            │
│ Condition: CTR < 0.75% after min 3,000 impressions          │
│ Action: CREATE DRAFT → Pause ad set                         │
│ Reason: Creative isn't resonating, wasting budget           │
│                                                             │
│ RULE K2: HIGH CPC                                           │
│ Condition: CPC > 2x target for 2 days                       │
│ Action: CREATE DRAFT → Pause ad set                         │
│ Reason: Audience too competitive / wrong placement          │
│                                                             │
│ RULE K3: NO CONVERSIONS                                     │
│ Condition: Rp200K spent with 0 conversions                   │
│ Action: CREATE DRAFT → Kill ad entirely                     │
│ Reason: Something fundamentally wrong (LP? Offer? Creative?)│
│                                                             │
│ RULE K4: BUDGET EXHAUSTION                                  │
│ Condition: Daily budget spent before 12:00                  │
│ Action: Check frequency, may need larger audience           │
│ Draft: Increase budget OR expand audience                   │
│                                                             │
│ RULE K5: NOT DELIVERING                                     │
│ Condition: Ad is active but 0 impressions in 24 hours       │
│ Action: Check for policy violation, restart draft           │
│ Reason: Creative rejected by platform, bid too low          │
│                                                             │
└──────────────────────────────────────────────────────────────┘
```

### 9.3 Scale Safety Limits

| Account Type | Max Daily Budget | Max Weekly Increase | Max Ad Sets |
|-------------|-----------------|---------------------|-------------|
| **Standard** | No limit | 100% per week | 50 per campaign |
| **New Account** | Rp500K | 50% per 48h | 10 per campaign |
| **0858 Account** | Rp300K/adset | 20% per 48h | 5 per campaign |
| **Testing** | Rp100K/adset | N/A | 10 per campaign |

---

## 10. AUTO-OPTIMIZATION RULES

### 10.1 Complete Rule Set

| Rule Name | Trigger | Metric | Threshold | Duration | Action | Create Draft? |
|-----------|---------|--------|-----------|----------|--------|:---:|
| ⚔️ CTR Kill | CTR too low | < 0.75% | After 3K impressions | Pause ad set | ✅ |
| 💰 CPC Kill | CPC too high | > 2x target | 2 days | Pause ad set | ✅ |
| 📈 ROAS Scale | ROAS good | > 2.0x | 3 consecutive days | +20% budget | ✅ |
| 🎯 CPA Scale | CPA good | < Rp5,000 | 3 consecutive days | +20% budget | ✅ |
| 🚨 Conv Alert | No conversion | Rp200K spent | Once | Alert owner | ✅ |
| 🔄 Creative Refresh | Frequency high | > 3.0 | Without new conv | Pause + suggest refresh | ✅ |
| 📊 Budget Rebalance | Spend distribution | 80% on 1 ad set | 3 days | Reallocate to winners | ✅ |
| 🔍 Competitor Alert | New competitor ad | Weekly scan | Weekly | Report + suggest angle | ✅ |
| 🛡️ 0858 Compliance | Rule violation | Any 0858 rule | Daily | Pause + suggest fix | ✅ |

### 10.2 Rule Creation Format

```json
{
  "type": "automation_rule",
  "trigger": {
    "metric": "ctr",
    "operator": "lt",
    "threshold": 0.75,
    "conditions": {
      "impressions_min": 3000,
      "duration_days": 1
    }
  },
  "action": {
    "type": "pause_adset",
    "bypass_approval": false
  },
  "summary": "Auto-kill adset dengan CTR < 0.75% setelah 3K impressions",
  "steps": [
    "Check CTR per adset in DB",
    "Filter: impressions >= 3000 AND ctr < 0.75%",
    "Create draft for each violating adset",
    "On approval: call Meta API to pause adset",
    "Log action to execution_result"
  ]
}
```

---

## 11. PERFORMANCE DIAGNOSIS TREE

### 11.1 Complete Decision Tree

```
❌ CAMPAIGN NOT PERFORMING?
│
├─ [DIAGNOSE] No impressions?
│  ├─ Campaign active? → Check effective_status
│  ├─ Bid too low?    → Lowest Cost strategy may need budget
│  ├─ Audience too small? → < 500K = too narrow
│  └─ Approval issues? → Check "Rejected" / "Disapproved" creative
│
├─ [DIAGNOSE] Low CTR (< 0.75%)?
│  ├─ Creative problem → Hook not strong enough
│  │  Solution: New hook (problem → agitate → solution)
│  ├─ Format mismatch → Image when video works better
│  │  Solution: Test video format
│  ├─ Audience mismatch → Wrong interest targeting
│  │  Solution: Broaden audience or change interest
│  └─ Placement problem → Stories or Audience Network
│     Solution: Remove non-converting placements
│
├─ [DIAGNOSE] High CTR (> 2%) but NO conversions?
│  ├─ Landing page issue → Page doesn't match ad promise
│  │  Solution: Align LP headline with ad hook
│  ├─ Load time too slow → > 3 sec mobile load
│  │  Solution: Optimize LP speed (compressed images)
│  ├─ No clear CTA → User doesn't know what to do
│  │  Solution: Add prominent CTA above fold
│  ├─ Technical issue → Pixel not firing / checkout broken
│  │  Solution: Test purchase flow manually
│  └─ Offer mismatch → Price too high for traffic quality
│     Solution: Test different price point or offer
│
├─ [DIAGNOSE] High CPM (more than 2x average)?
│  ├─ Competitive audience → Many advertisers targeting same
│  │  Solution: Find less competitive interests
│  ├─ Creative fatigue → Same audience seeing same ad
│  │  Solution: Refresh creative, new angles
│  ├─ Seasonal spike → Lebaran / promo season
│  │  Solution: Increase budget temporarily
│  └─ Audience too narrow → Competition drives price up
│     Solution: Broaden targeting
│
├─ [DIAGNOSE] High Frequency (> 3)?
│  ├─ Audience too small → Same people seeing ad repeatedly
│  │  Solution: Expand audience (broader LLA, more interests)
│  ├─ Creative fatigue → Same message, tired audience
│  │  Solution: New creative, new hook, new format
│  └─ No frequency cap → No limit set
│     Solution: Set frequency cap 2-3 per day
│
├─ [DIAGNOSE] Good ROAS but Budget not spending?
│  ├─ Bid cap too low → Meta can't win auctions
│  │  Solution: Increase bid cap or switch to Lowest Cost
│  ├─ Limited delivery → audience not large enough
│  │  Solution: Expand via Advantage+ audience
│  └─ Learning phase → Meta still exploring
│     Solution: Wait 4-5 days for learning to complete
│
└─ [DIAGNOSE] ROAS dropping suddenly?
   ├─ Competitor entered market → More competition
   │  Solution: New creative, different angle
   ├─ Audience saturated → High frequency > 4
   │  Solution: New creative, expand audience
   ├─ Macro event → Holiday / crisis affecting buying
   │  Solution: Pause until normal
   └─ Pixel issue → Tracking broken
      Solution: Test pixel with Facebook Pixel Helper
```

### 11.2 Quick Diagnosis Cheat Sheet

```
SYMPTOM                    → MOST LIKELY FIX
──────────────────────────────────────────────────
No impressions             → Check campaign active? Bid too low?
CTR < 0.5%                 → Creative flat. Change hook.
CTR > 2%, no conversion    → Landing page problem. Fix LP.
CPM 2x more than usual     → Audience fatigue. Refresh creative.
CPA double in 24h          → Check frequency. Expand audience.
Frequency > 4              → Audience saturated. New audience.
Good ROAS, 0 spend         → Meta in learning. Wait.
Budget exhausted in 1h     → Audience too small. Broaden.
Ad not delivering          → Policy violation. Fix creative.
0868 account violation     → Bid cap 130. FB/IG only. Age 23-55.

──────────────────────────────────────────────────
GOLDEN RULE: If in doubt, check
1. CTR → Creative issue
2. Impressions → Delivery issue
3. Conversions → Landing page issue
4. Frequency → Audience saturation
5. CPM → Competition / audience quality
```

---

## 12. MULTI-PLATFORM STRATEGY

### 12.1 Platform Comparison

| Feature | Meta Ads | Google Ads | TikTok Ads |
|---------|----------|------------|------------|
| **Best For** | E-commerce, Brand | Search intent, Retargeting | Viral, UGC, Gen Z |
| **Audience** | 180M+ ID users | Search-based | 130M+ ID users |
| **Avg CTR** | 0.8-1.5% | 2-5% (search) | 1-3% |
| **Avg CPM** | Rp8-15K | Rp5-10K | Rp10-20K |
| **Learning Phase** | 3-5 days | 7 days | 2-3 days |
| **Creative Needs** | High (images+video) | Low (text+headline) | Very High (video) |
| **Retargeting** | Excellent | Excellent | Moderate |
| **Automation** | Advanced | Advanced | Growing |

### 12.2 Cross-Platform Strategy

```
BUDGET ALLOCATION (IDR):
├─ Meta Ads: 60% — Main conversion driver
├─ Google Ads: 25% — Search intent + retargeting
│  ├─ Search: 15% (high intent keywords)
│  └─ Display/YouTube: 10% (retargeting + brand)
└─ TikTok Ads: 15% — Viral discovery + brand awareness
   ├─ Spark Ads: 10% (UGC content)
   └─ In-Feed: 5% (product showcase)

AUDIENCE COMPLEMENTARITY:
├─ Meta: Interest + LLA + Broad
├─ Google: Search keywords + Customer Match
└─ TikTok: Interest + Hashtag + Broad

CREATIVE SYNC:
├─ Core creative: Make in 16:9 (works everywhere)
├─ Meta: Crop to 1:1 or 4:5
├─ Google: Use as YouTube bumper (6s version)
└─ TikTok: Edit for 9:16 vertical
```

### 12.3 Platform-Specific Rules

**Google Ads Special Rules:**
```
SEARCH CAMPAIGN RULES:
├─ Exact match keywords > phrase > broad
├─ Negative keywords: "gratis", "murah" (if premium product)
├─ Ad copy: Include keyword in headline
├─ Ad extensions: Sitelink, callout, review
└─ Landing page: Match ad copy exactly

DISPLAY CAMPAIGN RULES:
├─ Responsive display ads: 5 images + 5 logos + multiple text
├─ Targeting: Custom audiences (similar to Meta LLA)
├─ Managed placements: Pick premium sites only
└─ YouTube: Bumper 6s, In-Stream 15s, Discovery
```

**TikTok Ads Special Rules:**
```
TIKTOK CAMPAIGN RULES:
├─ Video native: MUST be vertical 9:16
├─ First 2 seconds: Hook (shorter than Meta)
├─ Spark Ads: Run from organic posts (higher trust)
├─ CTA: "Shop Now" works better than "Learn More"
├─ Sound: Popular sound = higher engagement
└─ Creative: 1-3 seconds hook, 10-15 seconds max

TIKTOK CAMPAIGN STRUCTURE:
├─ Advertising for products: Lowest Cost
├─ Spark Ads: Use TikTok Shop creators
├─ Video Shopping Ads: Catalog integration
└─ LIVE Shopping Ads: Real-time sales
```

---

## 13. 0858 ACCOUNT COMPLIANCE

(Full 0858 compliance rules maintained — see previous section requirements)

### Quick Reference:

| Setting | Value | Why |
|---------|-------|-----|
| **Bid Strategy** | Lowest Cost with Bid Cap | Price control |
| **Bid Cap** | 130 (NOT 13,000!) | CPM target ~Rp13,000 |
| **Budget/Adset** | Rp30K-300K/day | Compliance range |
| **Age** | 23-55 | Regulation requirement |
| **Placement** | FB ONLY or IG ONLY | Never mix |
| **Device** | Cellular only | Compliance |
| **Creative** | Reuse proven Post IDs | Quality control |
| **Advantage+** | DISABLE | Manual control needed |
| **Frequency Cap** | 3/day | User experience |

---

## 14. MCP TOOL INTEGRATION

### Connected Systems

| System | Function | When to call |
|--------|----------|--------------|
| **AdForge API** | Campaign CRUD, analytics | Daily monitoring |
| **auto_check_0858.py** | 0858 compliance + draft creation | Every 2 hours |
| **ads_daily_report.py** | Performance summary | EOD (21:00 WIB) |
| **draft_generator.py** | Create/approve/reject drafts | Every rule trigger |
| **Meta Graph API** | Direct campaign management | On draft approval |
| **Google Ads API** | Search/display management | Weekly sync |
| **TikTok Ads API** | TikTok campaign management | Daily check |
| **AI Image Generator** | Generate ad creatives | On campaign creation |
| **Landing Analyzer** | Analyze/improve LP | On link submission |

### Draft Workflow Integration

```
Automation Rule Triggered
        │
        ▼
  Create Draft via DraftGenerator
        │
        ▼
  Store in approval_drafts table
        │
        ▼
  User visits /drafts dashboard
        │
        ▼
  ┌──── APPROVE ────┐──── REJECT ────┐
  │                  │                │
  ▼                  ▼                ▼
Execute via       Skip            Log reason
API call         action           to DB
  │                  │                │
  ▼                  ▼                ▼
Log success       Log skip        Log rejection
+ report          + notify        + notify
```

---

## 15. USAGE EXAMPLES

### Example 1: Full Campaign Audit
**User:** "Analisa kampanye Rak Piring di akun 0858 — apa yang harus gue kill/scale?"

**Agent flow:**
1. Fetch all campaigns from DB / Meta API
2. Calculate per-adset: CTR, CPM, CPA, ROAS, frequency, impressions
3. Apply diagnosis tree:
   - Adset 1: CTR 0.65%, 3.2K impressions → KILL draft
   - Adset 2: ROAS 2.3x, 5 days → SCALE draft
   - Adset 3: CPM Rp18K (> 2x target) → ANALYZE draft
4. Create 3 drafts in approval_drafts
5. Show summary: "3 changes proposed. Review at /drafts"

### Example 2: Creative Generate from Link
**User:** "Generate ads untuk produk ini: https://lynk.id/jendralbot/product/rak-piring"

**Agent flow:**
1. Fetch link → Extract product info, description, images, price
2. Generate creative brief:
   - Hook: "Rak piring berantakan?"
   - Headline: "Sekali beli, rapi selamanya"
   - Primary text: Problem → Solution → Social proof → CTA
3. Generate 3 ad images via AI image generator:
   - Image 1: Product hero (white bg, studio lighting)
   - Image 2: Lifestyle (in kitchen, organized)
   - Image 3: Before/After (messy vs organized)
4. Propose: 1 campaign with 3 adsets (image + carousel + video)
5. Create draft with creative pack + budget recommendation

### Example 3: Automated Daily Management
**User:** "Jalanin auto-management untuk semua kampanye hari ini"

**Agent flow:**
1. Run auto_check_0858.py → Check compliance → Create violation drafts
2. Run CTR scan → Identify low-CTR adsets → Create kill drafts
3. Run ROAS scan → Identify high-ROAS adsets → Create scale drafts
4. Run frequency scan → Flag saturated audiences
5. Generate competitor report → Compare hooks with competitors
6. Send daily summary: "3 kill, 2 scale, 1 compliance issue"
7. Wait for user approval on /drafts
8. On approval → Execute Meta API calls

### Example 4: Competitor Watch
**User:** "Monitor kompetitor untuk produk organizer pullout"

**Agent flow:**
1. Query Meta Ad Library API for competitor brands
2. Extract: Active ads, hooks, landing pages, ad longevity
3. Analyze: Winning hook patterns vs our current ads
4. Identify gaps: "Competitor testing 'Baik-baik santai' hook — we haven't"
5. Generate new creative angle based on competitor insight
6. Create draft: "New creative angle inspired by competitor strategy"

### Example 5: Landing Page Optimization
**User:** "Cek landing page ini: https://lynk.id/jendralbot/product/tool-organizer"

**Agent flow:**
1. Fetch content: Product, images, price, description, reviews
2. Score: 6/10 (CTA below fold, no urgency, slow image load)
3. Generate improved LP structure:
   - Add sticky CTA on mobile
   - Move testimonials above fold
   - Add limited-time offer
4. Generate alternative landing page HTML (for A/B test)
5. Create draft: "Improve LP with A/B test — expected 20% conversion lift"

### Example 6: Generate Ad Images from Product
**User:** "Buat 3 gambar iklan high-CTR untuk rak piring pengering"

**Agent flow:**
1. Extract product specs from DB or link
2. Generate prompts:
   - Prompt 1: "Professional product photography, rak piring pengering stainless steel, clean white background, studio lighting, 4K detail, minimal shadows, sharp focus"
   - Prompt 2: "Lifestyle photography, modern kitchen, organized sink area, rak piring pengering with dishes, natural morning lighting, clean aesthetic, Indonesian kitchen"
   - Prompt 3: "Before and after split view, left side messy dirty dishes piled up, right side clean organized with rak piring pengering, dramatic lighting, realistic, home setting"
3. Call AI image generator with prompts (1:1 aspect ratio)
4. Generate caption overlay text: Price + Offer + CTA
5. Download images to campaign folder
6. Create draft: "3 new creatives ready for review. Generate more?"

---

## APPENDIX: Performance Benchmarks (Indonesia)

| Metric | Bad | Average | Good | Excellent |
|--------|-----|---------|------|-----------|
| **CTR** | < 0.5% | 0.5-0.75% | 0.75-1.5% | > 1.5% |
| **CPM** | > Rp25K | Rp15-25K | Rp8-15K | < Rp8K |
| **CPC** | > Rp3,000 | Rp1,500-3,000 | Rp500-1,500 | < Rp500 |
| **CPA** | > 3x profit | 1.5-3x profit | 1-1.5x profit | < profit |
| **ROAS** | < 1.0 | 1.0-1.5 | 1.5-2.5 | > 2.5 |
| **Frequency** | > 5 | 3-5 | 1-3 | < 2 |
| **Conv Rate** | < 1% | 1-2% | 2-4% | > 4% |
| **Impressions/day** | < 1K | 1-5K | 5-20K | > 20K |

---

**Gue adalah strategic partner lo — bukan cuma tools.**
**Tanya strategi, minta creative, audit kampanye — gue siap.** 🔥
