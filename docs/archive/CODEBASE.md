# CODEBASE.md — 1ai-ads
> Auto-generated codebase memory for AI agents. Last updated: 2026-06-19.

## Purpose
AI-powered autonomous advertising management system (AdForge). Automatically optimizes digital ad campaigns across Facebook, Google Ads, TikTok, and more — with 24/7 autonomous operation, intelligent budget allocation, rules-based optimization, and real-time monitoring. Includes a dashboard, ad generator, and multiple optimizer engines.

## Tech Stack
- **Backend**: Node.js (Express 5), SQLite (better-sqlite3), Python (campaign optimizers, patrol scripts)
- **Frontend**: Vite, vanilla HTML/CSS/JS (client dashboard), React (adforge-dashboard with Flask)
- **AI/LLM**: OmniRoute API integration, meta-ads-mcp SDK
- **Ad Platforms**: Meta Ads API, Google Ads, TikTok Ads, LinkedIn Ads, Pinterest, Snapchat, Twitter/X, Microsoft/Bing
- **Data**: Google BigQuery, JSONL state files
- **Testing**: Vitest (unit/integration/smoke/frontend/functional), Playwright (E2E), QA script
- **Ops**: PM2 (ecosystem), Docker Compose, Alibaba Cloud deployment (ECS, RDS, Redis, OSS, KMS)
- **Monitoring**: Telegram/WhatsApp alerts, watchdog scripts

## Entry Points
- **Server**: `server.js` — Express HTTP server
- **App**: `server/app.js` — Express app setup with routes, middleware, config
- **MCP**: `mcp.js` — Model Context Protocol server
- **CLI**: `1ai-ads-cli.js` — Command-line interface
- **Dashboard**: `adforge-dashboard/app.py` — Flask-based management dashboard
- **Generator**: `adforge-generator/server.js` — Ad creative generator service

## Directory Structure
| Directory | Purpose |
|-----------|---------|
| `server/` | Express backend: `app.js`, `routes/`, `services/`, `repositories/`, `config/`, `middleware/`, `lib/` |
| `server/routes/` | API route handlers |
| `server/services/` | Business logic services |
| `server/repositories/` | Data access layer |
| `client/` | Frontend dashboard (HTML/JS) |
| `adforge-dashboard/` | Flask dashboard: `app.py` (61KB), Facebook service, Shopee integration |
| `adforge-generator/` | Ad creative generator: Express server + HTML |
| `ads-optimizer/` | Campaign optimizer scripts (Python): monitor, spend tracking |
| `shopee-ads-optimizer/` | Shopee-specific ad optimization |
| `deriv_ads_optimizer/` | Deriv platform ad optimization |
| `autonomous/` | Autonomous operation docs and configs |
| `scripts/` | Automation scripts (250+): patrol, monitoring, Telegram bots, scaling, bidding |
| `ops/` | Operations: supervisor, watchdog, reporter, test runner |
| `db/` | Database: `schema.sql`, `seed.js`, `migrations/`, `backup.js` |
| `config/` | Targeting configs, Shopee cookies |
| `data/` | Runtime state: alerts, recommendations, campaign state (JSONL/JSON) |
| `tests/` | Test suites: unit, integration, smoke, frontend, functional, E2E |
| `docs/` | Architecture, API docs, SOPs, deployment guides, Alibaba Cloud docs |
| `deployment/` | Alibaba Cloud deployment config |
| `reports/` | Audit reports, daily reports, dashboard snapshots |
| `brain/` | AI voice config, deep dive analysis |
| `autonomy/` | Autonomous subsystems: watchdog, bugfinder, reporter |

## Key Files
| File | Purpose |
|------|---------|
| `server.js` | Express server entry point |
| `server/app.js` | Express app with routes and middleware (5.7KB) |
| `package.json` | Node.js dependencies and scripts |
| `mcp.js` | MCP server entry |
| `1ai-ads-cli.js` | CLI tool |
| `adforge-dashboard/app.py` | Flask dashboard (61KB) |
| `db/schema.sql` | SQLite database schema (10KB) |
| `db/seed.js` | Database seed data (12KB) |
| `docker-compose.yml` | Container orchestration |
| `.env.example` | Environment variable template (1.4KB) |
| `ecosystem.config.cjs` | PM2 process config |

## Architecture
```
Express Server (server.js)
    ├── server/routes/       REST API endpoints
    ├── server/services/     Business logic (campaigns, optimization, alerts)
    └── db/                  SQLite database + migrations

Flask Dashboard (adforge-dashboard/app.py)
    ├── Facebook service     Meta Ads API integration
    └── Shopee integration   Shopee BP service

Campaign Optimizers (Python)
    ├── ads-optimizer/       General campaign optimizer
    ├── shopee-ads-optimizer/ Shopee-specific
    └── deriv_ads_optimizer/  Deriv-specific

Autonomous System
    ├── scripts/             250+ patrol/monitoring scripts
    ├── ops/                 Supervisor + watchdog + reporter
    └── autonomy/            Watchdog, bugfinder, reporter configs
```
- **Autonomous Loop**: Runs every 5 minutes, checks campaigns, auto-executes optimizations, logs all decisions
- **Budget Rules**: ROAS-based scaling, daypart scheduling, pause on underperformance
- **Multi-Platform**: Facebook, Google, TikTok (primary); LinkedIn, Pinterest, Snapchat, Twitter, Bing (optional)
- **Alerts**: Telegram and WhatsApp notifications for critical events
- **Security**: JWT auth, rate limiting, RBAC, KMS encryption (Alibaba Cloud)

## Run Commands
```bash
# Install
npm install

# Development
npm run dev           # Vite dev server
node server.js        # Express API server

# Production
npm run build         # Vite production build
npm start             # node server.js

# MCP server
npm run mcp

# Tests
npm test              # Vitest
npm run test:unit     # Unit only
npm run test:e2e      # Playwright E2E
npm run test:qa       # QA script
npm run test:all      # All tests

# PM2
pm2 start ecosystem.config.cjs

# Docker
docker-compose up -d
```

## Environment Variables
| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default: 5000) |
| `JWT_SECRET` | JWT signing key (REQUIRED) |
| `DB_PATH` | SQLite database path (default: `./db/adforge.db`) |
| `OMNIROUTE_URL` | LLM API endpoint |
| `OMNIROUTE_MODEL` | LLM model identifier |
| `OMNIROUTE_API_KEY` | LLM API key |
| `META_ACCESS_TOKEN` | Meta/Facebook Ads API token |
| `FB_SYSTEM_TOKEN` | Facebook system user token |
| `GOOGLE_ADS_CREDENTIALS_PATH` | Google Ads service account JSON |
| `TIKTOK_ACCESS_TOKEN` | TikTok Ads API token |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn Ads token (optional) |
| `TELEGRAM_BOT_TOKEN` | Telegram alert bot |
| `TELEGRAM_ADMIN_ID` | Telegram admin user ID |
| `CORS_ORIGIN` | Allowed CORS origin |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (default: 60000) |
| `RATE_LIMIT_MAX` | Max requests per window (default: 100) |
