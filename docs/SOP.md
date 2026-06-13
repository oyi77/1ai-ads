# 🛡️ VILONA META ADS — GLOBAL SOP

> Last updated: 2026-06-15 WIB
> Berlaku untuk: 0858 (Kakriput), 1041 (Nyamiresep)

---

## 1. STRUKTUR SATPAM

| Job | Interval | Akun | Aksi |
|-----|----------|------|------|
| `satpam-1041` | 5 menit | 1041 | Monitor + rename + kill |
| `satpam-0858` | 5 menit | 0858 | Monitor + rename + kill |
| `lc-auto-clone` | ⏸️ PAUSED | — | Manual dulu |
| Report harian | 00:05 WIB | Semua | Kirim ke @Berkahkaryaautosalesbot |

---

## 2. GLOBAL CPC GATE (LAYER 0)

**Hitung:** `global_cpc = total_spend_7d / total_clicks_7d` (semua campaign aktif)

| Global CPC | Mode | Aksi |
|------------|------|------|
| < 120 | 🟢 AMAN | JANGAN bunuh siapapun. Watch doang. |
| 120-200 | 🟡 HATI-HATI | Bunuh CPC ≥ 500 aja |
| > 200 | 🔴 BAHAYA | Bunuh CPC > 200 + 0 clicks |

---

## 3. MONSTER KILLER (per-campaign)

| Kondisi | Aksi |
|---------|------|
| CPC ≥ 500 + spend > Rp 1,000 | 💀 **OFF_ + PAUSE** |
| CPC > 200 + 0 clicks + spend > Rp 500 | 👀 **PAUSE** (no OFF_) |
| CPC > 200 + clicks > 0 + spend > Rp 5,000 | 👀 **WATCH** (jangan bunuh) |
| CPC ≤ 200 | ✅ Aman |

**Rule: Global CPC < 120 → Monster killer DIMATIKAN. Gak ada yg dibunuh.**

---

## 4. WINNER DETECTION

| Kondisi | Status |
|---------|--------|
| CPC < 120 + clicks ≥ 5 + spend > Rp 10,000 | 🌟 **WINNER** → rename `🌟_{nama}` |
| CPC < 120 + clicks > 0 | ✅ LC-SCALE candidate |
| CPC 120-200 + clicks > 0 | ✅ KEEP |

**🌟 WINNER tidak auto-scale. Hanya rename. Manual dulu.**

---

## 5. LC BUDGET RULES

| Kondisi | Aksi |
|---------|------|
| Campaign LC_ + CPC < 120 | Naikin budget **+20%** (max 1x/hari) |
| Budget cap LC | Rp 50,000/hari (stop di sini) |
| LC dengan CPC > 200 | JANGAN naikin |

---

## 6. AUTO-UNPAUSE

| Kondisi | Aksi |
|---------|------|
| CPC < 120 + spend > 2K + status PAUSED + bukan OFF_ | **UNPAUSE** |

---

## 7. NAMING CONVENTION

| Prefix | Arti | Action |
|--------|------|--------|
| `🌟_` | WINNER | Scale candidate — manual clone |
| *(no prefix)* | Normal | KEEP |
| `OFF_` | Sampah permanen | 🚫 NEVER TOUCH |
| `DEAD_` | Trash | Bisa dihapus |

---

## 8. ACCOUNT-SPECIFIC

| Parameter | 0858 Kakriput | 1041 Nyamiresep |
|-----------|:------------:|:------------:|
| CPC Kill | 200 | 200 |
| Monster Kill | 500 | 500 |
| Global CPC Safe | < 120 | < 120 |
| LC Budget Max | Rp 50K | Rp 50K |
| Auto-Unpause | ✅ ON | ✅ ON |

---

## 9. REPORT FORMAT (tiap 5m)

```
🛡️ SATPAM {AKUN} {timestamp}
ACTIVE:{n} | Global CPC:Rp{x}

💀 MONSTER: {list}
👀 WATCH: {list}  
🌟 WINNER: {list}
📈 LC SCALE: {list budget naik}

Aksi: {ringkasan}
```

---

## 10. REPORT HARIAN (00:05 WIB ke @Berkahkaryaautosalesbot)

```
📊 LAPORAN HARIAN {tanggal}
0858: ACTIVE={n} | Global CPC=Rp{x} | Spend=Rp{x} | Monster={n} | 🌟={n}
1041: ACTIVE={n} | Global CPC=Rp{x} | Spend=Rp{x} | Monster={n} | 🌟={n}

Aksi hari ini:
- Monster dibunuh: {n}
- Di-unpause: {n}
- LC budget naik: {n}
- Winner ditandai: {n}

Total spend: Rp{total}
```

---

## 11. HARD RULES

1. **Global CPC < 120 → JANGAN BUNUH SIAPAPUN**
2. **OFF_ = HARAM disentuh**
3. **Jangan hapus campaign yg ada spend/konversi**
4. **LC budget naik max +20% per hari, cap Rp 50K**
5. **🌟 winner tidak auto-clone — manual dulu**
6. **Token dibaca dari file, bukan `source .env`**
