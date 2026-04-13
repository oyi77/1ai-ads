# AdForge OpenCLI Adapter - Installation Guide

## Quick Start (Simple Method)

The OpenCLI adapter uses `commander` which is already installed in AdForge. You can use it directly without additional installation.

### Step 1: Configure API URL

```bash
export ADFORGE_CLI_API_URL=http://localhost:3001/api
```

### Step 2: Use CLI Commands

```bash
# List campaigns
node -e "const adapter = require('./opencli-adapter/adapter.js'); adapter.listCampaigns()"'

# Search ads library  
node -e "const adapter = require('./opencli-adapter/adapter.js'); adapter.searchAdsLibrary({query: 'running shoes', platform: 'meta'})"

# Get trending
node -e "const adapter = require('./opencli-adapter/adapter.js'); adapter.getTrending()"
```

### Alternative: Create Standalone CLI Entry

If you want to run the CLI as a standalone tool without using the web app's commander framework, create this file in your project:

```javascript
#!/usr/bin/env node

const API_BASE = process.env.ADFORGE_CLI_API_URL || 'http://localhost:3001/api';

async function main() {
  const adapter = new AdForgeAdapter(API_BASE);
  const [command, ...args] = process.argv.slice(2);

  if (command === 'campaigns' && args[0] === 'list') {
    const campaigns = await adapter.listCampaigns();
    console.table(campaigns);
  } else if (command === 'ads' && args[0] === 'search') {
    const query = args[1];
    const result = await adapter.searchAdsLibrary({query});
    console.log(`Found ${result.count} ads`);
  }
}

main();
```

## Architecture Note

The adapter communicates with the existing AdForge REST API at `/api/*` endpoints. All features are already implemented in the web application - the CLI simply provides command-line access to them.

## All Commands Available

| Category | Command | Example |
|--------|----------|
| **Auth** | `login`, `status` |
| **Campaigns** | `campaigns list`, `campaigns get`, `campaigns create`, `campaigns update`, `campaigns sync` |
| **Ads** | `ads search`, `ads list` |
| **Competitors** | `competitors add`, `competitors list`, `competitors analyze` |
| **Trending** | `trending` |
| **Analytics** | `analytics --campaign` |
| **Accounts** | `accounts list`, `accounts connect`, `accounts sync` |

## Quick Test

```bash
# Test adapter import
node -e "console.log(require('./opencli-adapter/adapter.js'))"
```

## Documentation

See the comprehensive documentation at:
- `opencli-adapter/README.md` - Full feature documentation
- `opencli-adapter/USAGE.md` - Quick start guide
- `OPENCLI_IMPLEMENTATION.md` - Complete implementation summary
