## CARA BACA META ADS DATA — AKUN 0858 (IDR)

### 1. META GRAPH API

Semua nilai dari Meta Graph API untuk akun Indonesia (IDR) adalah **RUPIAH LANGSUNG**, bukan cents!

| Field | Contoh Raw | Artinya | √ |
|---|---|---|---|
| `daily_budget` | 500000 | Rp 500.000 | ✅ |
| `daily_budget` | 20000 | Rp 20.000 | ✅ |
| `spend` (insights) | 775745 | Rp 775.745 | ✅ |
| `cpc` (insights) | 153 | Rp 153 per klik | ✅ |
| `spend` (insights) | 3411263 | Rp 3.411.263 | ✅ |

**JANGAN PERNAH ÷100 atau ×100!** API langsung Rupiah.

### 2. EXCEL EXPORT META ADS

File: `Selow-ID-0858-Kampanye-2-Jun-2026-8-Jun-2026.xlsx`

| Kolom | Header | Isi |
|---|---|---|
| 0 | Tanggal | Periode campaign |
| 1 | Nama Iklan | Nama iklan |
| 2 | Nama Kampanye | Nama campaign |
| 3 | Segmentasi | Audience targeting |
| 4 | Hasil | Link clicks / conversions |
| 5 | Biaya per Hasil | Cost per result |
| 6 | Biaya per klik (BPK) | Cost per click (CPC) |
| 7 | Anggaran | Daily budget (IDR) |
| 8 | Belanja Iklan | Total spent today |
| 9 | Jumlah yang dibelanjakan | Total amount spent (IDR) |
| 10 | Tayangan | Impressions |
| 11 | Frekuensi | Frequency |
| 12 | CPC (rata-rata) | Average CPC |
| 13 | Klik tautan | Link clicks |

**PENTING:** Anggaran (kolom 7) dan Jumlah dibelanjakan (kolom 9) langsung Rupiah. Tidak perlu ÷100.

### 3. DATA 2-8 JUNI 2026 — AKUN 0858

```
TOTAL SPEND 7 HARI: Rp 3.411.263
RATA PER HARI:     Rp 487.323
TOTAL KLIK:        22.224
CPC RATA-RATA:     Rp 153
BUDGET STANDAR:    Rp 500.000/campaign/hari
```

### 4. TOP 10 CAMPAIGN BY SPEND

| # | Campaign Name | Spend 7hr | Klik | CPC |
|---|---|---|---|---|
| 1 | setelan_fashionShopping_BID | Rp 775.745 | 6.886 | Rp 113 |
| 2 | GEO_rakpiring_INT08 | Rp 372.730 | 1.928 | Rp 193 |
| 3 | Organizer_Dapur_0603 | Rp 324.916 | 1.775 | Rp 183 |
| 4 | GEO_rakpiring_INT07 | Rp 307.676 | 1.584 | Rp 194 |
| 5 | setelan_fashionBelanja | Rp 223.701 | 1.682 | Rp 133 |
| 6 | Rakpiring_Winner_0603 | Rp 214.631 | 1.238 | Rp 173 |
| 7 | GEO_rakpiring_INT04 | Rp 207.499 | 1.096 | Rp 189 |
| 8 | Rakpiring_Shopping_0603 | Rp 192.795 | 1.010 | Rp 191 |
| 9 | Organizer_Travel_0603 | Rp 165.182 | 873 | Rp 189 |
| 10 | gajahThailand_fashion | Rp 134.050 | 1.324 | Rp 101 |

### 5. RULES SCALE-UP (NYAMIRESEP DAPUR PATTERN)

1. 1 campaign = 1 taglink
2. Dalam 1 campaign, buat BANYAK adset dengan audience BERBEDA-BEDA
3. Budget per adset: **Rp 20.000** (LOWEST_COST, tanpa cost cap)
4. Scale = TAMBAH adset BARU, JANGAN naikin budget adset existing
5. Post ID: WAJIB sesuai produk + taglink
6. Platform sesuaikan: rakpiring/organizer → Instagram, setelan/gajah → Facebook
7. Kalau CVR > 5% → layak tambah adset
8. Jangan pause kalau CVR > 5% atau pending komisi > Rp 50.000

### 6. SALE CALENDAR 2026

| Tanggal | Event | Boost |
|---|---|---|
| 25-27 Juni | Gajian + Co-Creation | 2x |
| 7 Juli | 7.7 Sale | 2,5x |
| 9 September | 9.9 Super Sale | 3x |
| 11 November | 11.11 Big Sale | 3x |
| 12 Desember | 12.12 Year-End | 3x |
