# AdForge — Gap Resolution Plan (2026-08 refresh)

Menutup gap paritas dari `PARITY-ROADMAP.md` + `COMPETITIVE_GAP_ANALYSIS.md`.
Setiap fase berdiri sendiri (shippable), urutan = dampak × usaha. Estimasi = kerja implementasi nyata di tree ini.

---

## Fase 1–7 — STATUS (diperbarui 2026-08-27)

| Fase | Isi | Status | Bukti |
|---|---|---|---|
| 1 Compound Rules | `{all}/{any}` evaluator + UI | ✅ SHIPPED | `rule-evaluator.js`, `9d355dd` |
| 2 Push Anomaly Alerts | server-side detect → bot | ✅ SHIPPED | `alerting.js`, `bot/scheduler.js` |
| 3 Creative Performance Tab | ads table → library | ✅ SHIPPED | `campaigns/performance` |
| 4 Custom Report Builder | pilih metrik → CSV/PDF | ⏳ PARTIAL (CSV ada, builder UI pending) | `routes/_reporting.js` |
| 5 Plan Expiry + Renewal | `plan_expires_at` + downgrade cron | ✅ SHIPPED | migration 032, `scheduler.js:283` |
| 6 Audience Builder | interest stack + saved audiences | ✅ SHIPPED | `audience-service.js` |
| 7 Attribution Selector | window param pada queries | ✅ SHIPPED | Meta `attribution_window` |

---

## Fase 8 — CSRF Protection (G1) · ~0.5 hari · 🔴 PRIORITAS 1

**Masalah:** `server/middleware/` hanya `audit/auth/rbac` — tidak ada proteksi CSRF pada state-changing routes. Enterprise buyer akan block.
**Perubahan:**
1. `server/middleware/csrf.js` — double-submit cookie / synchronizer token; bypass untuk API token (Bearer) & webhook.
2. Mount di `app.js` SETELAH auth, SEBELUM routes (audit sudah di :110).
3. Client: baca token dari `/api/csrf`, kirim header `X-CSRF-Token` pada POST/PUT/DELETE (fetch wrapper di `client/src/lib/api.ts` — file ini sedang di-edit, pasang di sana).
**Verifikasi:** curl POST tanpa token → 403; dengan token → 200. Unit test middleware.

## Fase 9 — Tiered Autonomy / Trust Mode (G3) · ~2 hari · 🔴 PRIORITAS 2

**Masalah:** hanya approval-first. Ryze/Hyper menang di "zero day-to-day involvement." AdForge butuh mode set-and-forget untuk akun terbukti.
**Perubahan:**
1. `users.autonomy_tier` (`approval_first` | `trust`); setting di `/settings`.
2. `autonomous-agent.js`: trust tier auto-execute pause/budget/bid setelah N aksi sukses; approval-first tetap default + untuk akun baru.
3. Bot: `/settings autonomy trust|approval`.
**Verifikasi:** akun trust jalan tanpa approval; akun baru tetap prompt. Log di audit.

## Fase 10 — MCP Differentiation (G5) · ~3–5 hari · 🔴 PRIORITAS 3

**Masalah:** MCP kini ramai (PaidSync write-access 8 network, Ryze, Synter). AdForge harus pertahankan edge.
**Perubahan:**
1. Audit `mcp-server.js`: pastikan write tools (create/update/pause campaign, set budget) terbuka untuk semua 22 adapter, bukan Meta/Google saja.
2. Tambah `agent-registry` endpoint — ekosistem agent pihak ke-3 bisa daftar.
3. Benchmark tool-count vs PaidSync; dokumentasikan keunggulan (SEA + Shopee + approval-first).
**Verifikasi:** agent eksternal eksekusi perubahan kampanye via MCP lintas platform.

## Fase 11 — Retail Media Breadth (G2) · ~3–5 hari · 🟡 PRIORITAS 4

**Masalah:** $128–200B channel 2026. Amazon adapter ada tapi belum diverifikasi CRUD; Walmart/Instacart absent.
**Perubahan:**
1. Audit `server/services/amazon/index.js` — CRUD kampanye atau read-only? Lengkapi jika kurang.
2. Adapter `server/services/walmart/` (Walmart Connect) + `instacart/` stub→working (sandbox).
3. Fan-out reporting sudah ada → reuse.
**Verifikasi:** buat kampanye di Amazon sandbox + Walmart sandbox; report muncul di dashboard.

## Fase 12 — Bid + Cross-Network Reallocation (G4) · ~2–3 hari · 🟡 PRIORITAS 5

**Masalah:** auto-optimizer baru pause + budget. "Best" = bid 24/7 + shift spend lintas platform.
**Perubahan:**
1. `auto-optimizer.js`: tambah `adjustBid(accountId, adsetId, deltaPct)` + `shiftSpend(srcAccount, dstAccount, pct)` lintas platform.
2. Guardrail: batas perubahan/hari + butuh trust tier (Fase 9) untuk auto.
**Verifikasi:** simulasi realokasi lintas-network; audit log tercatat.

## Fase 13 — AI Video Generation (G6) · ~2–3 hari · 🟡 PRIORITAS 6

**Masalah:** `meta-video-service.js` hanya upload. Generate video dari prompt = gap vs Smartly/Creatify.
**Perubahan:**
1. Wire backend generate (ComfyUI / Runway / MovieGen) ke `meta-video-service.js`.
2. UI: "Generate video ad" di Creative Studio → asset masuk library → upload ke Meta.
**Verifikasi:** prompt → video asset di library → publish ke Meta sandbox.

## Fase 14 — CI/CD + Web Onboarding (G9/G10) · ~2 hari · 🟢 PRIORITAS 7

1. **CI/CD:** GitHub Actions (lint + vitest + build + docker push). Trigger pada push ke main.
2. **Web onboarding:** wizard multi-step (connect platform → first campaign → bot link) di client, tidak bergantung `/start`.

---

## Urutan eksekusi
**T1(CSRF) → T3(trust) → T5(MCP) → T2(retail) → T4(bid) → T6(video) → T9/T10( polish) → T7(GTM, owner-led).**

Disiplin per fase: implement → test green → E2E live verify → commit + push. Branch per fase, merge ke main.

## Out-of-code (owner)
- **Meta App Review** — submit + unblock multi-account scale (`META_APP_REVIEW.md`).
- **GTM / brand** — case study SEA, comparison page vs Ryze/Madgicx, AppSumo/ProductHunt (`T7`).
- **Resend domain** — verifikasi berkahkarya.org (email alert prod).
