# SKILL: ADFORGE MARKETING API
## Meta Ads Intelligence via Direct Marketing API — Zero Cost

> **Untuk**: 1ai-ads / AdForge  
> **Strategy**: Marketing API v21.0 langsung — tanpa Adspirer, tanpa pipeboard  
> **Cost**: Rp 0 (API calls gratis, hanya bayar ad spend)  
> **LLM**: Free tier providers via OmniRoute (Gemini Flash / Groq / GitHub Models)

---

## ARSITEKTUR

```
AdForge Query
    ↓
OmniRoute  → pilih free LLM (Gemini / Groq / GLM)
    ↓
buildAdsContext()  → Marketing API v21.0 (gratis)
    ↓
System Prompt + Live Data
    ↓
LLM Response → AdForge UI
```

---

## BAGIAN 1: SETUP AUTH (Sekali Saja)

### Buat Facebook App & Token

```bash
# Step 1: Buat App di developers.facebook.com
# App Type: Business → Next → isi nama app

# Step 2: Tambah produk "Marketing API"
# Dashboard → Add Product → Marketing API → Set Up

# Step 3: Generate token via Graph API Explorer
# https://developers.facebook.com/tools/explorer/
# Permissions yang dibutuhkan:
#   ✓ ads_read
#   ✓ ads_management
#   ✓ business_management
#   ✓ pages_read_engagement (opsional)

# Step 4: Exchange ke Long-Lived Token (valid 60 hari)
curl "https://graph.facebook.com/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=YOUR_APP_ID
  &client_secret=YOUR_APP_SECRET
  &fb_exchange_token=SHORT_LIVED_TOKEN"

# Step 5 (Opsional, untuk production): System User Token (tidak expire)
# Business Manager → Settings → Users → System Users
# → Add → Admin → Generate Token
```

### Environment Variables

```env
# .env — AdForge
META_ACCESS_TOKEN=EAAxxxxxxxxxxxxxx
META_AD_ACCOUNT_ID=act_1181078009580337
META_BUSINESS_ID=1611764243355432
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret

# OmniRoute LLM (pilih salah satu atau semua untuk fallback)
GEMINI_API_KEY=AIzaxxxx          # free tier: 1M token/day
GROQ_API_KEY=gsk_xxxx            # free tier: cepat, llama-3.3-70b
GITHUB_TOKEN=ghp_xxxx            # free via GitHub account
```

---

## BAGIAN 2: DATA FETCHER

