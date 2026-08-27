# AdForge — Gap Resolution Plan (2026-08)

Menutup semua gap paritas dari `PARITY-ROADMAP.md`. Setiap fase berdiri sendiri
(shippable independently), urutan berdasarkan dampak × usaha. Semua estimasi adalah
kerja implementasi nyata di codebase ini, bukan teori.

---

## Fase 1 — Compound Rules (gap terbesar vs Revealbot) · ✅ SHIPPED (711287e + 1d46296)

**Masalah**: `_evaluateCondition()` (rule-evaluator.js:90) hanya menerima satu
condition object `{type, operator, value}`. Kompetitor menawarkan compound logic:
"pause if ROAS < 1.6 AND frequency > 4 AND active > 5 days".

**Perubahan**:
1. `server/services/rule-evaluator.js` — `_evaluateCondition` recursive:
   `{ all: [...] }` = AND, `{ any: [...] }` = OR, leaf = bentuk lama.
   Backward-compatible: bentuk lama tetap dievaluasi.
2. Storage: kolom `autonomous_rules.condition TEXT` sudah JSON — bentuk baru
   masuk tanpa migrasi. Validasi depth ≤ 3 saat create.
3. API: `POST /api/automation/create` + `/api/optimizer` create menerima kedua bentuk.
4. Client: `automation.tsx` rule builder v2 — baris kondisi dinamis
   ([metric][operator][value]) + toggle AND/OR antar baris; legacy single-row
   tetap terbaca.

**Verifikasi**: unit test evaluator (AND/OR/nested/back-compat); live: buat rule
**Status**: ✅ SHIPPED. Evaluator recursive `{all}/{any}` (depth ≤3, back-compat leaf) + UI rule builder bertingkat sudah live dan tercertifikasi (`9d355dd`). Lihat Phase berikutnya untuk sub-hourly scheduler.

---

## Fase 2 — Push Anomaly Alerts via Bot + Email · ~1 hari

**Masalah**: anomali kini client-side only (banner /reports). Kompetitor push alert.

**Perubahan**:
1. Pindahkan `deriveAnomalies()` ke server (`AccountReportService.detectAnomalies`)
   — satu sumber logika untuk web/bot/digest.
2. Scheduler job per jam (reuse pola bid satpam): buildReport ringkas per akun
   aktif → jika anomaly terdeteksi → bot message ke user.telegram_id.
3. Dedup: settings key `anomaly_alerted_<accountId>_<YYYY-MM-DD>` (max 1/hari).
4. Digest harian (sudah ada) menyertakan seksi anomali.

**Verifikasi**: unit test detector; live: pakai akun dengan spend spike → alert masuk Telegram.

---

## Fase 3 — Creative Performance Tab di Library · ~1-2 hari

**Masalah**: creative library statis — tidak tersambung performa iklan live
(kompetitor: creative-level insights).

**Perubahan**:
1. Data sudah setengah jalan: `/api/campaigns/sync/ads` mengambil ad-level data
   dari Meta (live), dan ads table punya platform_id/spend/revenue/roas (migration 026).
2. Endpoint baru `GET /api/campaigns/performance` — ad-level insights dari Meta
   (spend, roas, ctr, frequency) per account, sorted.
3. Library tab "Performance": tabel kreatif dengan metrik + tombol "Save to Library"
   (menulis ke creative_library via repo yang sudah ada).
4. Link balik: entry library menampilkan performa bila nama cocok dengan ad live.

**Verifikasi**: live E2E dengan token Selow — tabel performa render, save-to-library
membuat row.

---

## Fase 4 — Custom Report Builder · ~1-2 hari

**Masalah**: export CSV hanya campaign list statis (routes/_reporting.js:66).

**Perubahan**:
1. Server: `POST /api/reporting/custom` — body {accountId, metrics[], windows[],
   groupBy} → memakai blok insight yang sudah ada (today/yesterday/time_range).
2. Export CSV server-side untuk dataset besar + client CSV untuk snapshot.
3. Client: builder UI di /reports — pilih metrik checkbox, window dropdown,
   preview table, Download.

**Verifikasi**: live E2E pilih metrik → download CSV valid (parse kembali).

---

## Fase 5 — Plan Expiry + Recurring Renewal · ~2 hari (butuh 1 keputusan)

**Masalah**: Pro dibeli sekali berlaku selamanya; tidak ada renewal.

**Keputusan yang dibutuhkan dari owner**: masa berlaku Pro (usulan 30 hari) dan
harga renewal (usulan sama dengan harga baru).

**Perubahan**:
1. Migration 032: `users.plan_expires_at TEXT`.
2. Webhook `_handleOrderPaid`: set `plan_expires_at = now + 30d` untuk pro.
3. Subscription cron (sudah ada, scheduler.js:283): downgrade pro→free saat expired
   + kirim link checkout ulang via bot & email (mailer siap).
4. Billing page: badge expiry countdown + tombol Renew (POST payments sama).

**Rollback**: kolom nullable, downgrade bisa dimatikan via setting.

---

## Fase 6 — Audience Builder (interest stacking + lookalike prep) · ~1-2 hari

**Modal**: endpoint `GET /campaigns/targeting/search?q=` sudah ada (Meta interest
search live).

**Perubahan**:
1. UI Audiences: interest picker (search → stack → simpan sebagai saved audience
   dengan size estimate).
2. Server: endpoint create custom audience via metaApi (`/act_x/customaudiences`)
   untuk website/custom-list tipe dasar.
3. Saved audiences bisa dipakai saat create campaign/adset (dropdown targeting).

**Verifikasi**: live: search interest → stack 3 → save → muncul di saved-audiences.

---

## Fase 7 — Attribution Model Selector · ~1 hari (scoped down)

**Honest scoping**: multi-touch attribution penuh butuh order data eksternal
(Triple Whale tier) — di luar jangkauan sesi. Yang realistis sekarang:
selector attribution window (7d-click/1d-view, dsb.) pada reporting queries via
Meta `attribution_window` param — memberi angka berbeda model tanpa klaim MTA.
MTA penuh ditunda sampai ada sumber order data non-Meta.

---

## Out-of-code action items (owner)
- **Resend domain email**: beli/daftarkan Resend + verifikasi domain
  berkahkarya.org (SPF/DKIM) → isi RESEND_API_KEY. mailer.js sudah support.
- **Midtrans account**: aktivasi charge production kalau mau Midtrans kembali
  sebagai gateway (duitku jalan sebagai default).
- **TELEGRAM_CHAT_ID**: ganti ke chat owner final bila 5220170786 bukan tujuan.

---

## Urutan eksekusi & disiplin
1 → 2 → 3 → 4 → 5 → 6 → 7, tiap fase: implement → test suite green → deploy →
E2E live verify → commit+push. Branch disiplin: kerja di branch, merge ke main
per fase (pelajaran dari autoresearch/session branch).
