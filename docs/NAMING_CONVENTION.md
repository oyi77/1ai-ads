# Naming Convention Standard — Meta Ads Campaign

## Format Baku

```
CAMPAIGN: {STRATEGI}_{AKUN}_{PRODUK}_{TAGLINK}_{AUDIENCE}_{TANGGAL}
ADSET:    {STRATEGI}_{AKUN}_{PRODUK}_{INTEREST}_{UMUR}
AD:       {AKUN}_{PRODUK}_{CREATIVE}_{VERSI}
```

## Komponen

| Field | Deskripsi | Contoh |
|-------|-----------|--------|
| STRATEGI | Jenis campaign Meta | BIDCAP, LC, TC, BC, ABO |
| AKUN | Nama akun Shopee | Nyamiresep, Kakriput |
| PRODUK | Nama produk | Rakdapur3, Atayasetelankaosanak |
| TAGLINK | Tag_link1 Shopee (lowercase) | rakdapur3, atayasetelankaosanak |
| AUDIENCE | Target audience / interest tema | Drama, Dapur, Fashion |
| INTEREST | Interest Meta spesifik | DapurMemasak, RumahKebun |
| UMUR | Range umur target | 25-55, 18-45 |
| CREATIVE | Jenis konten | Video1, Gambar2, Carousel |
| VERSI | Versi creative | v1, v2, v3 |
| TANGGAL | Tanggal pembuatan (DDMM) | 0603, 1206 |

## Contoh Lengkap

```
CAMPAIGN: BIDCAP_Nyamiresep_Rakdapur3_rakdapur3_Drama_0603
ADSET:    BIDCAP_Nyamiresep_Rakdapur3_DapurMemasak_25-55
AD:       Nyamiresep_Rakdapur3_Video1_v2

CAMPAIGN: LC_Nyamiresep_Atayasetelankaosanak_atayasetelankaosanak_Fashion_0603
ADSET:    LC_Nyamiresep_Atayasetelankaosanak_PakaianAnak_25-45
AD:       Nyamiresep_Atayasetelankaosanak_Gambar1_v1
```

## Rules

1. **STRATEGI harus akurat** — BIDCAP ≠ LC ≠ TC
2. **TAGLINK harus lowercase** — match persis Tag_link1 Shopee
3. **TANGGAL format DDMM** — tanpa tahun
4. **Max 120 karakter** — Meta limit
5. **Ga boleh ada spasi** — ganti underscore
6. **OFF_ prefix** — jika dipause permanen (rename manual)

## Mapping ke Decision Center

Script auto-detect dari nama campaign:
- STRATEGI → jenis scaling (BIDCAP=NO-SCALE, LC=SCALE)
- TAGLINK → matching ke Shopee commission
- PRODUK → reporting grouping
- TANGGAL → freshness tracking
