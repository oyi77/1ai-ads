# 1ai-ads Production Runbook

## Quick Start

```bash
npm install
npm run build
npm start
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | Server port |
| `DB_PATH` | No | `./db/adforge.db` | SQLite database path |
| `JWT_SECRET` | **YES** | — | Secret for JWT signing. Generate: `openssl rand -hex 32` |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin |
| `NODE_ENV` | No | `development` | Set to `production` for prod |
| `META_ACCESS_TOKEN` | No | — | Meta/Facebook Ads API token |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | No | — | Google Ads API developer token |
| `GOOGLE_ADS_OAUTH_TOKEN` | No | — | Google Ads OAuth access token |
| `TIKTOK_ACCESS_TOKEN` | No | — | TikTok Ads API token |
| `OMNIROUTE_URL` | No | `http://localhost:20128/v1/chat/completions` | LLM endpoint |
| `OMNIROUTE_MODEL` | No | `auto/pro-fast` | LLM model |
| `OMNIROUTE_API_KEY` | No | — | LLM API key |

## Deployment Steps

### 1. Build
```bash
npm install
npm run build
```

### 2. Verify Build
```bash
ls -la dist/
# Should contain index.html and assets/
```

### 3. Database
```bash
# Database auto-creates on first run
# Verify: ls -la db/adforge.db
```

### 4. Start Server
```bash
# Development
npm start

# Production (with PM2)
pm2 start ecosystem.config.cjs

# Production (with systemd)
sudo systemctl start 1ai-ads
```

### 5. Health Check
```bash
curl http://localhost:5000/health
# Expected: {"status":"ok","timestamp":"..."}
```

## Rollback Procedure

### Quick Rollback
```bash
# 1. Stop server
pm2 stop 1ai-ads

# 2. Restore database backup
cp backups/adforge.db.backup db/adforge.db

# 3. Restore previous code
git checkout HEAD~1
npm install
npm run build

# 4. Restart
pm2 start 1ai-ads
```

### Database Backup
```bash
# Before deploy
cp db/adforge.db backups/adforge.db.$(date +%Y%m%d_%H%M%S).backup

# Restore
cp backups/adforge.db.YYYYMMDD_HHMMSS.backup db/adforge.db
```

## Common Issues

### Server won't start
- Check `JWT_SECRET` is set
- Check port is not in use: `lsof -i :5000`
- Check database file permissions: `ls -la db/`

### API returns 500
- Check logs: `pm2 logs 1ai-ads` or `tail -f logs/`
- Check database is not corrupted: `sqlite3 db/adforge.db "PRAGMA integrity_check;"`

### Meta/Google/TikTok API errors
- Check credentials in Settings page
- Verify API tokens are not expired
- Check rate limits (Meta: ~200/hr, Google: varies, TikTok: 1500/hr)

### Frontend not loading
- Run `npm run build` to rebuild
- Check `dist/` directory exists
- Verify `CORS_ORIGIN` matches your domain

## Monitoring

### Health Endpoints
- `GET /health` — Server health
- `GET /api/cf-health` — Cloudflare health check

### Key Metrics
- Response time: Check logs for slow queries
- Error rate: Monitor 5xx responses
- Database size: `ls -lh db/adforge.db`

### Logs
```bash
# PM2 logs
pm2 logs 1ai-ads --lines 100

# Application logs
tail -f logs/*.log

# Error logs
grep -i error logs/*.log | tail -20
```

## Security Checklist

- [ ] `JWT_SECRET` is set and secure (64+ chars)
- [ ] `NODE_ENV=production` in production
- [ ] HTTPS enabled (reverse proxy or load balancer)
- [ ] Security headers verified (X-Content-Type-Options, X-Frame-Options, HSTS)
- [ ] CORS origin restricted to production domain
- [ ] Database file permissions restricted (600)
- [ ] API tokens stored securely (not in code)

## Scaling

### Vertical Scaling
- Increase server RAM/CPU
- SQLite handles concurrent reads well
- For write-heavy workloads, consider PostgreSQL migration

### Horizontal Scaling
- Use PM2 cluster mode: `pm2 start ecosystem.config.cjs -i max`
- Share database via network filesystem or migrate to PostgreSQL
- Use Redis for session/cache sharing

## Contacts

- **DevOps**: [Your team]
- **On-call**: [Your rotation]
- **Escalation**: [Your escalation path]
