# Facebook Lookalike Audience — Data Siap Upload

Dibuat: 26 Agustus 2026
Sumber digabung (11 file upload → 6 file unik, duplikat dibuang):

| Sumber | Baris | Isi |
|---|---|---|
| orderonline (export semua produk, Mar 2025) | 6.144 | Nama, HP, provinsi, kota, zip |
| export-order (kiriman Ninja 2023) | 417 | Nama penerima, HP, alamat, kota, provinsi, zip |
| KIRIMAN CLIENT (pickup 2024) | 498 | Nama penerima, HP, kota, provinsi |
| MENGANTAR JNE (Juni–Des 2024) | 690 | Nama customer, HP, provinsi, kota, zip |
| data.xls (kiriman 2023) | 534 | Nama customer, HP, provinsi, kota, zip |
| lincah / matolinca / zonafashion | — | DIKELUARKAN — isinya laporan penghasilan Shopee, tidak ada data customer |

## File output

| File | Jumlah | Keterangan |
|---|---|---|
| `facebook_lookalike_audience_all.csv` | **7.760** | Semua customer unik (termasuk order pending/batal) |
| `facebook_lookalike_audience_paid_only.csv` | **4.370** | Hanya order **lunas / terkirim** (sinyal pembeli paling kuat) |

Format: CSV UTF-8, kolom `phone,fn,ln,ct,st,zp,country`
- `phone` — format internasional Indonesia (`62...` tanpa 0/+), sudah dinormalisasi
- `fn/ln` — nama depan/belakang, sudah dibersihkan & title case
- `ct/st/zp` — kota, provinsi, kode pos
- `country` — `ID`

Sudah dideduplikasi berdasarkan nomor HP (0 duplikat). 100% nomor valid format 62.

## Cara upload ke Meta Ads

1. Buka **Ads Manager → Audiences** → **Create audience → Custom audience**
2. Pilih **Customer list**
3. Upload file CSV → centang **"This file has headers"** (jika diminta)
4. Pastikan mapping kolom benar: Phone → nomor telepon, First Name, Last Name, City, State, ZIP, Country
5. Pilih negara **Indonesia** (ID)
6. **Add** → tunggu matching selesai (biasanya 15–60 menit)
7. Untuk Lookalike: pilih custom audience tersebut → **Create similar audience (Lookalike)**
   - Pilih negara target + persentase (1% paling mirip, 2–3% lebih luas)
   - **Minimal 100 orang** untuk bisa bikin lookalike — kedua file jauh di atas itu ✅

## Tips
- Mulai dengan `paid_only.csv` (4.370) — kualitas pembeli tertinggi untuk lookalike.
- Pakai `all.csv` (7.760) jika butuh audience lebih besar.
- Jangan upload kedua file ke audience yang sama (nanti tumpang tindih).
