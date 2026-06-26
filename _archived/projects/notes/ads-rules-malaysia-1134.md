# Aturan Iklan Meta Ads — Shopee MALAYSIA via Akun IDR (1134)

> Disusun: 3 Juni 2026 — Revisi: Akun pakai currency IDR, bukan MYR
> Akun: act_1773760133153789 ("Selow ID 1134" / "malay 1134")
> Currency: **IDR (Rupiah)** — targeting Malaysia, billing IDR
> Riset: localzzdigital.com, WordStream 2025 benchmarks, Shopee MY Affiliate docs

---

## ⚠️ CATATAN PENTING

**Rules ini STARTING POINT berbasis riset market.**
Kalibrasi ulang setelah 3-7 hari data real.

**KRUSIAL:** Akun ini pakai **IDR** meskipun targeting Malaysia. Semua angka di bawah dalam RUPIAH.
Meta akan menagih dalam IDR dengan CPC yang mencerminkan biaya iklan di market Malaysia.

---

## 0. KONTEKS MARKET

```
                     INDONESIA (target ID)    MALAYSIA (target MY, bill IDR)
──────────────────────────────────────────────────────────────────────────
Currency Akun        IDR                      IDR
Market CPC           Rp 80 - 150              Rp 200 - 600 (estimasi)
Shopee Commission    Rp 2,500-3,000/order     Rp 9,000-18,000/order (RM 2-4)
Commission Ratio     1x                       3-6x Indonesia
Avg Order Value      Rp 50K-100K              RM 30-80 (Rp 135K-360K)
Audience             280M+                    34M

Kesimpulan: Commission per order Malaysia 3-6x lebih besar → CPC thresholds bisa lebih tinggi.
```

---

## 1. BUDGET RULES

### 1.1 Unit Budget — IDR (SAMA SEPERTI INDONESIA)
```
API Value    = Rupiah Langsung
100          = Rp 100
1,000        = Rp 1,000
10,000       = Rp 10,000
50,000       = Rp 50,000
```

### 1.2 HARD CAP HARIAN — AKUN 1134
```
┌──────────────────────────────────────────────────────┐
│ HARD CAP: Rp 400,000/hari — TOTAL SEMUA CAMPAIGN     │
│ (lebih tinggi dari 1041 karena commission MY lebih   │
│  besar → bisa sustain spend lebih tinggi)            │
├──────────────────────────────────────────────────────┤
│ 0% - 80%   (Rp 0 - 320K)      = ✅ AMAN              │
│ 80%        (Rp 320K)           = ⚠️ WARNING           │
│ 100%       (Rp 400K)           = 🚨 PAUSE ALL         │
└──────────────────────────────────────────────────────┘
```

**Aturan:**
- Total spend 1134 ≥ Rp 400K → PAUSE SEMUA campaign
- Evaluasi dari komisi Shopee MY:
  - ROI ≥ 2x → naik hard cap +Rp 50K
  - ROI < 2x → tetap atau turunkan
- Spend cap Meta: Rp 1,500,000 (aman — governor cap Rp 400K di bawah)

### 1.3 Budget Harian per Campaign
| Tipe Campaign | Budget/Hari (IDR) | Catatan |
|---------------|-------------------|---------|
| TEST (baru)   | Rp 25,000 - 40,000 | 3 hari learning |
| LC (lowcost)  | Rp 40,000 - 70,000 | Standard running |
| WINNER        | Rp 70,000 - 150,000| Scaled, profitable |
| BIDCAP        | Rp 40,000 - 60,000 | Budget bottlenecked by bid |

---

## 2. CPC & BID CAP RULES

### 2.1 Threshold — Malaysia via IDR
| Level | CPC (IDR) | Action |
|-------|-----------|--------|
| GAS+  | ≤ Rp 180  | 🔥 Elite — scale agresif |
| GAS   | ≤ Rp 250  | ✅ Scale — margin aman |
| WATCH | Rp 250 - 500 | ⚠️ Monitor, jangan scale |
| REM   | > Rp 500   | 🛑 PAUSE seketika |

