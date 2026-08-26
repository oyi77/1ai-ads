# AdForge — Feature Parity Roadmap vs Competitors (2026-08)

Basis pembanding: Madgicx, Revealbot, AdEspresso, Smartly.io, Motion, Triple Whale.
Skor kedalaman 0-2 mengikuti kerangka industri (presence ≠ depth).

## Matriks Paritas

| Dimensi | Kompetitor terbaik | AdForge | Status | Catatan |
|---|---|---|---|---|
| Campaign CRUD + multi-platform adapters | 2 | 2 | ✅ | Meta live; Google/TikTok/LinkedIn/8 adapter lain terdaftar |
| Automation rules | 2 (compound, sub-hourly) | 1 | ⚠️ | Rule engine single-condition + scheduler hourly. Compound AND/OR belum |
| Creative fatigue detection | 2 | 2 | ✅ | FatigueDetector multi-sinyal + auto-refresh queue |
| AI reports / rekomendasi | 2 | **2** | ✅ | Per-akun SWOT LLM + fallback rules + digest harian (unik: approval-first) |
| Dayparting / hourly heatmap | 2 | **2** | ✅ baru | `/hourly` endpoint + heatmap UI (advertiser TZ) — hari ini rilis |
| Budget pacing | 2 | **1→2** | ✅ UI | Pacing bar vs rata-rata 7 hari; belum vs daily_budget per campaign |
| Anomaly detection | 2 | **1→2** | ✅ UI | Banner anomali (spike spend, ROAS collapse, no-purchase); belum push alert otomatis |
| Report builder + export | 2 | 1 | ⚠️ | CSV export laporan akun ada; custom report builder belum |
| Creative-level insights | 2 | 1 | ⚠️ | Creative library statis; performa per-kreatif via ads table belum tersambung ke UI library |
| Audience tools | 2 | 1 | ⚠️ | Saved audiences + audience intelligence (Pro); lookalike builder belum |
| Attribution | 1 | 1 | ⚠️ | Pro-gated attribution router; multi-touch belum |
| Approval/consent workflow (unik) | 0 | **2** | 🌟 | Draft approval owner-scoped — kompetitor tidak punya "final say stays yours" |
| Telegram Mini App + bot penuh | 0-1 | **2** | 🌟 | Diferensiasi nyata vs semua kompetitor |
| Self-serve billing multi-tenant | 1 | 2 | ✅ | Duitku checkout + plan gating |

## Yang baru dirilis sesi ini
- Hour-of-day heatmap (`breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`, v22)
- Pacing bar + anomaly banner di Account Reports
- CSV export laporan akun
- Digest harian otomatis ke Telegram

## Roadmap berikutnya (urutan dampak)
1. **Compound rules** — evaluator AND/OR + UI rule builder bertingkat (menutup gap terbesar vs Revealbot)
2. **Push alert anomali** — banner kini client-side; dorong via bot saat digest/anomaly cron mendeteksi
3. **Creative performance tab** di Library — sambungkan ads table (platform_id sudah ada sejak migration 026) ke kartu kreatif
4. **Custom report builder** — pilih metrik/window/platform → PDF/CSV
5. **Recurring billing** — Duitku subscription atau expiry-based renewal
6. **Lookalike/interest builder** di Audiences
7. **Multi-touch attribution** (butuh data order eksternal; pertimbangkan integrasi Triple Whale-style)

## Prinsip diferensiasi
Jangan mengejar checklist Madgicx secara utuh — kuatkan posisi unik:
**AI reports + approval-first automation + Telegram-native UX**, lalu tutup gap kedalaman
(compound rules, creative insights) satu per satu.
