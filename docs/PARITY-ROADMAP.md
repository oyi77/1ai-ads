# AdForge — Feature Parity Roadmap vs Competitors (2026-08 refresh)

**Basis:** Madgicx, Revealbot, AdEspresso, Smartly.io, Motion, Triple Whale, **+ 2026 entrants Ryze AI, Hyper, PaidSync, Segwise**.
**Method:** code-audited 2026-08-27 with file:line receipts. Score 0–2 = presence≠depth.

## Verified Parity Matrix (current tree)

| Dimension | Best competitor | AdForge | Status | Receipt |
|---|---|---|---|---|
| Campaign CRUD + multi-platform | 2 | **2** | ✅ | 22 adapter dirs `server/services/*/` |
| Autonomous execution (pause/budget/bid) | 2 (Ryze/Hyper) | **2** | ✅ | `auto-optimizer.js:147,173`; `autonomous-agent.js:64` |
| Automation rules (compound AND/OR) | 2 | **2** | ✅ | `rule-evaluator.js` `{all}/{any}` |
| Creative fatigue + auto-rotation | 2 | **2** | ✅ | `fatigue-detector.js:385` |
| AI reports / recommendations | 2 | **2** | ✅ | per-account SWOT + daily digest |
| Dayparting / hourly heatmap | 2 | **2** | ✅ | `domain/optimization.js:223`; `meta/index.js:196` |
| Budget pacing | 2 | **2** | ✅ | pacing bar vs 7-day avg |
| Anomaly detection | 2 | **2** | ✅ | banner + `alerting.js` |
| Audit logging | 2 | **2** | ✅ (was false GAP) | `middleware/audit.js` |
| Realtime WebSocket | 2 | **2** | ✅ | `realtime-service.js` |
| AI image generation | 2 | **2** | ✅ | `image-generator.js` |
| Report builder + export | 2 | **1→2** | ✅ CSV; custom builder pending | `GAP-RESOLUTION-PLAN.md` P4 |
| Creative-level insights | 2 | **2** | ✅ | ads table → library perf tab |
| Audience tools (saved + lookalike) | 2 | **2** | ✅ | `audience-intelligence.js`; lookalike prep |
| Attribution window selector | 1 | **1** | ✅ | Meta `attribution_window` param |
| Approval/consent workflow | 0 | **2** | 🌟 UNIQUE | draft approval owner-scoped |
| Telegram Mini App + bot | 0–1 | **2** | 🌟 UNIQUE | 11 cron jobs |
| Self-serve billing multi-tenant | 1 | **2** | ✅ | Duitku + plan gating |
| **CSRF protection** | 2 | **0** | 🔴 GAP | no `middleware/csrf.js` |
| **AI video generation** | 2 | **1** | 🟡 upload only | `meta-video-service.js` (upload) |
| **Retail media (Amazon/Walmart)** | 2 (Hyper/Amazon) | **1** | 🟡 Amazon adapter exists, unverified CRUD; Walmart missing | `server/services/amazon/index.js` |
| **Tiered autonomy (trust mode)** | 2 (Ryze set-and-forget) | **1** | 🟡 approval-first only | `boost-approval.js` |
| **MCP write-access breadth** | 2 (PaidSync 8-net write) | **1** | 🟡 MCP exists, breadth unverified vs competitors | `mcp-server.js` |

## Shipped since June (verified)
Compound rules · dayparting heatmap · anomaly banner · creative auto-rotation · audit log · realtime WS · image gen · payments+oauth · multi-platform fan-out · Amazon adapter.

## Next actionable steps (driven by "best in industry")
1. **T1** CSRF protection — security prereq for enterprise.
2. **T3** Tiered autonomy (trust mode) — differentiate vs Ryze/Hyper's set-and-forget.
3. **T5** MCP differentiation — defend moat against PaidSync/Ryze.
4. **T2** Retail-media breadth (audit Amazon, add Walmart).
5. **T4** Bid + cross-network reallocation.
6. **T6** AI video generation.
7. **T9/T10** CI/CD + web onboarding.
8. **T7** GTM / brand (owner-led).

Full task specs in `GAP-RESOLUTION-PLAN.md`. Competitive gap reasoning in `COMPETITIVE_GAP_ANALYSIS.md`.

## Differentiation principle
Do NOT chase Madgicx's full checklist. Double down on the lane competitors cannot copy: **Telegram-native autonomous ads for SEA SMBs + agencies, approval-first trust, MCP ecosystem, Shopee/SEA.** Close only the gaps that block enterprise sales (CSRF) or erode the moat (MCP breadth, tiered autonomy).
