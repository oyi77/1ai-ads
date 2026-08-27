# AdForge — AI-Powered Ad Management Platform

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Status](https://img.shields.io/badge/Status-Production%20Ready-green.svg)
![Node](https://img.shields.io/badge/Node.js-22-green.svg)
![React](https://img.shields.io/badge/React-19-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)

## Stack

- **Backend:** Express 5 + SQLite (better-sqlite3)
- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Bot:** Telegraf (Telegram) — 7 commands, 10 cron jobs
- **Security:** AES-256-GCM encryption, Helmet, audit logging, JWT auth
- **MCP:** Model Context Protocol server with 13 tools (SSE transport)
- **Deploy:** Docker Compose, auto-restart on boot

## Quick Start

### Docker (production)

```bash
git clone https://github.com/oyi77/1ai-ads.git
cd 1ai-ads
cp .env.example .env  # Configure JWT_SECRET, ENCRYPTION_KEY, TELEGRAM_BOT_TOKEN
npm install            # Install deps for build
cd client && npm install && npm run build && cd ..  # Build React SPA
docker compose up -d   # Start on port 5000
```

### Local development

```bash
npm install
cd client && npm run dev  # Vite :5173 (proxies to :5000)
# In another terminal:
node server.js            # Express :5000
```

## Architecture

```
Cloudflare Tunnel → nginx :6969 → Docker container :5000
├── /api/*       → REST API (10 grouped route files)
├── /api/mcp/sse → MCP SSE endpoint (agent access)
├── /app         → React dashboard (12 pages)
├── /health      → Health check
└── SPA fallback → index.html for all non-API routes
```

### Layered Backend

```
Routes → Services → Repositories → DB (SQLite)
  ↓
Domain (pure business logic — no DB, no API calls)
  ↓
Scheduler (10 cron jobs wired to domain functions)
```

## Key Features

- **8 platform integrations** — Meta, Google, TikTok, LinkedIn, Twitter, Snapchat, Microsoft, Pinterest
- **Autonomous 24/7 optimization** — stoploss, scaling, dayparting, bid satpam
- **Telegram bot** — manage ads from chat (7 commands, 10 automated jobs)
- **AI-powered ad copy** — BerkahKarya 4-model framework (PAS, Gravitasi, Hasil x3, P2P)
- **Creative fatigue detection** — auto-detect declining performance, suggest rotation
- **Cross-platform unified reporting** — aggregate metrics across all platforms
- **AES-256-GCM credential encryption** — platform tokens encrypted at rest
- **Audit logging** — all mutations tracked in `audit_log` table
- **Helmet security headers** — X-Content-Type-Options, X-Frame-Options, HSTS
- **CSV export** — download campaign data via `GET /api/reports/export/csv`
- **Configurable thresholds** — all optimization constants via env vars with sensible defaults
- **MCP server** — 13 tools for AI agent access via SSE transport

## MCP Server (Agent Access)

AdForge exposes a Model Context Protocol server at `GET /api/mcp/sse` (requires JWT auth).

### Available Tools

| Tool | Description |
|------|-------------|
| `1ai-ads_list_campaigns` | List all campaigns with performance metrics |
| `1ai-ads_get_analytics` | Get analytics for a specific campaign |
| `1ai-ads_list_landing_pages` | List all landing pages |
| `1ai-ads_generate_ad_copy` | Generate ad copy using BerkahKarya framework |
| `1ai-ads_analyze_competitor` | Analyze competitor ad strategy |
| `1ai-ads_get_optimization_suggestions` | Get AI optimization suggestions |
| `1ai-ads_list_ads` | List all ads with creative details |
| `1ai-ads_create_campaign` | Create a new campaign |
| `1ai-ads_update_campaign` | Update campaign settings |
| `1ai-ads_get_profitability` | Calculate ROAS, profit, status |
| `1ai-ads_generate_landing_page` | AI-generate landing page HTML |
| `1ai-ads_score_creative` | Score a creative (0-100) |
| `1ai-ads_detect_fatigue` | Detect creative fatigue from history |

### Connect via MCP

```bash
# Using @modelcontextprotocol/sdk
npx @modelcontextprotocol/inspector http://localhost:5000/api/mcp/sse
```

## Scheduler Jobs (10 cron jobs)

| # | Job | Schedule | What it does |
|---|-----|----------|--------------|
| 1 | Campaign Monitor | Every 6h | Evaluates stoploss, scale eligibility, generates reports |
| 2 | Bid Satpam | Every 5m | Enforces bid caps (BID_SATPAM_MIN/MAX/TARGET) |
| 3 | Daily Dashboard | 07:00 WIB | Sends formatted daily report via Telegram |
| 4 | Token Health | Every 6h | Verifies Meta API tokens, alerts on expiry |
| 5 | Spend Guard | Every 5m | Compares spend to automation rules |
| 6 | Subscription Check | 09:00 WIB | Monitors payment expiry |
| 7 | Follow-up Engine | Every :30 | Flags WINNING campaigns not yet scaled |
| 8 | Meta Sync | Every 6h at :30 | Syncs remote campaigns to local DB |
| 9 | Daily Eval Guard | 01:00 WIB | Evaluates all active campaigns for underperformance |
| 10 | Auto-scale | Triggered | Runs when campaign monitor detects WINNING status |

## React Pages (12)

| Page | Route | Description |
|------|-------|-------------|
| Login | `/login` | Authentication (login + register) |
| Dashboard | `/app` | Command center with metrics cards + campaigns table |
| Campaigns | `/campaigns` | Campaign management (CRUD, activate, pause) |
| Creative Library | `/creative-library` | Save, organize, reuse best-performing creatives |
| Creative Fatigue | `/creative-fatigue` | Detect and refresh fatigued creatives |
| A/B Tests | `/ab-tests` | A/B test management with variant tracking |
| Reporting | `/reporting` | Unified cross-platform reporting + CSV export |
| Automation | `/automation` | CRUD automation rules with toggle |
| Competitors | `/competitors` | Competitor analysis dashboard |
| Attribution | `/attribution` | UTM-based conversion attribution |
| Widgets | `/widgets` | Dashboard widget configuration |
| Settings | `/settings` | Connected accounts, account info, sign out |

## Docker

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after code changes
docker compose up -d --build
```

- Auto-restarts on crash (`restart: unless-stopped`)
- Auto-starts on host reboot (Docker enabled via systemd)
- Healthcheck on `/health` every 30s
- Data persisted to `./data/` (SQLite), logs to `./logs/`

## Environment Variables

See `.env.example` for all 40+ configurable variables. Key groups:

- **Security:** `JWT_SECRET`, `ENCRYPTION_KEY`, `CSRF_SECRET`
- **Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- **Optimization:** `ROAS_SCALE_UP`, `ROAS_STOP_LOSS`, `CTR_MIN`, `CPC_MAX`, `BUDGET_LADDER`
- **Dayparting:** `DAYPARTING_PEAK_HOURS`, `DAYPARTING_PEAK_FACTOR`, `DAYPARTING_TIMEZONE`
- **Creative:** `CREATIVE_ROTATION_MEDIUM_DAYS`, `CREATIVE_ROTATION_PREVENTIVE_DAYS`
- **Bid Satpam:** `BID_SATPAM_MIN`, `BID_SATPAM_MAX`, `BID_SATPAM_TARGET`

All have sensible defaults. Nothing breaks if env vars are missing.

## Testing

```bash
npm test              # Unit tests (Vitest) — 1570 tests, 92 files
npm run test:e2e      # E2E tests (Playwright)
```

## License

MIT © 2026 AdForge Contributors
