# Meta App Review — Jawaban Penggunaan Diizinkan

> Untuk di-copy ke Facebook App Dashboard → App Review → Minta Tinjauan Aplikasi

---

## Card 1: Business Asset User Profile Access

**Bagaimana aplikasi ini akan menggunakan Business Asset User Profile Access?**

---

### 1.1 Jelaskan bagaimana aplikasi Anda menggunakan izin atau fitur ini

AdForge is a SaaS ad management platform (https://adforge.aitradepulse.com) operated by BerkahKarya Digital. We use Business Asset User Profile Access to:

1. **Read Ad Account Info** — When a user connects their Facebook account via OAuth, we use this permission to retrieve the list of Ad Accounts, Business Managers, and Pages they have access to. This data is displayed on our "Connected Accounts" and "Platforms" pages so the user can select which ad account to manage.

2. **Display account metadata** — We show the user's Ad Account name, ID, currency, and Business Manager name in our dashboard so they can verify they are managing the correct assets.

3. **Isolate user data** — Each user's connected assets are stored per-user in our database with `WHERE user_id = ?` queries. No user can see another user's Business Assets.

**What we do NOT do:**
- We do not access user profiles of people who have not connected to AdForge.
- We do not post, message, or take any action on behalf of the user's profile.
- We do not share Business Asset data with any third party.

---

### 1.2 Unggah rekaman layar yang menampilkan pengalaman pengguna end-to-end

**[UPLOAD VIDEO — rekam langkah berikut]**

Flow yang perlu direkam:
1. Buka `https://adforge.aitradepulse.com/login` → login
2. Klik menu **Platforms** (sidebar)
3. Klik **Connect Meta** → muncul dialog OAuth Facebook
4. Login Facebook → approve permissions
5. Redirect balik ke AdForge → tampil account name, ad account ID
6. Klik **Settings** → Connected Accounts → tampil Meta account terhubung
7. Klik **Disconnect** → account terhapus

Duration: ~1-2 menit.

---

### 1.3 Setuju bahwa Anda akan mempatuhi penggunaan yang diizinkan

✅ Check: Ya, kami menyetujui dan mematuhi penggunaan yang diizinkan sesuai dengan kebijakan Meta Platform.

---

---

## Card 2: Marketing API Access Tier

**Bagaimana aplikasi ini akan menggunakan Marketing API Access Tier?**

---

### 2.1 Jelaskan bagaimana aplikasi Anda menggunakan izin atau fitur ini

AdForge uses Meta Marketing API to provide multi-platform ad management. Specifically, we use the following permissions:

**ads_management + ads_read:**
- Read campaign data: Retrieve campaign names, statuses, budgets, performance metrics (impressions, clicks, spend, conversions, CTR, CPC, ROAS)
- Create campaigns: Allow users to create new Facebook/Instagram campaigns from AdForge's unified interface
- Update campaigns: Pause, activate, and adjust budgets on existing campaigns
- Pull performance reports: Fetch conversion metrics for our cross-platform reporting dashboard

**pages_show_list:**
- List the Facebook Pages connected to the user's account, displayed in the Platforms page so the user can select which Page to run ads from

**pages_read_engagement + pages_manage_ads + pages_manage_metadata + pages_manage_posts:**
- Read Page metadata (name, category, profile picture) for display in the dashboard
- Manage ad-related Page content for campaign creation

**business_management:**
- Access Business Manager hierarchy to list all ad accounts and Pages the user has access to

**How the data flows:**
1. User connects via OAuth → we store encrypted refresh token (AES-256-GCM)
2. User views dashboard → we call `/{ad_account_id}/insights` to fetch metrics
3. User creates campaign → we call `/{ad_account_id}/campaigns` POST
4. User sets automation rule (e.g. "pause if ROAS < 1.0") → our scheduler checks metrics and calls campaign update API when threshold is met
5. All API calls are rate-limited (max 10 req/sec per account)

**What we do NOT do:**
- We do not scrape or collect Facebook user data
- We do not use Marketing API data for advertising, targeting, or reselling
- We do not access data outside the connected user's own ad accounts
- We do not use the API for automated bidding — all bid/budget changes require user-configured rules

---

### 2.2 Pastikan Anda telah melakukan panggilan pengujian API yang required

✅ Ya, kami telah melakukan panggilan pengujian API. Berikut bukti:

**API calls we have tested and use in production:**

| Endpoint | Method | Purpose |
|---|---|---|
| `/me/adaccounts?fields=name,account_id,currency` | GET | List user's ad accounts |
| `/{act_id}/campaigns?fields=name,status,daily_budget` | GET | Read campaign data |
| `/{act_id}/insights?fields=impressions,clicks,spend,actions` | GET | Pull performance metrics |
| `/{act_id}/campaigns` | POST | Create new campaign |
| `/{campaign_id}` | POST | Update campaign status/budget |
| `/me/businesses` | GET | List Business Managers |
| `/{bm_id}/owned_ad_accounts` | GET | List BM ad accounts |
| `/me/accounts?fields=name,id,picture` | GET | List connected Pages |

All calls tested with valid OAuth token on our development environment. Screenshots of API responses can be provided upon request.

---

### 2.3 Setuju bahwa Anda akan mematuhi penggunaan yang diizinkan

✅ Check: Ya, kami menyetujui dan mematuhi penggunaan yang diizinkan sesuai dengan Meta Marketing API Terms of Service.

---

---

## Card 3: pages_show_list

**Bagaimana aplikasi ini akan menggunakan pages_show_list?**

---

### 3.1 Jelaskan bagaimana aplikasi Anda menggunakan izin atau fitur ini

AdForge uses `pages_show_list` for one specific purpose:

**List the user's Facebook Pages for ad campaign association.**

When a user creates a Facebook/Instagram ad campaign, the Facebook Ads API requires a Page ID as the ad's identity (the Page that "runs" the ad). Without `pages_show_list`, we cannot retrieve the user's Page list, and therefore cannot create campaigns.

**Specific usage:**
1. User clicks "Create Campaign" → AdForge calls `GET /me/accounts?fields=name,id,picture`
2. The response is displayed as a dropdown: "Select a Page for this campaign"
3. User selects a Page → the Page ID is passed to the campaign creation API call

**What we do NOT do:**
- We do not post content to Pages
- We do not read Page insights or engagement data (beyond what's needed for ad creation)
- We do not manage Page settings or roles
- We do not access Page data for any purpose other than ad campaign association

---

### 3.2 Unggah rekaman layar (jika diminta)

**[UPLOAD VIDEO — rekam langkah berikut]**

Flow yang perlu direkam:
1. Buka `https://adforge.aitradepulse.com/login` → login
2. Klik menu **Campaigns** (sidebar)
3. Klik **Create Campaign** button
4. Platform: pilih **Meta**
5. Di form creation, tampil dropdown "Select Page" dengan list Facebook Pages
6. Pilih Page → fill campaign details → klik Create
7. Campaign tampil di list dengan Page name

Duration: ~1-2 menit.

---

### 3.3 Setuju bahwa Anda akan mematuhi penggunaan yang diizinkan

✅ Check: Ya, kami menyetujui dan mematuhi penggunaan yang diizinkan.

---

---

## Ringkasan Untuk Kamu

### Yang perlu kamu upload:
1. **Video rekaman layar** untuk Card 1 (OAuth connection flow)
2. **Video rekaman layar** untuk Card 3 (Create campaign with Page selection)
3. Card 2 tidak butuh video — hanya butuh confirmation API calls tested

### Video recording tips:
- Rekam di **1920×1080** atau lebih
- Pastikan URL browser visible (`adforge.aitradepulse.com`)
- Jangan ada data sensitif/password asli di recording
- Bisa pakai OBS, Loom, atau built-in screen recorder
- Upload ke YouTube (unlisted) atau Google Drive, lalu paste link

### Icon (App Icon):
- Harus PNG, **1024×1024 pixels**
- Bisa generate dari SVG yang sudah ada: buka favicon.svg di browser, screenshot 1024×1024, atau gunakan ImageMagick:
```bash
convert -background '#0a0f1d' -density 300 client/public/favicon.svg -resize 1024x1024 dist/app-icon.png
```

### Privacy Policy URL:
- `https://adforge.aitradepulse.com/privacy`

### Terms of Service URL:
- `https://adforge.aitradepulse.com/terms`
