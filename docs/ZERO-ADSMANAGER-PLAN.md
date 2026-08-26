# 📱 Rencana Lengkap: "Kelola Iklan 100% dari Telegram & AdForge"
### Zero Ads Manager Plan — v1.0 · 2026-08

> **Visi**: Seorang pekerja bisnis di mana pun — buka Telegram atau adforge.aitradepulse.com —
> bisa membuat, mengubah, memantau, dan menghentikan iklan Meta **tanpa pernah membuka
> Meta Ads Manager**. Semua keputusan berisiko tetap lewat persetujuan dulu (approval-first).

---

## 1. Kondisi Sekarang vs Target

| Aktivitas Harian Media Buyer | Sekarang | Setelah Rencana |
|---|---|---|
| Melihat performa semua akun | ✅ Bot + Web | ✅ (sudah) |
| Pause/resume campaign | ✅ tombol bot | ✅ |
| Naik/turun budget campaign | ⚠️ hanya via AI Optimize | ✅ tombol langsung ±20% / nominal |
| **Membuat campaign baru** | ❌ harus buka Ads Manager | ✅ Wizard 3 langkah (web & bot) |
| **Membuat adset + audience** | ❌ | ✅ pilih saved audience saat wizard |
| **Upload kreatif & buat iklan** | ❌ | ✅ upload gambar/URL → jadi iklan PAUSED |
| **Pause satu iklan tertentu** | ❌ | ✅ tombol per-ad di tab Performance |
| **Duplikat campaign winner** | ❌ | ✅ 1 tap "Duplicate" |
| Edit budget adset | ❌ | ✅ slider/input |
| Alert anomali otomatis | ✅ (baru rilis) | ✅ |

---

## 2. Fase Implementasi

### 🟦 Fase A — Fondasi API Tulis (~½ hari)
*Beliau yang terlihat user: tidak ada — ini fondasi di belakang layar.*

| # | Item | Detail teknis |
|---|---|---|
| A1 | `updateAd(adId, {status})` | POST `/{ad_id}` field status — untuk pause/resume level iklan |
| A2 | `duplicateCampaign(accountId, campaignId, {suffix})` | POST `/{campaign_id}/copies` + deep-copy option |
| A3 | Route ekspos: `POST /api/campaigns/:id/duplicate`, `PATCH /api/ads/:id` | Tenant-scoped via resolveUserMetaApi |
| A4 | Upload gambar device → Meta: endpoint proxy `/api/campaigns/adimages` (terima URL atau base64 → `/adimages`) | Kreatif dari HP bisa dipakai |

**Verifikasi**: unit + live pause satu iklan & duplikat satu campaign via curl.

---

### 🟩 Fase B — Campaign Wizard (Web) · *user-facing* (~1 hari)

**User journey baru**:
```
Klik [+ New Campaign] → pilih tujuan (Traffic/Sales/Leads/Messages)
→ isi nama & budget harian → pilih akun → pilih Saved Audience (opsional)
→ tempel URL landing page + upload/tempel URL gambar
→ REVIEW ringkasan → [Create — status PAUSED]
→ selesai. Campaign muncul di daftar, tinggal Aktifkan.
```

| Komponen | Detail UX |
|---|---|
| Wizard 4 langkah | Satu pertanyaan per layar, progress bar atas, tombol Back |
| Objective picker | Kartu bergambar (Traffic 🚦 / Sales 🛒 / Leads 📋 / Messages 💬) — bahasa manusia, bukan istilah Meta |
| Budget | Input Rp + hint "≈ Rp X/hari direkomendasikan utk objective ini" |
| Audience | Dropdown **Saved Audiences** (hasil interest stacker) + opsi "Lebar (Advantage+)" |
| Kreatif | Upload file ATAU tempel URL gambar; preview live sebelum lanjut |
| Review | Ringkasan semua pilihan + badge "Status awal: JEDA — aktifkan setelah dicek" |

