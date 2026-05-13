# 1ai-ads CLI Adapter - Quick Start Guide

## Installation & Setup

```bash
cd opencli-adapter
npm install

# Configure API URL
export ADFORGE_CLI_API_URL=http://localhost:3001/api

# Test CLI
node index.js --help
```

## Quick Commands

```bash
# Test authentication (will prompt for credentials)
1ai-ads login --username admin --password admin123

# List campaigns
1ai-ads campaigns list

# Search ads library (free, no API key needed!)
1ai-ads ads search "running shoes" --platform meta

# Get trending data
1ai-ads trending --source internal
```

## What You Can Do

### Campaign Management
```bash
# Create a campaign
1ai-ads campaigns create --platform meta --name "Summer Sale" --objective conversions --budget 100

# Sync all platforms
1ai-ads campaigns sync
```

### Ads Library Search
```bash
# Meta ads
1ai-ads ads search "fitness app" --platform meta

# Google ads
1ai-ads ads search "software tools" --platform google

# TikTok ads
1ai-ads ads search "dance tutorial" --platform tiktok
```

### Competitor Tracking
```bash
# Add competitor
1ai-ads competitors add https://example.com --name "Brand X"

# Get analysis
1ai-ads competitors analyze <id> --platform all

# Refresh all
1ai-ads competitors refresh
```

### Trending
```bash
# Get both internal and external
1ai-ads trending

# Internal only
1ai-ads trending --source internal
```

## Export & Reporting

```bash
# Export campaigns to CSV
1ai-ads export campaigns --format csv > campaigns.csv
```

## Key Features

✅ **Multi-platform support** - Meta, Google, TikTok all work together
✅ **Ads Library Search** - Free search using public ad libraries
✅ **Competitor Spy** - Real-time monitoring with Similarweb API integration
✅ **No API keys required** - Basic features work without configuration
✅ **Universal CLI** - Works on Linux, macOS, Windows
✅ **Full 1ai-ads API** - All web features accessible via CLI

## Getting Help

```bash
# See all available commands
1ai-ads --help

# See details for a specific command
1ai-ads campaigns --help
1ai-ads ads --help
```

## Architecture

The CLI adapter uses the existing 1ai-ads REST API to provide full functionality. No need to rebuild or modify the web application - all features are already there!

## License

MIT License - Free for personal and commercial use
