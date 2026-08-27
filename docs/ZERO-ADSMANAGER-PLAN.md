# Zero Ads Manager Plan — Kelola Iklan 100% dari Telegram & AdForge

> **Visi:** Media buyer di mana pun — buka Telegram atau adforge.aitradepulse.com — bisa membuat, mengubah, memantau, dan menghentikan iklan Meta **tanpa pernah membuka Meta Ads Manager**. Keputusan berisiko tetap approval-first.
> **Refreshed:** 2026-08-27. Status: **Phases A–D SHIPPED** (commit `9d355dd`), Phase E berjalan, Phase F ditambah (deferred + multi-platform parity).

---

## 0. Status Per Fase (verified)

| Fase | Scope | Status | Receipt |
|---|---|---|---|
| A — Fondasi API tulis (`updateAd`, `duplicateCampaign`, adimages proxy) | Meta | ✅ Shipped | `meta/index.js`, routes |
| B — Campaign Wizard (Web) | Meta | ✅ Shipped | `client/src/pages/*`, wizard state machine |
| C — Create via Bot (`/create`) | Meta | ✅ Shipped | `bot/scenes/create-campaign` |
| D — Kontrol granular harian (±budget, pause per-ad, duplicate, rename) | Meta | ✅ Shipped | `9d355dd` |
| E — QA Loop + Deploy | Meta | 🟡 Ongoing | lint+build+smoke per fase |
| **F — NEW:** Deferred + Multi-platform parity + Autonomous tie-in | Meta+Google+TikTok | 🔲 Planned | see §6 |

**Net:** "Zero Ads Manager" untuk Meta = **tercapai** (A–D). Ini differentiator unik vs semua kompetitor (Madgicx/Smartly/Ryze butuh buka Ads Manager untuk beberapa aksi; AdForge 100% dari Telegram/Mini App).

---

## 1. Kondisi Sekarang vs Target (Meta — tercapai)

| Aktivitas | Sekarang | Status |
|---|---|---|
| Lihat performa semua akun | Bot + Web | ✅ |
| Pause/resume campaign & per-ad | Tombol bot/web | ✅ |
| Naik/turun budget (±20% / nominal) | Tombol langsung | ✅ |
| Buat campaign baru (Wizard 3-langkah) | Web & Bot | ✅ |
| Buat adset + pilih saved audience | Wizard | ✅ |
| Upload kreatif → iklan PAUSED | Web & Bot | ✅ |
| Duplicate campaign winner | 1-tap | ✅ |
| Edit budget adset | Slider/input | ✅ |
| Alert anomali otomatis | Bot digest | ✅ |

---

## 2. Fase A–D (ringkasan — lihat git history `9d355dd`)

- **A:** `updateAd(adId,{status})`, `duplicateCampaign`, route `POST /api/campaigns/:id/duplicate`, `PATCH /api/ads/:id`, proxy upload `/api/campaigns/adimages`.
- **B:** Wizard 4-langkah (objective → budget → audience → creative), semua PAUSED, retry per-langkah.
- **C:** `/create` scene di Telegram, konfirmasi ringkasan sebelum eksekusi.
- **D:** ±budget cepat, edit budget adset, pause per-ad, duplicate, rename — bot + web; threshold >±50% minta konfirmasi.

---

## 3. Yang TIDAK Termasuk (deferred → Phase F)

| Item | Kenapa ditunda |
|---|---|
| Video upload kreatif | Butuh chunk upload + hosting video Meta |
| Edit copy iklan terpasang | Meta batasi edit creative iklan berjalan; rotasi via ad-baru lebih aman |
| Instagram/FB post organik | Luar domain iklan berbayar |

---

## 4. Risiko & Mitigasi (berlaku)

| Risiko | Mitigasi |
|---|---|
| User boros tanpa paham | Status awal selalu **PAUSED** + AI Optimize approval-first |
| Token expired tengah wizard | Draft state + pesan reconnect |
| Rate limit saat upload banyak | Antrean sequential + delay (pola orchestrator) |
| Wizard gagal di tengah | Langkah idempotent + Retry + partial cleanup |

---

## 5. Estimasi

A–D = ±3.5–4.5 hari (sudah shipped). Phase F estimasi di §6.

---

## 6. Phase F — Deferred + Multi-Platform Parity + Autonomous (NEW)

Untuk "best in industry", Zero-Ads-Manager harus keluar dari Meta-centric:

| # | Item | Why | Effort | Task |
|---|---|---|---|---|
| F1 | **Google/TikTok/LinkedIn Zero-Manager parity** | Kompetitor (Ryze/Hyper) kelola lintas-platform dari 1 UI; AdForge zero-manager baru Meta | 3–5d | extend wizard + bot scenes ke 22 adapter |
| F2 | **Video creative upload** (deferred) | Smartly/Creatify punya; AdForge cuma image | 2–3d | `meta-video-service.js` + chunk upload |
| F3 | **Autonomous tie-in** | Wizard "Approve & Publish" + trust-mode (T3) → set-and-forget setelah terbukti | 2d | `GAP-RESOLUTION-PLAN.md` T3 |
| F4 | **Live-creative edit via rotation** | Bukan edit in-place (dibatasi Meta) — auto-duplicate + pause lama | 1d | `fatigue-detector.js` autoRefreshCreative (sudah ada) → expose di UI |
| F5 | **Bulk cross-account actions** (agency) | Agency kelola 3–10 akun; butuh multi-select + batch dengan rate-limit | 2d | `batch-service.js` + limiter |

**Verification per F-item:** live smoke di sandbox Meta + Google; bot E2E Telethon; console error = 0.

---

## 7. Why This Matters for "Best in Industry"
Zero-Ads-Manager (Telegram-native, approval-first) adalah **moat unik** — tidak ada kompetitor barat yang punya full management dari chat. Memperluas ke multi-platform (F1) + video (F2) + autonomous (F3) mengubah AdForge dari "Meta tool" jadi "OS iklan SEA" yang ga bisa di-copy barat.
