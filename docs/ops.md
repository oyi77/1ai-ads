# AdForge Operations Guide

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values (JWT_SECRET required)

# Development
npm run dev          # Vite dev server (frontend)
npm start            # Express server (port 5000)

# Production build
npm run build        # Build frontend to dist/
NODE_ENV=production npm start
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5000` | Server port |
| `JWT_SECRET` | **Yes** | — | JWT signing secret |
| `DB_PATH` | No | `./db/1ai-ads.db` | SQLite database path |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin |
| `FB_SYSTEM_TOKEN` | No | — | Meta/Facebook system user token |
| `GOOGLE_ADS_CREDENTIALS_PATH` | No | — | Google Ads service account JSON |
| `TIKTOK_ACCESS_TOKEN` | No | — | TikTok Ads API token |
| `LINKEDIN_ACCESS_TOKEN` | No | — | LinkedIn Marketing API token |
| `LINKEDIN_CLIENT_ID` | No | — | LinkedIn OAuth client ID |
| `LINKEDIN_CLIENT_SECRET` | No | — | LinkedIn OAuth client secret |
| `PINTEREST_ACCESS_TOKEN` | No | — | Pinterest Marketing API token |
| `SNAPCHAT_ACCESS_TOKEN` | No | — | Snapchat Marketing API token |
| `SNAPCHAT_REFRESH_TOKEN` | No | — | Snapchat refresh token |
| `TWITTER_ACCESS_TOKEN` | No | — | Twitter/X Ads API token |
| `MICROSOFT_ACCESS_TOKEN` | No | — | Microsoft Ads OAuth token |
| `MICROSOFT_DEVELOPER_TOKEN` | No | — | Microsoft Ads developer token |
| `MICROSOFT_CUSTOMER_ID` | No | — | Microsoft Ads customer ID |

## Database

SQLite database at `DB_PATH`. Migrations run automatically on startup.

```bash
# Manual backup
cp db/1ai-ads.db backups/$(date +%Y-%m-%d).backup

# Backup script runs automatically on startup
# Backups stored in ./backups/
```

## PM2 Production Deployment

```bash
# Start with PM2
pm2 start ecosystem.config.cjs

# Monitor
pm2 status
pm2 logs 1ai-ads

# Restart
pm2 restart 1ai-ads
```

## Testing

```bash
npm test              # All unit + integration tests
npm run test:unit     # Unit tests only
npm run test:smoke    # Smoke tests (app boot)
npm run test:e2e      # Playwright E2E tests
```

## Health Check

```bash
curl http://localhost:5000/api/trending
# 200 = healthy (public endpoint, no auth)
```

## Platform Integration Setup

Each ad platform requires API credentials:

1. **Meta/Facebook**: Create app at developers.facebook.com, get system user token
2. **Google Ads**: Set up Google Ads API credentials, download service account JSON
3. **TikTok**: Create app at business-api.tiktok.com, get access token
4. **LinkedIn**: Create app at linkedin.com/developers, OAuth 2.0 flow
5. **Pinterest**: Create app at developers.pinterest.com, OAuth 2.0 flow
6. **Snapchat**: Create app at marketingapi.snapchat.com, OAuth 2.0 flow
7. **Twitter/X**: Create app at developer.twitter.com, get bearer token
8. **Microsoft**: Register at ads.microsoft.com, OAuth 2.0 + developer token

Add credentials via Settings > Connected Accounts in the dashboard, or set environment variables directly.

## Rollback

```bash
# Restore database backup
cp backups/<timestamp>.backup db/1ai-ads.db

# Revert code
git checkout <previous-commit>

# Restart
pm2 restart 1ai-ads
```

## Monitoring

- Server logs: `pm2 logs` or `./logs/` directory
- Database size: check `db/1ai-ads.db` file size
- Test health: `npm test` should pass 1056+ tests