```javascript
// lib/ads-context.js
// Fetch real-time data dari Marketing API — replaces visual_context_surface_data

const BASE = 'https://graph.facebook.com/v21.0';

async function get(path, params = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  const url = new URL(BASE + path);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── CONTEXT BUILDERS ───────────────────────────────────────────────

// 1. Account overview (= SYDWidgetAccountInfo)
export async function getAccountInfo() {
  return get(`/${process.env.META_AD_ACCOUNT_ID}`, {
    fields: 'name,account_status,currency,spend_cap,amount_spent,balance,timezone_name'
  });
}

// 2. Active campaigns (= SYDWidgetCampaignTrends)
export async function getCampaigns(status = ['ACTIVE']) {
  return get(`/${process.env.META_AD_ACCOUNT_ID}/campaigns`, {
    fields: 'id,name,status,objective,daily_budget,lifetime_budget,start_time,stop_time',
    effective_status: status,
    limit: 20
  });
}

// 3. Account-level insights (= SYDWidgetMetricSnapshot)
export async function getInsights(preset = 'last_7_days', level = 'account') {
  return get(`/${process.env.META_AD_ACCOUNT_ID}/insights`, {
    date_preset: preset,
    fields: 'impressions,reach,spend,cpm,ctr,clicks,frequency,actions,action_values,cost_per_action_type',
    level,
    action_attribution_windows: ['1d_click', '7d_click']
  });
}

// 4. Campaign-level insights breakdown
export async function getCampaignInsights(preset = 'last_7_days') {
  return get(`/${process.env.META_AD_ACCOUNT_ID}/insights`, {
    date_preset: preset,
    fields: 'campaign_id,campaign_name,impressions,reach,spend,cpm,ctr,clicks,frequency,actions,cost_per_action_type',
    level: 'campaign',
    limit: 20
  });
}

// 5. Recommendations (= SYDWidgetGuidanceHubV3)
export async function getRecommendations() {
  try {
    return get(`/${process.env.META_AD_ACCOUNT_ID}/recommendations`, {
      fields: 'title,message,confidence,importance_score,estimated_value,recommendation_type'
    });
  } catch {
    return { data: [] }; // recommendations endpoint kadang tidak tersedia
  }
}

// 6. Ad-level creative performance
export async function getAdInsights(preset = 'last_7_days') {
  return get(`/${process.env.META_AD_ACCOUNT_ID}/ads`, {
    fields: `id,name,status,adset_id,
      insights.date_preset(${preset}){impressions,clicks,spend,ctr,cpm,frequency,actions}`,
    effective_status: ['ACTIVE', 'PAUSED'],
    limit: 30
  });
}

// ─── MASTER CONTEXT BUILDER ──────────────────────────────────────────
// Replaces visual_context_surface_data dari MAIBA

export async function buildFullContext(preset = 'last_7_days') {
  const [account, campaigns, insights, campaignInsights, recommendations] = await Promise.allSettled([
    getAccountInfo(),
    getCampaigns(),
    getInsights(preset),
    getCampaignInsights(preset),
    getRecommendations()
  ]);

  const safeVal = (result) => result.status === 'fulfilled' ? result.value : null;

  const ins = safeVal(insights)?.data?.[0] || {};
  const acc = safeVal(account) || {};

  // Parse konversi dari actions array
  const actions = ins.actions || [];
  const conversions = actions.find(a =>
    ['offsite_conversion.fb_pixel_purchase', 'purchase'].includes(a.action_type)
  )?.value || '0';
  const leads = actions.find(a => a.action_type === 'lead')?.value || '0';

  return {
    timestamp: new Date().toISOString(),
    date_range: preset,
    account: {
      id: process.env.META_AD_ACCOUNT_ID,
      name: acc.name || 'Selow ID 1340',
      currency: acc.currency || 'IDR',
      status: acc.account_status,
      spend_cap: acc.spend_cap,
      amount_spent: acc.amount_spent,
      balance: acc.balance,
      timezone: acc.timezone_name
    },
    campaigns: {
      active_count: safeVal(campaigns)?.data?.length || 0,
      list: (safeVal(campaigns)?.data || []).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        daily_budget: c.daily_budget,
        lifetime_budget: c.lifetime_budget
      }))
    },
    metrics: {
      impressions: ins.impressions || '0',
      reach: ins.reach || '0',
      spend: ins.spend || '0',
      cpm: ins.cpm || '0',
      ctr: ins.ctr || '0',
      clicks: ins.clicks || '0',
      frequency: ins.frequency || '0',
      conversions,
      leads
    },
    campaign_breakdown: (safeVal(campaignInsights)?.data || []).map(c => ({
      name: c.campaign_name,
      spend: c.spend,
      impressions: c.impressions,
      cpm: c.cpm,
      ctr: c.ctr,
      clicks: c.clicks
    })),
    recommendations: (safeVal(recommendations)?.data || []).slice(0, 5).map(r => ({
      title: r.title,
      message: r.message,
      confidence: r.confidence,
      importance: r.importance_score
    }))
  };
}
```

---

## BAGIAN 3: SYSTEM PROMPT — ADFORGE AI

Inject `buildFullContext()` ke system prompt ini sebelum dikirim ke LLM:

