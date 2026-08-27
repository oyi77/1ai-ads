# AdForge API Reference

> **Refreshed:** 2026-08-27. Documents the **primary 8 platforms** (Meta, Google, TikTok, LinkedIn, Pinterest, Snapchat, Twitter, Microsoft). AdForge has **22 platform adapters** total — see `architecture.md`. Endpoint paths below are verified against `server/routes/`.

All endpoints prefixed with `/api`. Protected endpoints require `Authorization: Bearer <token>`.

## ⚠️ Corrections / Notes (read first)
- **Auth header:** `Authorization: Bearer <JWT>` (not `***`).
- **CSRF (pending T1):** Once `server/middleware/csrf.js` ships (GAP-RESOLUTION-PLAN T1), ALL state-changing requests (POST/PUT/PATCH/DELETE) MUST include `X-CSRF-Token`. Until then, bearer auth only.
- **Rate limits:** Public endpoints ≈ 100 req / 15 min. Protected endpoints are **NOT unlimited** — per-platform limiters apply (`server/lib/platform-client.js`: Meta 5/s, Google 8/s, etc.). The "unlimited" claim in older copies is wrong.
- **Multi-tenant:** every route is scoped by `user_id` (resolve-owner-platform). Tokens per-user; system token only for fan-out.

## Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | Register user |
| POST | `/api/auth/login` | Public | Login → JWT + refresh |
| POST | `/api/auth/refresh-token` | Public | Refresh JWT |
| POST | `/api/auth/logout` | Public | Revoke refresh token |
| GET/POST | `/api/auth/facebook/deauthorize` | Protected | FB data-deletion callback |
| GET/POST | `/api/auth/google/deauthorize` | Protected | Google data-deletion callback |

## Campaigns (Meta-centric primary)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id` | Get campaign |
| PUT | `/api/campaigns/:id` | Update campaign |
| DELETE | `/api/campaigns/:id` | Delete campaign |
| POST | `/api/campaigns/:id/activate` | Activate |
| POST | `/api/campaigns/:id/pause` | Pause |
| POST | `/api/campaigns/:id/duplicate` | Duplicate (Zero-Ads-Manager A2) |
| PATCH | `/api/ads/:id` | Update single ad (pause per-ad) |

## Per-Platform (primary 8)
Meta `/api/meta/*` · Google `/api/google-ads/*` · TikTok `/api/tiktok-ads/*` · LinkedIn `/api/linkedin-ads/*` · Pinterest `/api/pinterest-ads/*` · Snapchat `/api/snapchat-ads/*` · Twitter `/api/twitter-ads/*` · Microsoft `/api/microsoft-ads/*`.

Each exposes: `accounts`, `accounts/:id/campaigns`, `sync`, create/update campaign, `status`. (Full tables unchanged from prior version — verified present in `server/routes/<platform>-ads.js`.)

## MCP (Model Context Protocol)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/mcp/sse` | Protected | SSE stream |
| POST | `/api/mcp/messages` | Protected | MCP message |
| GET | `/api/mcp/status` | Protected | Server status |
| POST | `/api/mcp/connect` / `disconnect` | Protected | Platform MCP link |
| GET | `/api/mcp/tools/:platform` | Protected | List tools |
| POST | `/api/mcp/call` | Protected | Call tool |

> MCP is a **differentiator** (contested 2026 — PaidSync/Ryze). T5 expands write-access across all 22 adapters.

## Reporting / Creative / Automation / Competitor
- Reporting: `/api/reporting/unified`, `/api/reporting/widgets`, `/api/reports/export/csv`, `/api/attribution/summary|matches`, `/api/analytics`
- Creative: `/api/creative/library*`, `/api/creative/fatigue/detect/:id`, `/api/creative/generate`, `/api/creative/score`
- Automation: `/api/automation/rules` (CRUD) — compound `{all}/{any}` evaluator
- A/B: `/api/ab-tests` (CRUD)
- Competitor: `/api/competitor-spy/insights`, `/api/competitor-spy/analyze`

## 📌 Documented Gaps (exist, not enumerated above — verify in `server/routes/`)
| Area | Where |
|---|---|
| Audiences (saved + lookalike) | `server/routes/audiences*` , `audience-service.js` |
| Payments + OAuth onboarding | `server/routes/payments*`, `server/services/payments.js`, `auth.js` |
| Realtime | `server/routes/realtime.js` + WS `/ws/realtime` (`realtime-service.js`) |
| Webhook (Telegram) | `server/lib/meta-subscribe.js`, webhook router |
| Dayparting hourly | `server/services/meta/index.js` `/hourly` breakdown |
| Telegram bot commands | `server/bot/commands/*` (not HTTP — bot scope) |

> **Action:** generate full endpoint map from `server/routes/` (a scripted `grep` → OpenAPI) is a good hygiene task; current doc is hand-maintained and lags.

## Health
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | Public | `{"status":"ok"}` |
| GET | `/api/cf-health` | Public | Cloudflare health |

## Response Format
```json
{ "success": true, "data": { ... } }
// or
{ "success": false, "error": "message" }
```
