# Adspirer MCP Integration Plan

**Target**: [adspirer.com](https://www.adspirer.com)  
**Date**: 2026-04-10  
**Scope**: AdForge web app backend + Claude Code AI assistant layer

---

## What Adspirer Is

Adspirer is a **Model Context Protocol (MCP) server** that bridges AI assistants to advertising platforms. It is NOT a REST API.

| Fact | Value |
|------|-------|
| MCP endpoint | `https://mcp.adspirer.com/mcp` |
| Transport | HTTP Streamable (not stdio) |
| Auth | OAuth 2.1 with PKCE — no API keys, browser redirect flow |
| Access tokens | 1-hour validity, auto-refreshed |
| Refresh tokens | 30-day validity |
| Tool count | 130+ tools across Google Ads (40+), Meta (36), LinkedIn (30+), TikTok (31) + audit/automation |

---

## Requirements Summary

### Functional Requirements
- FR-1: AdForge users can initiate OAuth 2.1 PKCE flow to connect their Adspirer account
- FR-2: Access tokens stored per-user in `platform_accounts` table (`platform = 'adspirer'`)
- FR-3: AdForge backend can call any Adspirer tool on behalf of an authenticated user
- FR-4: Token refresh happens automatically on 401 responses
- FR-5: AdForge campaign data syncs with Adspirer (list, create, analyze campaigns)
- FR-6: Claude Code AI assistant can use all 130+ Adspirer tools directly (separate layer)

### Non-Functional Requirements
- NFR-1: All write tools (campaign creation, budget changes) require explicit user confirmation before execution
- NFR-2: OAuth PKCE state parameter validated on callback to prevent CSRF
- NFR-3: Tokens stored with `expires_at` timestamp, never logged in plaintext
- NFR-4: Graceful degradation when Adspirer not connected (feature disabled, not error)

---

## Acceptance Criteria

1. `GET /api/adspirer/status` returns `{ connected: false }` when no token exists for the user
2. `GET /api/adspirer/auth` redirects to Adspirer OAuth authorization URL containing `code_challenge` and `state` params
3. `GET /api/adspirer/auth/callback?code=X&state=Y` exchanges code for tokens, stores in `platform_accounts`, redirects to `/settings#adspirer`
4. `GET /api/adspirer/status` returns `{ connected: true, platforms: [...] }` after successful OAuth
5. `POST /api/adspirer/tools/get_connections_status` returns Adspirer tool result for authenticated user
6. `POST /api/adspirer/tools/list_campaigns` proxies `list_campaigns` tool to Adspirer and returns results
7. Expired access token (mock `expires_at` in past) triggers refresh and retries the tool call
8. `POST /api/adspirer/disconnect` removes `platform_accounts` row and returns `{ success: true }`
9. `npm test` passes 674/674 (no regressions)
10. `claude mcp add --transport http adspirer https://mcp.adspirer.com/mcp` enables all 130+ tools in Claude Code

---

## Architecture

```
AdForge Frontend
      │
      ▼
server/routes/adspirer.js   ◄── OAuth callback, tool proxy endpoints
      │
      ▼
server/services/adspirer-mcp-client.js   ◄── NEW: HTTP MCP client (StreamableHTTPClientTransport)
      │                                         Token refresh, tool call wrapper
      ▼
platform_accounts table  ◄── stores { access_token, refresh_token, expires_at }
      │
      ▼
https://mcp.adspirer.com/mcp  ◄── Adspirer MCP server (130+ tools)
      │
      ▼
Google Ads / Meta / LinkedIn / TikTok
```

**Separate layer — Claude Code AI assistant:**
```
~/.config/claude/mcp.json
  "adspirer": { transport: "http", url: "https://mcp.adspirer.com/mcp" }
      │
      ▼
130+ mcp__claude_ai_Adspirer__* tools available in all Claude sessions
```

---

## Implementation Steps

### Step 1 — Install HTTP transport dependency

File: `package.json`

Check if `@modelcontextprotocol/sdk` version supports `StreamableHTTPClientTransport`. Current install uses `StdioClientTransport` in `server/services/mcp-client.js`. The HTTP transport ships in `@modelcontextprotocol/sdk >= 1.0.0`.

```bash
npm install @modelcontextprotocol/sdk@latest
```

Acceptance: `node -e "import('@modelcontextprotocol/sdk/client/streamableHttp.js')"` resolves without error.

---

### Step 2 — Create Adspirer MCP HTTP client service

**New file**: `server/services/adspirer-mcp-client.js`

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('adspirer-mcp-client');
const MCP_URL = 'https://mcp.adspirer.com/mcp';

export class AdspirerMcpClient {
  constructor(platformAccountsRepo) {
    this.platformAccountsRepo = platformAccountsRepo;
    this._clients = new Map(); // userId → { client, transport }
  }

  /**
   * Get or create an authenticated MCP client for a user.
   * Auto-refreshes access token if expired.
   */
  async _getClient(userId) {
    const account = this.platformAccountsRepo.findActiveByUserAndPlatform(userId, 'adspirer');
    if (!account) throw new Error('Adspirer not connected. Visit Settings to connect.');

    const creds = JSON.parse(account.credentials);
    if (Date.now() > new Date(creds.expires_at).getTime()) {
      await this._refreshToken(userId, account, creds);
      return this._getClient(userId); // retry with fresh token
    }

    const cached = this._clients.get(userId);
    if (cached) return cached.client;

    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: {
        headers: { Authorization: `Bearer ${creds.access_token}` },
      },
    });
    const client = new Client({ name: 'adforge-backend', version: '1.0.0' }, { capabilities: { tools: {} } });
    await client.connect(transport);
    this._clients.set(userId, { client, transport });
    return client;
  }

  async callTool(userId, toolName, args = {}) {
    const client = await this._getClient(userId);
    log.info('Calling Adspirer tool', { userId, toolName });
    const result = await client.callTool({ name: toolName, arguments: args });
    const text = result.content?.[0]?.text;
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
  }

  async listTools(userId) {
    const client = await this._getClient(userId);
    const result = await client.request({ method: 'tools/list', params: {} }, { type: 'object' });
    return result.tools || [];
  }

  async disconnect(userId) {
    const cached = this._clients.get(userId);
    if (cached?.client) await cached.client.close().catch(() => {});
    this._clients.delete(userId);
  }

  async _refreshToken(userId, account, creds) {
    // POST to Adspirer OAuth token endpoint with refresh_token grant
    const resp = await fetch('https://mcp.adspirer.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: creds.refresh_token,
        client_id: process.env.ADSPIRER_CLIENT_ID || '',
      }),
    });
    if (!resp.ok) throw new Error(`Token refresh failed: ${resp.status}`);
    const tokens = await resp.json();
    const updatedCreds = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || creds.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    };
    this.platformAccountsRepo.update(account.id, { credentials: JSON.stringify(updatedCreds) });
    this._clients.delete(userId); // force reconnect with new token
    log.info('Adspirer token refreshed', { userId });
  }
}
```

---

### Step 3 — OAuth 2.1 PKCE flow + tool proxy routes

**New file**: `server/routes/adspirer.js`

```javascript
import { Router } from 'express';
import crypto from 'crypto';