**Teknis**: state machine di client; POST bertahap ke `createCampaign` → `createAdSet`
(dengan targeting dari saved audience) → upload image → `createAdCreative` → `createAd`.
Semua PAUSED. Gagal di tengah = tampilkan langkah mana gagal + tombol retry.

---

### 🟨 Fase C — Create via Bot (/create) (~1 hari)

**User journey baru di Telegram**:
```
/create → "Pilih tujuan:" [🚦 Traffic] [🛒 Sales] [📋 Leads]
→ "Nama campaign?" → ketik nama
→ "Budget harian?" → ketik angka (contoh: 50000)
→ "Pilih audience:" [daftar saved audiences] [➕ Lebar]
→ "URL landing page?" → ketik/tempel
→ Konfirmasi ringkasan: [✅ Buat (PAUSED)] [❌ Batal]
→ "✅ Campaign dibuat (JEDA). Aktifkan via tombol ⚙️ di /ads"
```

| Komponen | Detail |
|---|---|
| WizardScene baru `create-campaign` | Pola sama dengan connect-account scene (sudah proven) |
| Validasi tiap langkah | Budget min 10.000, URL harus http, dsb. — pesan error ramah |
| Ringkasan konfirmasi | Tabel rapi sebelum eksekusi; batal kapan saja |
| Setelah selesai | Tombol langsung: [⚙️ Lihat campaign] [📱 Mini App] |

---

### 🟧 Fase D — Kontrol Granular Harian (~1 hari)

**Yang ditambahkan supaya operasional harian tak pernah keluar dari bot/webapp**:

| Fitur | Di Bot | Di Web |
|---|---|---|
| +/- budget cepat | Tombol [＋20%] [－20%] [✏️ Nominal] di tiap campaign | Input inline di baris campaign |
| Edit budget adset | Lewat Mini App (slider) | Slider + input |
| Pause/resume per-ad | Lewat Mini App Performance tab | Toggle di tabel Performance |
| Duplicate campaign | Tombal [⧉ Duplikat] di detail campaign | Button di row campaign |
| Rename campaign | Lewat Mini App | Edit inline |

Semua perubahan budget melewati threshold check: >±50% minta konfirmasi sekali.

---

### 🔴 Fase E — QA Loop + Deploy (sampai 0 issue)

Sama seperti siklus yang sudah terbukti:
1. lint + build + full suite green
2. Live API smoke semua route baru
3. Browser sweep 26+ route (console error = 0)
4. Telethon sweep penuh (wizard bot E2E dengan data nyata)
5. Container parity + bundle fresh
6. Commit + push per fase

---

## 3. Yang TIDAK termasuk (dan kenapa)

| Item | Kenapa ditunda |
|---|---|
| Video upload kreatif | Butuh chunk upload + hosting video Meta — fase lanjutan setelah image flow stabil |
| Editing copy iklan terpasang | Meta membatasi edit creative pada iklan berjalan (re-review); rotasi via buat-ad-baru lebih aman |
| Instagram/Facebook post organik | Di luar domain manajemen iklan berbayar |

---

## 4. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| User membuat campaign tanpa paham dan boros | Status awal selalu **PAUSED** + AI Optimize tetap approval-first |
| Token kadaluarsa di tengah wizard | Simpan draft wizard di state; pesan reconnect; lanjutkan setelah reconnect |
| Rate limit Meta saat upload banyak | Antrean sequential + delay antar-langkah (pola orchestrator) |
| Wizard gagal di tengah (network) | Langkah idempotent + tombol Retry per langkah; partial cleanup opsional |

---

## 5. Estimasi Total

| Fase | Durasi |
|---|---|
| A. Fondasi API | ½ hari |
| B. Wizard Web | 1 hari |
| C. Wizard Bot | 1 hari |
| D. Kontrol Granular | 1–2 hari |
| E. QA Loop | (berjalan paralel tiap fase) |
| **Total** | **± 3.5–4.5 hari kerja** sampai Zero Ads Manager tercapai |