```
# ADFORGE AI — Meta Ads Intelligence Agent

Kamu adalah AI ads analyst untuk akun Meta Ads berikut.
Kamu memiliki akses ke data kampanye real-time dan bertugas
memberikan analisis mendalam, rekomendasi, serta panduan eksekusi.

---

## DATA AKUN REAL-TIME

{ADS_CONTEXT_JSON}

---

## CARA MENJAWAB

Selalu gunakan data di atas sebagai basis jawaban. Jangan hallucinate angka.
Jika data untuk pertanyaan tertentu tidak tersedia di context, katakan terang-terangan.

Format angka: gunakan Rp untuk IDR. Contoh: Rp 3.294.408, bukan 3294408.
Format reach/impressions: gunakan K untuk ribuan, M untuk juta. Contoh: 905,1K.

---

## KAPABILITAS

### ANALISIS AKUN
Ketika diminta overview atau analisis akun:
- Ringkas status dalam 3-5 poin (spend, performa, anomali)
- Hitung spending pace: amount_spent / spend_cap × 100 = % limit terpakai
- Alert jika > 80% limit terpakai
- Highlight kampanye dengan performa terbaik dan terburuk

### DIAGNOSIS KAMPANYE
Format output standar:
---
📊 [NAMA KAMPANYE]
Status: [ACTIVE/PAUSED] | Objective: [objective] | Budget: Rp [X]/hari

Performance:
• Reach: [X] | Impressions: [X] | Freq: [X]
• CTR: [X]% | CPM: Rp [X] | Spend: Rp [X]

🟢 Strong: [metrik bagus]
🟡 Watch: [perlu perhatian]
🔴 Critical: [masalah urgent]

Rekomendasi:
1. [Action] → Expected impact: [outcome]
2. [Action] → Expected impact: [outcome]
---

### BUDGET OPTIMIZATION (framework)
- SCALE (naikkan 20-30%): ROAS tinggi, CTR > rata-rata, frequency < 3
- HOLD: performa stabil, masih learning phase
- OPTIMIZE: CTR rendah, CPM naik → ganti creative atau audience
- KILL: spend tinggi, zero conversion > 3 hari

### SPENDING LIMIT ALERT
Jika amount_spent / spend_cap > 0.80:
→ Wajib alert di awal response
→ Estimasi kapan limit habis berdasarkan pace 7 hari
→ Sarankan top up atau pause kampanye non-prioritas

### CREATIVE FATIGUE CHECK
Jika frequency > 3: warning creative fatigue
Jika frequency > 5: critical, pause dan refresh creative segera

### ANOMALY SIGNALS
Langsung alert jika kamu deteksi:
- CPM naik > 40% dibanding normal
- CTR turun > 35%
- Frequency > 4 di kampanye retargeting
- Spend 0 padahal kampanye status ACTIVE

---

## BAHASA & FORMAT

- Bahasa Indonesia, campuran formal-informal, langsung to the point
- Jangan terlalu panjang kecuali diminta analisis mendalam
- Gunakan emoji sparingly untuk visual scanning (📊 🟢 🟡 🔴 💡 ⚠️)
- Selalu tutup dengan next action yang konkret dan bisa langsung dilakukan

---

## BATAS TINDAKAN

- Jangan eksekusi perubahan spend > Rp 500.000 tanpa konfirmasi eksplisit
- Jangan pause kampanye yang < 50 conversions (masih learning phase)
- Selalu jelaskan reasoning sebelum sarankan action besar
- Jika ragu dengan data, minta user verifikasi langsung di Ads Manager
```

---

## BAGIAN 4: OMNIROUTE CONFIG UNTUK FREE LLM

```yaml
# omniroute.config.yaml — AdForge section

providers:
  adforge-primary:
    type: google
    model: gemini-2.0-flash-exp   # free tier
    api_key: ${GEMINI_API_KEY}
    max_tokens: 4096
    
  adforge-fallback-1:
    type: groq
    model: llama-3.3-70b-versatile  # free tier, very fast
    api_key: ${GROQ_API_KEY}
    
  adforge-fallback-2:
    type: github-models
    model: gpt-4o-mini             # free via GitHub
    api_key: ${GITHUB_TOKEN}
    base_url: https://models.inference.ai.azure.com

routing:
  adforge:
    default: adforge-primary
    fallback_chain:
      - adforge-fallback-1
      - adforge-fallback-2
    triggers:
      rate_limit: next
      error_429: next
      timeout_5s: next
```

---

## BAGIAN 5: INTEGRATION KE ADFORGE

### Pattern: API endpoint untuk AdForge frontend