export function createAdspirerRouter(adspirerClient, platformAccountsRepo) {
  const router = Router();

  const CLIENT_ID = process.env.ADSPIRER_CLIENT_ID || '';
  const REDIRECT_URI = process.env.ADSPIRER_REDIRECT_URI || 'http://localhost:5173/api/adspirer/auth/callback';
  const AUTH_URL = 'https://mcp.adspirer.com/oauth/authorize';
  const TOKEN_URL = 'https://mcp.adspirer.com/oauth/token';

  // In-memory PKCE state store (keyed by state param, TTL 10min)
  const pkceStore = new Map();

  // GET /api/adspirer/status
  router.get('/status', async (req, res) => {
    try {
      const account = platformAccountsRepo.findActiveByUserAndPlatform(req.user.id, 'adspirer');
      if (!account) return res.json({ success: true, data: { connected: false } });
      const tools = await adspirerClient.listTools(req.user.id).catch(() => []);
      res.json({ success: true, data: { connected: true, toolCount: tools.length } });
    } catch (err) {
      res.json({ success: true, data: { connected: false, error: err.message } });
    }
  });

  // GET /api/adspirer/auth  — initiate OAuth PKCE
  router.get('/auth', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    pkceStore.set(state, { verifier, userId: req.user.id, at: Date.now() });
    setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000); // expire in 10min

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'ads:read ads:write',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    res.redirect(`${AUTH_URL}?${params}`);
  });

  // GET /api/adspirer/auth/callback
  router.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/settings#adspirer-error=${error}`);

    const pkce = pkceStore.get(state);
    if (!pkce) return res.status(400).json({ success: false, error: 'Invalid or expired state' });
    pkceStore.delete(state);

    try {
      const resp = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          code_verifier: pkce.verifier,
        }),
      });
      if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
      const tokens = await resp.json();

      const credentials = JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      });

      // Upsert into platform_accounts
      const existing = platformAccountsRepo.findActiveByUserAndPlatform(pkce.userId, 'adspirer');
      if (existing) {
        platformAccountsRepo.update(existing.id, { credentials, health_status: 'ok', last_error: null });
      } else {
        platformAccountsRepo.create({ user_id: pkce.userId, platform: 'adspirer', account_name: 'Adspirer', credentials });
      }

      res.redirect('/settings#adspirer-connected');
    } catch (err) {
      res.redirect(`/settings#adspirer-error=${encodeURIComponent(err.message)}`);
    }
  });

  // POST /api/adspirer/tools/:toolName  — proxy any tool call
  router.post('/tools/:toolName', async (req, res) => {
    try {
      const result = await adspirerClient.callTool(req.user.id, req.params.toolName, req.body || {});
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(err.message?.includes('not connected') ? 401 : 500)
        .json({ success: false, error: err.message });
    }
  });

  // GET /api/adspirer/tools  — list available tools
  router.get('/tools', async (req, res) => {
    try {
      const tools = await adspirerClient.listTools(req.user.id);
      res.json({ success: true, data: tools });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/adspirer/disconnect
  router.post('/disconnect', async (req, res) => {
    try {
      await adspirerClient.disconnect(req.user.id);
      const account = platformAccountsRepo.findActiveByUserAndPlatform(req.user.id, 'adspirer');
      if (account) platformAccountsRepo.remove(account.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
```

---

### Step 4 — Wire into server/app.js

File: `server/app.js`

Add after existing service/repo initialization:

```javascript
// Adspirer MCP client
import { AdspirerMcpClient } from './services/adspirer-mcp-client.js';
import { createAdspirerRouter } from './routes/adspirer.js';

const adspirerClient = new AdspirerMcpClient(platformAccountsRepo);
app.use('/api/adspirer', authMiddleware, createAdspirerRouter(adspirerClient, platformAccountsRepo));
```

---

### Step 5 — PlatformAccountsRepo helpers

File: `server/repositories/platform-accounts.js` (new or extend existing)

Required methods used by the router and client:
- `findActiveByUserAndPlatform(userId, platform)` → row or null
- `create({ user_id, platform, account_name, credentials })` → id
- `update(id, { credentials, health_status, last_error })` → updated row
- `remove(id)` → boolean

Verify against `platform_accounts` schema in `db/schema.sql`:
```sql
CREATE TABLE platform_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_name TEXT NOT NULL,
  credentials TEXT NOT NULL,  -- JSON: { access_token, refresh_token, expires_at }
  is_active BOOLEAN DEFAULT 1,
  health_status TEXT DEFAULT 'ok',
  last_error TEXT,
  ...
```

Schema supports `adspirer` platform with no changes needed.

---

### Step 6 — Claude Code direct integration (AI layer)

This is a one-command setup, independent of the web app integration:

```bash
claude mcp add --transport http adspirer https://mcp.adspirer.com/mcp
```

This makes all 130+ `mcp__claude_ai_Adspirer__*` tools available in every Claude Code session for AI-assisted ad management. Auth is handled by Adspirer's OAuth flow when first tool is called.

**Note**: The `mcp__claude_ai_Adspirer__*` tools are already registered as deferred tools in the current Claude Code session, meaning Adspirer is already connected at the Claude Code level.

---

### Step 7 — Environment variables

Add to `.env.example`:
```
ADSPIRER_CLIENT_ID=
ADSPIRER_REDIRECT_URI=http://localhost:5173/api/adspirer/auth/callback
```

Note: Adspirer's OAuth 2.1 PKCE flow may not require `client_secret` (public client). Verify with Adspirer docs or support.

---

### Step 8 — Frontend settings UI

File: `client/src/app.js` or a new `client/src/views/settings.js`

Add "Connect Adspirer" section to Settings page:
- If `GET /api/adspirer/status` returns `connected: false`: show "Connect" button → `href="/api/adspirer/auth"`
- If `connected: true`: show platform list, tool count, "Disconnect" button
- Handle `#adspirer-connected` and `#adspirer-error=*` hash params on page load

---

## Tool Categories for AdForge Feature Mapping

| AdForge Feature | Adspirer Tools |
|-----------------|----------------|
| Campaign overview | `list_campaigns`, `get_campaign_performance` (per platform) |
| Analytics dashboard | `get_meta_campaign_performance`, `get_campaign_performance`, `get_tiktok_campaign_performance` |
| Ad creation | `create_meta_image_campaign`, `create_search_campaign`, `create_tiktok_campaign` |
| Competitor spy | `analyze_wasted_spend`, `detect_meta_creative_fatigue` |
| Trending intel | `research_keywords`, `analyze_search_terms`, `search_meta_targeting` |
| Automation | `create_monitor`, `schedule_brief`, `generate_report_now` |
| Health check | `get_connections_status`, `audit_conversion_tracking`, `get_usage_status` |

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| OAuth token endpoint URL differs from assumed | HIGH — no public docs confirmed | Check Adspirer docs/support; adapter tries `/oauth/token` on MCP host first |
| `StreamableHTTPClientTransport` API changed in SDK version | MEDIUM | Pin SDK version; test transport init in unit test |
| PKCE in-memory state lost on server restart | LOW-MEDIUM | Add `state` TTL check; worst case user retries auth |
| Write tools triggering spend without confirmation | LOW — Adspirer creates campaigns paused | All write tool calls log warning; implement frontend confirmation modal for write tools |
| Adspirer plan limits (tool calls) | MEDIUM | `get_usage_status` tool checked on connect; surface remaining quota in status endpoint |
| `client_id` required but not exposed publicly | MEDIUM | Requires Adspirer account signup; document in `ADSPIRER_CLIENT_ID` env var |

---

## Verification Steps

1. `npm install` — no peer dependency errors
2. `node -e "import('@modelcontextprotocol/sdk/client/streamableHttp.js').then(m => console.log(Object.keys(m)))"` — confirms `StreamableHTTPClientTransport` export
3. Unit test: `AdspirerMcpClient.callTool` with mocked `StreamableHTTPClientTransport` and expired token → `_refreshToken` called → tool retried
4. Integration test: `GET /api/adspirer/status` with no `platform_accounts` row → `{ connected: false }`
5. Integration test: `GET /api/adspirer/auth` → 302 redirect with `code_challenge` and `state` in URL
6. Integration test: `POST /api/adspirer/tools/get_connections_status` with no auth → 401
7. Manual: `claude mcp add --transport http adspirer https://mcp.adspirer.com/mcp` → `/adspirer:setup` → browser OAuth → tools respond
8. `npm test` → 674/674 pass

---

## Files Changed

| File | Action |
|------|--------|
| `server/services/adspirer-mcp-client.js` | CREATE — HTTP MCP client with OAuth token management |
| `server/routes/adspirer.js` | CREATE — OAuth PKCE endpoints + tool proxy |
| `server/repositories/platform-accounts.js` | CREATE or EXTEND — CRUD for platform_accounts |
| `server/app.js` | MODIFY — wire AdspirerMcpClient + router |
| `package.json` | MODIFY — bump `@modelcontextprotocol/sdk` if needed |
| `.env.example` | MODIFY — add `ADSPIRER_CLIENT_ID`, `ADSPIRER_REDIRECT_URI` |
| `tests/unit/services/adspirer-mcp-client.test.js` | CREATE — unit tests |
| `tests/integration/adspirer.test.js` | CREATE — integration tests |

**No schema changes needed** — `platform_accounts` table already supports `adspirer` as a platform value.

---

## ADR — Architecture Decision Record

**Decision**: Integrate Adspirer via HTTP MCP client in the AdForge backend, not via REST API adapter.

**Drivers**:
1. Adspirer exposes 130+ tools via MCP, not a REST API — no alternative transport
2. OAuth 2.1 PKCE is required; cannot be bypassed with API keys
3. AdForge already ships `@modelcontextprotocol/sdk` for its own MCP server

**Alternatives considered**:
- *REST API wrapper*: Not viable — Adspirer has no public REST API, only MCP
- *Browser-side MCP calls*: Not viable — OAuth tokens must stay server-side; CORS would block direct browser calls to `mcp.adspirer.com`
- *Proxy via Claude Code tools*: Not viable for web app users — Claude Code tools are only available in AI assistant sessions, not in AdForge's Express backend

**Why chosen**: HTTP MCP client matches the actual protocol; reuses existing `@modelcontextprotocol/sdk`; keeps tokens server-side; follows AdForge's existing per-user platform_accounts credential pattern.

**Consequences**:
- +All 130+ Adspirer tools available to AdForge via single `/api/adspirer/tools/:toolName` proxy endpoint
- +No new external dependencies beyond SDK version bump
- −OAuth client registration with Adspirer required (need `ADSPIRER_CLIENT_ID`)
- −Token refresh logic adds complexity; must be tested carefully

**Follow-ups**:
- Confirm OAuth token endpoint URL with Adspirer support (`https://mcp.adspirer.com/oauth/token` is assumed)
- Confirm whether Adspirer uses public client (no client_secret) for PKCE
- Consider rate-limit middleware on `/api/adspirer/tools/*` to avoid hitting Adspirer plan quotas
