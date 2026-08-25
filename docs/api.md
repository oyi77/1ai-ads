# AdForge API Reference

All endpoints are prefixed with `/api`. Protected endpoints require `Authorization: Bearer <jwt>` header.

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | Public | Register user |
| POST | `/api/auth/login` | Public | Login, returns JWT + refresh token |
| POST | `/api/auth/refresh-token` | Public | Refresh JWT |
| POST | `/api/auth/logout` | Public | Revoke refresh token |

## Campaigns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List campaigns |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id` | Get campaign |
| PUT | `/api/campaigns/:id` | Update campaign |
| DELETE | `/api/campaigns/:id` | Delete campaign |
| POST | `/api/campaigns/:id/activate` | Activate campaign |
| POST | `/api/campaigns/:id/pause` | Pause campaign |

## Meta/Facebook Ads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/meta/accounts` | List ad accounts |
| GET | `/api/meta/campaigns` | List campaigns |
| POST | `/api/meta/sync` | Sync all Meta data |
| GET | `/api/meta/content/video-status` | Video upload status |

## Google Ads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/google-ads/accounts` | List accounts |
| GET | `/api/google-ads/accounts/:id/campaigns` | List campaigns |
| GET | `/api/google-ads/accounts/:id/performance` | Performance data |
| POST | `/api/google-ads/accounts/:id/campaigns` | Create campaign |
| PATCH | `/api/google-ads/campaigns/:id` | Update campaign |
| POST | `/api/google-ads/sync` | Sync all Google data |

## TikTok Ads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tiktok-ads/accounts` | List advertisers |
| GET | `/api/tiktok-ads/accounts/:id/campaigns` | List campaigns |
| GET | `/api/tiktok-ads/accounts/:id/insights` | Performance data |
| POST | `/api/tiktok-ads/accounts/:id/campaigns` | Create campaign |
| PATCH | `/api/tiktok-ads/campaigns/:id` | Update campaign |
| POST | `/api/tiktok-ads/sync` | Sync all TikTok data |

## LinkedIn Ads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/linkedin-ads/status` | Connection status |
| GET | `/api/linkedin-ads/accounts` | List ad accounts |
| GET | `/api/linkedin-ads/accounts/:id/campaigns` | List campaigns |
| GET | `/api/linkedin-ads/accounts/:id/analytics` | Analytics data |
| POST | `/api/linkedin-ads/accounts/:id/campaigns` | Create campaign |
| PATCH | `/api/linkedin-ads/campaigns/:id` | Update campaign |
| POST | `/api/linkedin-ads/sync` | Sync all LinkedIn data |

## Pinterest Ads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pinterest-ads/status` | Connection status |
| GET | `/api/pinterest-ads/accounts` | List ad accounts |
| GET | `/api/pinterest-ads/accounts/:id/campaigns` | List campaigns |
| GET | `/api/pinterest-ads/accounts/:id/analytics` | Analytics data |
| POST | `/api/pinterest-ads/accounts/:id/campaigns` | Create campaign |
| PATCH | `/api/pinterest-ads/campaigns/:id` | Update campaign |
| POST | `/api/pinterest-ads/sync` | Sync all Pinterest data |

## Snapchat Ads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/snapchat-ads/status` | Connection status |
| GET | `/api/snapchat-ads/organizations` | List organizations |
| GET | `/api/snapchat-ads/accounts` | List ad accounts |
| GET | `/api/snapchat-ads/accounts/:id/campaigns` | List campaigns |
| GET | `/api/snapchat-ads/accounts/:id/campaigns/:cid/stats` | Campaign stats |
| POST | `/api/snapchat-ads/accounts/:id/campaigns` | Create campaign |
| PUT | `/api/snapchat-ads/accounts/:id/campaigns/:cid` | Update campaign |
| POST | `/api/snapchat-ads/sync` | Sync all Snapchat data |