### 2.2 Rationale (Commission Math)
```
Shopee MY avg commission: RM 2.00 - 4.00 per order
Dalam IDR: Rp 9,000 - 18,000 per order

Breakeven CPC Calculator:
  Max CPC = (Avg Commission × Conversion Rate) / Target ROAS

Scenario Konservatif (RM 2.00 = Rp 9,000, Conv 10%, ROAS 2x):
  Max CPC = (9,000 × 0.10) / 2 = Rp 450

Scenario Moderat (RM 2.50 = Rp 11,250, Conv 12%, ROAS 2x):
  Max CPC = (11,250 × 0.12) / 2 = Rp 675

Scenario Optimis (RM 3.00 = Rp 13,500, Conv 12%, ROAS 2x):
  Max CPC = (13,500 × 0.12) / 2 = Rp 810

→ GAS threshold Rp 250: PROFITABLE di semua scenario
→ REM threshold Rp 500: Hanya profitable di scenario moderat-optimis
→ Di atas Rp 500: risiko loss tinggi, PAUSE
```

### 2.3 Bid Cap
- Semua ad set: **bid_amount = 500** (Rp 500)
- Campaign CBO: set di campaign level
- Campaign ABO: set di ad set level
- **Target cost per hasil: Rp 350**

### 2.4 Gas-Rem Strategy Matrix
```
CTR ≥ 7% + CPC ≤ Rp 180  → GAS+ (scale +30%)
CTR ≥ 5% + CPC ≤ Rp 250  → GAS (scale +20%)
CTR 3-5% + CPC ≤ Rp 500  → JALAN (monitor)
CTR < 3% + CPC > Rp 500  → REM (pause, ganti kreatif)
CTR < 2% selama 2 jam     → REM (kreatif jelek)
```

---

## 3. TARGETING RULES

### 3.1 Thematic Clustering — WAJIB
- SATU TEMA per adset — jangan campur kategori
- Minimum 2M audience per adset

### 3.2 Targeting Default — Malaysia
| Parameter | Setting |
|-----------|---------|
| Location | Malaysia (country) |
| Age | 25-55 (adjust per produk) |
| Gender | All (adjust per produk) |
| Language | Malay (Bahasa Melayu), English |
| Placement | Advantage+ (auto) |
| Billing | IMPRESSIONS |

### 3.3 Product-Specific (sesuaikan dengan produk Shopee MY)
| Produk | Gender | Age | Interest Theme |
|--------|--------|-----|----------------|
| Home/Kitchen | Women | 25-55 | Home & Garden, Cooking |
| Fashion | Women | 18-45 | Fashion, Online Shopping |
| Kids/Baby | Women | 25-45 | Parenting, Baby Products |
| Electronics | All | 18-55 | Gadgets, Online Shopping |
| Beauty | Women | 18-45 | Beauty, Skincare |

---

## 4. CAMPAIGN MANAGEMENT

### 4.1 Larangan Duplikasi
- Maksimal 1 campaign per produk per account
- Jangan clone/duplicate campaign

### 4.2 Naming Convention
```
[STRATEGY]_[PRODUK]_[TARGET]_[BUDGET]
Contoh:
LC_Dapur_HomeMY_Rp40K
TEST_Fashion_WomenMY_Rp30K
WINNER_Kids_Set_Rp80K
```

### 4.3 Pause Ad Set Juga
- Campaign di-pause → pastikan ad set juga pause

---

## 5. STOP-LOSS & GAS RULES (OTOMATIS)

### 5.1 Pause Otomatis
| Kondisi | Action |
|---------|--------|
| CPC > Rp 500 | PAUSE campaign & ad set |
| Spend > 120% daily budget | PAUSE |
| CTR < 2% selama 2 jam | PAUSE |
| 3+ campaign identik | PAUSE semua kecuali 1 |
| ROAS < 0.5 selama 3 hari | PAUSE, reevaluasi |
| Total spend > Rp 400K/hari | PAUSE ALL |

