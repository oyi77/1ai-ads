# 1ai-ads Production Runbook

> **Refreshed:** 2026-08-27. Corrects missing mandatory env (`ENCRYPTION_KEY`), wrong DB path, stale contacts, and adds CSRF + multi-tenant notes. AdForge is a **hosted multi-tenant SaaS** (`adforge.aitradepulse.com`), not single-instance.

## Quick Start
```bash
npm install
npm run build      # vite build → dist/
npm start          # node server.js  (port from PORT, default 5000)
```

## Environment Variables (verified from `.env` + `config/index.js`)
> Values are secrets — never commit. Listed names only.

### 🔴 MANDATORY (server refuses to start without these)
| Var | Notes |
|-----|-------|
| `JWT_SECRET` | 64+ char hex. `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | **64-char hex (32 bytes)**. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Token encryption throws if unset |
| `FB_APP_ID` / `FB_APP_SECRET` | Meta OAuth app 704618995979962 |
| `PAYMENT_GATEWAY` | `midtrans` (default) or `duitku` — plus gateway-specific keys |

### Required per integration (set what you connect)
| Var | For |
|-----|-----|
| `META_ACCESS_TOKEN`, `META_BUSINESS_ID`, `FB_SYSTEM_TOKEN`, `FB_WHATSAPP_TOKEN` | Meta/WhatsApp |
| `GOOGLE_ADS_DEVELOPER_TOKEN` (+ OAuth) | Google Ads |
| `TIKTOK_ACCESS_TOKEN` | TikTok |
| Gateway keys (`DUITKU_*`, `MIDTRANS_*`) | Payments (per `PAYMENT_GATEWAY`) |

### Optional / infra
| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | `5000` | Server port |
| `DB_PATH` | `./1ai-ads.db` | SQLite path (schema has 24 tables) |
| `NODE_ENV` | `development` | set `production` |
| `CORS_ORIGIN` | `http://localhost:5173` | **restrict to prod domain** |
| `PUBLIC_BASE_URL` | `https://adforge.aitradepulse.com` | used in links/callbacks |
| `WEB_APP_URL` | same | Mini App URL |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_HOST`, `TELEGRAM_CHAT_ID` | — | Telegram bot + alerts |
| `OMNIROUTE_URL` / `OMNIROUTE_MODEL` / `OMNIROUTE_API_KEY` | `http://localhost:20128/v1` | LLM router |
| `RESEND_API_KEY`, `SMTP_*` | — | Email alerts (verify berkahkarya.org domain) |
| `WEBHOOK_VERIFY_TOKEN`, `SOCIAL_SCORING_URL`, `LOG_LEVEL`, `ADMIN_PASSWORD` | — | misc |

## Deployment
```bash
npm install && npm run build
# PM2
pm2 start ecosystem.config.cjs
# systemd
sudo systemctl start 1ai-ads
```
Verify build: `ls dist/` (index.html + assets/).

## Health
```bash
curl http://localhost:5000/health          # {"status":"ok",...}
curl http://localhost:5000/api/cf-health   # Cloudflare check
```

## Rollback
```bash
pm2 stop 1ai-ads
git stash || git checkout <last-good-tag>
npm install && npm run build
# DB backup/restore
cp backups/1ai-ads.db.<timestamp>.backup "$DB_PATH"
pm2 start 1ai-ads
```
> Tip: tag releases (`git tag -a vX.Y -m ...`) so rollback targets a known-good commit, not blind `HEAD~1`.

## Database
- Auto-creates on first run (24 tables in `db/schema.sql`).
- Backup before deploy: `cp "$DB_PATH" backups/1ai-ads.db.$(date +%Y%m%d_%H%M%S).backup`
- Integrity: `sqlite3 "$DB_PATH" "PRAGMA integrity_check;"`

## Common Issues
- **Won't start** → `JWT_SECRET` / `ENCRYPTION_KEY` unset (config throws FATAL). Check `lsof -i :5000`.
- **500s** → `pm2 logs 1ai-ads`; check DB not corrupted.
- **Platform API errors** → verify tokens in Settings; check rate limits (Meta 5/s, Google 8/s in `platform-client.js`).
- **Frontend blank** → `npm run build`; verify `dist/`; `CORS_ORIGIN` matches domain.

## Monitoring
- Logs: `pm2 logs 1ai-ads --lines 100` · `tail -f logs/*.log` · `grep -i error logs/*.log`
- Metrics: 5xx rate, slow queries, DB size (`ls -lh "$DB_PATH"`).
- 11 Telegram bot cron jobs emit digest/alerts to owner chat.

## Security Checklist
- [ ] `JWT_SECRET` + `ENCRYPTION_KEY` set (64+ char)
- [ ] `NODE_ENV=production`
- [ ] HTTPS (reverse proxy / Cloudflare)
- [ ] Security headers (CSP set in `app.js`; verify HSTS/X-Frame-Options)
- [ ] CORS restricted to prod domain
- [ ] DB file perms `600`
- [ ] **CSRF middleware live (T1)** — POST without token → 403
- [ ] Tokens in env only, never in code

## Scaling
- Vertical: more RAM/CPU; SQLite fine for reads.
- Horizontal: `pm2 start ecosystem.config.cjs -i max`; for write-heavy, migrate PostgreSQL (`MIGRATION-POSTGRES.md`); Redis for cache/sessions (planned T5).

## Contacts
- **Owner / DevOps:** @codergaboets (Telegram)
- **Repo:** https://github.com/oyi77/1ai-ads
- **Escalation:** owner chat → Vilona autonomous operator (cron alerts to admin group)
