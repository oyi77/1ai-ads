# AdForge Operations Guide

> **Refreshed:** 2026-08-28. Corrects DB path, health-check endpoint, and test count (verified: **1867 tests pass**). AdForge is a hosted multi-tenant SaaS (`adforge.aitradepulse.com`).

## Quick Start
```bash
npm install
npm run build        # vite → dist/
npm start            # node server.js  (port 5000)
# Dev (frontend HMR only):
npm run dev          # vite dev server
```

## Environment Variables (see RUNBOOK.md for full list — JWT_SECRET + ENCRYPTION_KEY mandatory)
| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `JWT_SECRET` | **Yes** | — | 64+ hex; server refuses start without it |
| `ENCRYPTION_KEY` | **Yes** | — | 64-char hex; token encryption throws if unset |
| `PORT` | No | `5000` | |
| `DB_PATH` | No | `./db/1ai-ads.db` | **active DB** (root `1ai-ads.db` is a 0-byte artifact — ignore) |
| `CORS_ORIGIN` | No | `http://localhost:5173` | restrict to prod domain |
| `FB_SYSTEM_TOKEN`, `META_*` | No | — | Meta integration |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | No | — | Google |
| `TIKTOK_ACCESS_TOKEN` | No | — | TikTok |
| `PAYMENT_GATEWAY` | No | `midtrans` | `midtrans` | `duitku` |
| (LinkedIn/Pinterest/Snapchat/Twitter/Microsoft tokens) | No | — | per-platform |

## Database
SQLite at `$DB_PATH` (default `./db/1ai-ads.db`, **~1MB active**). 24 tables, migrations auto-run on startup.
```bash
cp "$DB_PATH" "backups/1ai-ads.db.$(date +%Y%m%d_%H%M%S).backup"
```
> A backup script runs on startup; backups in `./backups/`. (Note: `db/backup.js` writes `adforge.db.*` — align naming if scripting.)

## PM2 / Docker
```bash
pm2 start ecosystem.config.cjs        # fork mode, 512M cap, daily 04:00 restart
pm2 logs 1ai-ads
# Docker
docker compose up -d                   # :5000, volume ./data:/app/data, DB_PATH=/app/data/1ai-ads.db
```

## Testing (verified: **1867 passed**)
```bash
npm test                # all (unit + integration + smoke + functional + frontend)
npm run test:unit
npm run test:smoke      # app boot
npm run test:e2e        # Playwright
```

## Health Check
```bash
curl http://localhost:5000/health              # {"status":"ok"}
curl http://localhost:5000/api/cf-health       # Cloudflare
```
> `/api/trending` is NOT a health endpoint (it's a feature route) — use `/health`.

## Platform Setup
Per-platform credentials added via **Settings → Connected Accounts** in dashboard (preferred) or env vars. See `architecture.md` (22 adapters) + `META_APP_REVIEW.md` for Meta scope/approval.

## Rollback
```bash
cp backups/1ai-ads.db.<ts> "$DB_PATH"
git checkout <prev-tag> && npm install && npm run build
pm2 restart 1ai-ads
```

## Monitoring
- Logs: `pm2 logs 1ai-ads` · `tail -f logs/*.log` · `grep -i error logs/*.log`
- DB size: `ls -lh "$DB_PATH"`
- Bot cron: 11 jobs in `server/bot/scheduler.js` emit Telegram digests/alerts.

## Security
- `JWT_SECRET` + `ENCRYPTION_KEY` set (64+ char)
- `NODE_ENV=production`, HTTPS via Cloudflare
- CSRF middleware live (T1) — POST without token → 403
- CORS restricted to prod domain; DB file perms 600