```javascript
// api/ads-chat.js (Next.js API route atau Express)

import { buildFullContext } from '../lib/ads-context.js';

const SYSTEM_PROMPT_TEMPLATE = `...` // template dari Bagian 3

export async function POST(req) {
  const { message, conversation_history = [], date_range = 'last_7_days' } = await req.json();

  // Fetch live ads data
  const context = await buildFullContext(date_range);
  
  // Inject ke system prompt
  const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
    '{ADS_CONTEXT_JSON}',
    JSON.stringify(context, null, 2)
  );

  // Call OmniRoute (standard OpenAI format)
  const response = await fetch(process.env.OMNIROUTE_URL + '/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OMNIROUTE_API_KEY}`
    },
    body: JSON.stringify({
      model: 'adforge-primary',  // OmniRoute routing key
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversation_history,
        { role: 'user', content: message }
      ],
      stream: true
    })
  });

  // Stream balik ke frontend
  return new Response(response.body, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

### Pattern: Telegram Bot (untuk notifikasi proaktif)

```javascript
// jobs/daily-report.js — kirim report otomatis tiap pagi

import { buildFullContext } from '../lib/ads-context.js';

export async function sendDailyReport() {
  const context = await buildFullContext('yesterday');
  
  // Format singkat untuk Telegram
  const { metrics, account, campaigns } = context;
  const spendPct = ((parseFloat(account.amount_spent) / parseFloat(account.spend_cap)) * 100).toFixed(1);
  
  const msg = `
📊 *Daily Ads Report — ${new Date().toLocaleDateString('id-ID')}*

💰 Spend kemarin: Rp ${parseFloat(metrics.spend).toLocaleString('id-ID')}
👥 Reach: ${parseInt(metrics.reach).toLocaleString('id-ID')}
📈 CPM: Rp ${parseFloat(metrics.cpm).toLocaleString('id-ID')}
🖱️ CTR: ${parseFloat(metrics.ctr).toFixed(2)}%

⚡ Limit terpakai: ${spendPct}%
🎯 Kampanye aktif: ${campaigns.active_count}
${spendPct > 80 ? '\n⚠️ *LIMIT HAMPIR HABIS — segera top up!*' : ''}
  `.trim();

  await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TG_ADMIN_CHAT_ID,
      text: msg,
      parse_mode: 'Markdown'
    })
  });
}
```

---

## BAGIAN 6: QUICK TEST

```bash
# Test 1: Token valid?
curl "https://graph.facebook.com/v21.0/me?access_token=$META_ACCESS_TOKEN"
# Expected: {"id":"...","name":"..."}

# Test 2: Account accessible?
curl "https://graph.facebook.com/v21.0/act_1181078009580337?fields=name,amount_spent,spend_cap&access_token=$META_ACCESS_TOKEN"
# Expected: {"name":"Selow ID 1340","amount_spent":"...","spend_cap":"..."}

# Test 3: Campaigns?
curl "https://graph.facebook.com/v21.0/act_1181078009580337/campaigns?fields=name,status&effective_status=[\"ACTIVE\"]&access_token=$META_ACCESS_TOKEN"
# Expected: {"data":[...]}

# Test 4: Insights?
curl "https://graph.facebook.com/v21.0/act_1181078009580337/insights?date_preset=last_7_days&fields=spend,reach,impressions,cpm&access_token=$META_ACCESS_TOKEN"
# Expected: {"data":[{"spend":"...","reach":"..."}]}
```

---

## CHECKLIST DEPLOY

- [ ] Buat Facebook App di developers.facebook.com
- [ ] Generate Long-Lived User Access Token (atau System User Token)
- [ ] Set semua ENV variables di `.env`
- [ ] Test 4 curl commands → semua return data
- [ ] Deploy `lib/ads-context.js` ke AdForge backend
- [ ] Inject system prompt template ke chat API
- [ ] Config OmniRoute routing untuk free LLM stack
- [ ] Test end-to-end: tanya "status kampanye saya" di AdForge

---

## SUMMARY BIAYA

| Komponen | Biaya |
|---------|-------|
| Marketing API calls | **Gratis** |
| Gemini 2.0 Flash (free tier) | **Gratis** (1M token/hari) |
| Groq free tier | **Gratis** |
| GitHub Models | **Gratis** |
| Total per bulan | **Rp 0** |
| Yang tetap dibayar | Ad spend (tidak berubah) |

---

*File ini adalah production skill untuk AdForge — stable, gratis, dan ToS-compliant.*  
*Untuk testing dengan Meta AI langsung, gunakan MAIBA_OMNIROUTE_SKILL.md.*
