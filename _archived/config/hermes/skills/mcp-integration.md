---
name: mcp-integration
description: How to integrate external APIs via MCP (Model Context Protocol) in 1ai-ads
version: 1.0
---

# MCP Integration Skill

> **All external API integrations go through MCP servers.**

## When to Use This Skill
- Integrating with Meta Ads Library
- Integrating with Google Ads API
- Integrating with TikTok Ads API
- Web scraping for competitor analysis
- Any third-party API that needs isolation

## MCP Server Locations

| Server | Path | Purpose |
|--------|------|---------|
| Main MCP | `mcp.js` | Exposes internal services as MCP tools |
| Ads Library | `server/services/ads-library/*-adapter.js` | Multi-platform ads search |
| Competitor Spy | `server/services/competitor-spy.js` | Track competitor strategies |
| Web Scraper | `server/services/web-scraper/*-scraper.js` | General web scraping |

## Main MCP Server (`mcp.js`)

Exposes internal services as MCP tools:

```javascript
// mcp.js
import { create1aiAdsMCPServer } from './server/services/mcp-server.js';

const server = create1aiAdsMCPServer(repos, services);
await server.connect(transport);
```

**Available tools (13+):**
- Campaign management
- Ad generation
- Creative studio
- AI agent
- Competitor spy
- Auto-optimizer
- LLM client
- Content bridge
- Social bridge

## Ads Library Adapter Pattern

```javascript
// server/services/ads-library/base-adapter.js
export class BaseAdsAdapter {
  async searchAds(query) {
    throw new Error('Not implemented');
  }

  async getAdDetails(adId) {
    throw new Error('Not implemented');
  }
}
```

```javascript
// server/services/ads-library/meta-adapter.js
import { BaseAdsAdapter } from './base-adapter.js';

export class MetaAdsLibraryAdapter extends BaseAdsAdapter {
  constructor({ mcpClient }) {
    super();
    this.mcpClient = mcpClient;
  }

  async searchAds(query) {
    // Use MCP client, NOT direct API calls
    return this.mcpClient.call('meta_ads_library', 'search', {
      query,
      country: 'ID',
      adType: 'ALL',
    });
  }

  async getAdDetails(adId) {
    return this.mcpClient.call('meta_ads_library', 'details', { adId });
  }
}
```

## Web Scraper Pattern

```javascript
// server/services/web-scraper/base-scraper.js
export class BaseScraper {
  async scrape(url) {
    throw new Error('Not implemented');
  }

  async extract(html, selectors) {
    throw new Error('Not implemented');
  }
}
```

```javascript
// server/services/web-scraper/google-scraper.js
import { BaseScraper } from './base-scraper.js';

export class GoogleScraper extends BaseScraper {
  constructor({ mcpClient }) {
    super();
    this.mcpClient = mcpClient;
  }

  async scrape(url) {
    return this.mcpClient.call('web_scraper', 'scrape', {
      url,
      renderJs: true,
    });
  }
}
```

## When to Use MCP vs Direct API

| Use Case | Approach |
|----------|----------|
| Meta Ads management (campaigns/adsets/ads) | `vilona_trakpro_engine` (NOT MCP) |
| Meta Ads Library (search/competitor research) | MCP adapter |
| Google Ads API | MCP adapter |
| TikTok Ads API | MCP adapter |
| Web scraping | MCP web_scraper |
| Internal services (campaign monitor, etc.) | Direct service call |

## MCP Client Usage

```javascript
// server/services/mcp-client.js
export class MCPClient {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  async call(server, tool, params) {
    // Standardized MCP call
    const response = await fetch(`${this.endpoint}/${server}/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return response.json();
  }
}
```

## Adding a New MCP Adapter

1. **Create adapter** in `server/services/<category>/<platform>-adapter.js`
2. **Extend base class** (`BaseAdsAdapter`, `BaseScraper`, etc.)
3. **Inject MCPClient** in constructor
4. **Use `mcpClient.call()`** — never direct HTTP
5. **Register in factory** (`server/app/services.js`)

## MCP Configuration

```json
// opencode.json / .hermes/config.json
{
  "mcp": {
    "1ai-hub": {
      "type": "remote",
      "url": "http://localhost:9099/mcp",
      "enabled": true
    },
    "cf-router": {
      "type": "local",
      "command": ["/home/openclaw/.local/bin/cloudflare-router", "mcp"],
      "enabled": true
    }
  }
}
```

## Forbidden Patterns

```javascript
// ❌ NEVER direct external API calls in scripts/services
import axios from 'axios';
const result = await axios.get('https://graph.facebook.com/...');

// ❌ NEVER scrape without MCP
import cheerio from 'cheerio';
const html = await fetch(url);
const $ = cheerio.load(html);

// ✅ ALWAYS use MCP adapters
const result = await mcpClient.call('meta_ads_library', 'search', { query });
const html = await mcpClient.call('web_scraper', 'scrape', { url });
```

## Reference Files

| Component | File |
|-----------|------|
| Main MCP | `mcp.js` |
| MCP Server | `server/services/mcp-server.js` |
| MCP Client | `server/services/mcp-client.js` |
| Ads Library Base | `server/services/ads-library/base-adapter.js` |
| Meta Adapter | `server/services/ads-library/meta-adapter.js` |
| Scraper Base | `server/services/web-scraper/base-scraper.js` |

## Quick Checklist

When integrating an external API:
- [ ] Use MCP adapter (not direct API)
- [ ] Extend base class
- [ ] Inject MCPClient
- [ ] Register in factory
- [ ] Add to MCP server tools
- [ ] Write tests with mock MCPClient

**Violations = immediate rewrite.**