## Twitter/X Ads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/twitter-ads/status` | Connection status |
| GET | `/api/twitter-ads/accounts` | List ad accounts |
| GET | `/api/twitter-ads/accounts/:id/campaigns` | List campaigns |
| GET | `/api/twitter-ads/accounts/:id/stats` | Account stats |
| POST | `/api/twitter-ads/accounts/:id/campaigns` | Create campaign |
| PUT | `/api/twitter-ads/accounts/:id/campaigns/:cid` | Update campaign |
| POST | `/api/twitter-ads/sync` | Sync all Twitter data |

## Microsoft/Bing Ads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/microsoft-ads/status` | Connection status |
| GET | `/api/microsoft-ads/accounts` | List accounts |
| GET | `/api/microsoft-ads/accounts/:id/campaigns` | List campaigns |
| GET | `/api/microsoft-ads/accounts/:id/performance` | Performance data |
| POST | `/api/microsoft-ads/accounts/:id/campaigns` | Create campaign |
| PATCH | `/api/microsoft-ads/accounts/:id/campaigns/:cid` | Update campaign |
| POST | `/api/microsoft-ads/sync` | Sync all Microsoft data |

## Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get all settings |
| PUT | `/api/settings` | Update settings |
| GET | `/api/settings/accounts` | List connected accounts |
| POST | `/api/settings/accounts` | Add platform account |
| POST | `/api/settings/accounts/test` | Test account credentials |
| POST | `/api/settings/accounts/activate` | Set active account |
| DELETE | `/api/settings/accounts` | Remove account |


## MCP (Model Context Protocol)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/mcp/sse` | Protected | SSE connection for MCP client |
| POST | `/api/mcp/messages` | Protected | Send MCP message |
| GET | `/api/mcp/status` | Protected | MCP server status |
| POST | `/api/mcp/connect` | Protected | Connect to platform MCP |
| POST | `/api/mcp/disconnect` | Protected | Disconnect platform MCP |
| GET | `/api/mcp/tools/:platform` | Protected | List platform tools |
| POST | `/api/mcp/call` | Protected | Call MCP tool |

## Reporting & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reporting/unified` | Cross-platform unified report |
| GET | `/api/reporting/widgets` | Dashboard widgets config |
| GET | `/api/analytics` | Campaign analytics |
| GET | `/api/reports/export/csv` | Download campaign data as CSV |
| GET | `/api/attribution/summary` | Attribution summary |
| GET | `/api/attribution/matches` | Conversion attribution matches |

## Creative

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/creative/library` | List saved creatives |
| POST | `/api/creative/library` | Save creative |
| GET | `/api/creative/library/top` | Top performing creatives (scoped to user) |
| PUT | `/api/creative/library/:id` | Update creative |
| DELETE | `/api/creative/library/:id` | Delete creative |
| POST | `/api/creative/library/:id/use` | Record creative usage (increments times_used) |
| GET | `/api/creative/fatigue/detect/:id` | Detect creative fatigue |
| POST | `/api/creative/generate` | Generate ad copies (AI) |
| POST | `/api/creative/score` | Score creative quality |

## Automation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/automation/rules` | List automation rules |
| POST | `/api/automation/rules` | Create rule |
| PUT | `/api/automation/rules/:id` | Update rule |
| DELETE | `/api/automation/rules/:id` | Delete rule |

## A/B Tests

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ab-tests` | List A/B tests |
| POST | `/api/ab-tests` | Create test |
| PUT | `/api/ab-tests/:id` | Update test |

## Competitor Spy

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/competitor-spy/insights` | Get competitor insights |
| POST | `/api/competitor-spy/analyze` | Analyze competitor |

## Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | Public | Health check (`{"status":"ok"}`) |

## Response Format

All endpoints return:
```json
{ "success": true, "data": { ... } }
// or
{ "success": false, "error": "message" }
```

## Rate Limits

- Public endpoints: 100 requests per 15 minutes
- Protected endpoints: unlimited (JWT required)