### 5.2 Gas Otomatis
| Kondisi | Action |
|---------|--------|
| CPC ≤ Rp 180 + CTR ≥ 7% | Scale +30% (GAS+) |
| CPC ≤ Rp 250 + CTR ≥ 5% | Scale +20% (GAS) |
| ROAS ≥ 2x selama 3 hari | Scale +50% |

---

## 6. SAFETY GUARDRAILS

### 6.1 OFF_ Prefix = NEVER TOUCH
### 6.2 Cooldown: 2 jam antara scale campaign sama
### 6.3 Midnight Quiet: 23:00-05:00 WIB (tidak scaling)
### 6.4 LC_ Only Scaling (BIDCAP/TC tidak di-scale)
### 6.5 Max Budget per Kategori Campaign
| Kategori | Max Budget (IDR) |
|----------|-----------------|
| Home/Kitchen | Rp 200,000 |
| Fashion | Rp 150,000 |
| Kids/Baby | Rp 120,000 |
| Beauty | Rp 150,000 |
| Electronics | Rp 180,000 |
| Testing/New | Rp 80,000 |
| DEFAULT | Rp 120,000 |

---

## 7. MAPPING LENGKAP: INDONESIA (1041) → MALAYSIA (1134)

```
PARAMETER               1041 (ID)           1134 (MY via IDR)    NOTES
─────────────────────────────────────────────────────────────────────
Hard Cap Harian         Rp 300,000          Rp 400,000           MY commission 3-6x
CPC REM (pause)         > Rp 130            > Rp 500             MY market CPC lebih tinggi
CPC GAS (scale)         ≤ Rp 100            ≤ Rp 250             
CPC GAS+ (aggressive)   ≤ Rp 80             ≤ Rp 180             
Bid Target/Cost Cap     Rp 90               Rp 350               
Budget Test             Rp 20,000           Rp 25-40K            
Budget Running          Rp 20-36K           Rp 40-70K            
Budget Winner           Rp 50-100K          Rp 70-150K           
Max Budget/Campaign     varies              Rp 80-200K           
CTR GAS                 ≥ 5%                ≥ 5%                 SAMA
CTR GAS+                ≥ 7%                ≥ 7%                 SAMA
CTR Minimum             ≥ 3%                ≥ 3%                 SAMA
CTR REM                 < 2% (2 jam)        < 2% (2 jam)         SAMA
ROAS Target             ≥ 2.0x              ≥ 2.0x               SAMA
ROAS Kill               < 0.5x (3 hari)     < 0.5x (3 hari)      SAMA
Cooldown                2 jam               2 jam                SAMA
Midnight Quiet          23-05 WIB           23-05 WIB            SAMA
Min Audience/Adset      2M                  2M                   SAMA
OFF_ Prefix             NEVER TOUCH         NEVER TOUCH          SAMA
LC_ Only Scale          ✅                  ✅                   SAMA
```

---

## 8. DAILY CHECKLIST

Setiap hari:
1. ✅ CPC semua campaign — > Rp 500 = pause
2. ✅ Total spend vs hard cap Rp 400K
3. ✅ CTR — < 3% = evaluate creative
4. ✅ No duplicate campaign
5. ✅ Ad set ikut pause
6. ✅ Laporkan: spend, CPC, CTR, order (dalam IDR)

---

## 9. KALIBRASI — REVIEW SETELAH 7 HARI

**WAJIB dikalibrasi setelah data real:**
1. Jika CPC real konsisten Rp 200-300 → GAS threshold bisa diturunkan ke Rp 200
2. Jika CPC real konsisten di atas Rp 400 → targeting/creative perlu revisi
3. Review conversion rate aktual → adjust breakeven
4. Review komisi rata-rata per order dari Shopee MY

---

*Rules by Vilona — 3 Juni 2026 (Revisi: IDR currency)*
*Akun: act_1773760133153789 — Selow ID 1134*
