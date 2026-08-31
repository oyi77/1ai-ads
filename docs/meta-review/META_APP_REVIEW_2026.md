# Meta App Review — Dokumen Siap Submit
# App: Adforge (ID: 2219265658828209)
# Prepared: 2026-08-31 (data diverifikasi via Graph API live)

---

## STATUS YANG SUDAH SIAP (verified)

| Item | URL / Status | Verified |
|---|---|---|
| Privacy Policy | https://adforge.aitradepulse.com/privacy | ✅ HTTP 200 |
| Terms of Service | https://adforge.aitradepulse.com/terms | ✅ route ada |
| Data Deletion POST | https://adforge.aitradepulse.com/api/auth/facebook/deauthorize | ✅ return confirmation |
| App Domain | adforge.aitradepulse.com | ✅ |
| Business Verification | Produk digital (1611764243355432) | ✅ **verified** |
| App Mode | DEVELOPMENT (harus diubah ke Live setelah review) | ⚠️ |
| Primary Page | Berkah Karya Digital Agency (1249880208207067) | ✅ |
| Ad Account utama | act_1181078009580337 (Selow ID 1340) | ✅ active |
| System User | Adforge (122098346973309353) | ✅ |

---

## PERMISSIONS YANG DIMINTA (semua butuh Advanced Access)

1. `ads_management` — buat/pause/resume/scale campaign, ad set, ad
2. `ads_read` — baca insights, spend, ROAS, campaign list
3. `pages_read_engagement` — baca post/page (untuk inject post ID)
4. `pages_manage_posts` — post ke page (untuk inject post ID)
5. `business_management` — akses Business Manager assets

---

## USE CASE (copy-paste ke form review)

**Indonesia:**
```
Adforge adalah platform manajemen iklan multi-platform untuk UKM dan
digital agency di Indonesia. Pengguna mengelola iklan Facebook/Instagram
langsung dari Telegram bot: membuat campaign (auto-PAUSED), mengelola
multi-platform ad accounts, inject creative dengan post ID dari halaman
Facebook, laporan ROAS/spend real-time, dan aturan otomatisasi
(pause/resume/scale budget berdasarkan metrik).

Pengguna adalah pemilik bisnis yang sudah memiliki Facebook Page dan
Ad Account, yang menghubungkannya via OAuth dengan persetujuan eksplisit.
```

**English:**
```
Adforge is a multi-platform ad management platform for small businesses
and digital agencies in Indonesia. Users manage Facebook/Instagram ads
directly from a Telegram bot: create campaigns (auto-PAUSED), manage
multi-platform ad accounts, inject creatives with Facebook Page post IDs,
real-time ROAS/spend reporting, and automation rules (pause/resume/scale
budget based on metrics).

Users are business owners who already own a Facebook Page and Ad Account,
connecting them via OAuth with explicit consent.
```

---

## JUSTIFIKASI PER PERMISSION (copy-paste)

### ads_management
**Penggunaan:** Membuat, mengelola, mengoptimalkan campaign/ad set/ad via Graph API. Pengguna menghubungkan Ad Account sendiri via OAuth; AdForge membuat campaign (status PAUSED), update budget, pause/resume, dan menerapkan aturan automasi (scale/pause berdasarkan ROAS/spend).

**Nilai:** Kelola multiple Ad Accounts dari satu bot, hemat waktu vs Ads Manager manual. Automasi rules-based membantu UKM optimalkan budget tanpa monitoring 24/7.

**Kenapa perlu:** Tanpa ini, fungsi inti ad management tidak bisa berjalan. Campaign creation, budget adjustment, status control = core value proposition.

### ads_read
**Penggunaan:** Membaca performa iklan (spend, impressions, clicks, CTR, ROAS, conversions) untuk dashboard, evaluasi aturan automasi (ROAS < X → pause), dan laporan harian/mingguan.

**Nilai:** Visibilitas penuh performa iklan + rekomendasi optimasi data-driven.

**Kenapa perlu:** Tanpa ini tidak bisa menampilkan metrik atau menjalankan automasi berbasis data.

### pages_read_engagement
**Penggunaan:** Membaca post & engagement halaman Facebook untuk memilih post organik terbaik yang di-boost menjadi ad (proven post strategy).

**Nilai:** User boost konten yang sudah terbukti perform, hemat budget testing.

**Kenapa perlu:** Fitur "Creative Recommendation" butuh data engagement untuk memilih post terbaik dijadikan ad.

### pages_manage_posts
**Penggunaan:** Membuat post (dark post) di halaman Facebook sebagai creative ad, dan inject post ID yang sudah ada menjadi ad.

**Nilai:** Workflow creative creation mulus tanpa keluar ke Ads Manager.

**Kenapa perlu:** Creative ad di Facebook memerlukan post/page; inject post ID adalah cara user membuat iklan dari konten existing.

---

## DATA HANDLING (untuk form)

- Data iklan & insight disimpan di database lokal (SQLite) milik pengguna
- Access token disimpan **terenkripsi** (AES) di server
- Tidak ada data iklan dibagikan ke pihak ketiga
- Pengguna dapat menghapus semua data kapan saja via endpoint Data Deletion
- Scoped per-user: setiap permintaan hanya mengakses Ad Account milik user itu

---

## LANGKAH SUBMIT (di Meta Developer Dashboard)

1. Buka https://developers.facebook.com/apps/2219265658828209
2. Menu kiri → **App Review** → **Permissions and Features**
3. Untuk tiap permission (`ads_management`, `ads_read`, `pages_read_engagement`, `pages_manage_posts`, `business_management`):
   - Klik **Request Advanced Access**
   - Paste use case + justifikasi di atas
   - Upload **screenshot/video demo** (5 screenshot: /status, /ads, /create, /optimize, /monitor)
4. Submit → tunggu 3-7 hari
5. Setelah approved → **App Settings → App Mode → Live**
6. **Regenerate System User Token** (buat baru di Business Manager, karena token lama terikat app dev mode)
7. Simpan ulang di bot: `/metaapp` → masukkan System Token, App ID, App Secret (sudah tersimpan, tinggal update token)

---

## CHECKLIST

```
[x] Privacy Policy URL ter-set → https://adforge.aitradepulse.com/privacy (200)
[x] Terms URL → https://adforge.aitradepulse.com/terms
[x] Data Deletion callback → POST /api/auth/facebook/deauthorize (works)
[x] Business verified → Produk digital (1611764243355432)
[ ] Submit ads_management Advanced Access
[ ] Submit ads_read Advanced Access
[ ] Submit pages_read_engagement Advanced Access
[ ] Submit pages_manage_posts Advanced Access
[ ] Submit business_management Advanced Access
[ ] Screenshot/video demo (5)
[ ] App Mode → Live
[ ] Regenerate System User Token
[ ] Update bot via /metaapp
[ ] Test create campaign penuh (sampai ad)
```

---

## CATATAN PENTING

- **Dua jalur create creative** (AI-generated pageId+link_data DAN object_story_id/post ID) keduanya diblokir di dev mode — jadi **App Review tidak bisa dihindari** untuk dapat `pages_manage_posts` + `ads_management`.
- App ID di form lama (704618995979962) sudah **tidak valid** — App aktif sekarang adalah **2219265658828209**.
- Business sudah verified → mempercepat review (tidak perlu business verification lagi).
