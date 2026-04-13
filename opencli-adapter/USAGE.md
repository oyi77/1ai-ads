# AdForge CLI Adapter - Quick Start Guide

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
adforge login --username admin --password admin123

# List campaigns
adforge campaigns list

# Search ads library (free, no API key needed!)
adforge ads search "running shoes" --platform meta

# Get trending data
adforge trending --source internal
```

## What You Can Do

### Campaign Management
```bash
# Create a campaign
adforge campaigns create --platform meta --name "Summer Sale" --objective conversions --budget 100

# Sync all platforms
adforge campaigns sync
```

### Ads Library Search
```bash
# Meta ads
adforge ads search "fitness app" --platform meta

# Google ads
adforge ads search "software tools" --platform google

# TikTok ads
adforge ads search "dance tutorial" --platform tiktok
```

### Competitor Tracking
```bash
# Add competitor
adforge competitors add https://example.com --name "Brand X"

# Get analysis
adforge competitors analyze <id> --platform all

# Refresh all
adforge competitors refresh
```

### Trending
```bash
# Get both internal and external
adforge trending

# Internal only
adforge trending --source internal
```

## Export & Reporting

```bash
# Export campaigns to CSV
adforge export campaigns --format csv > campaigns.csv
```

## Key Features

✅ **Multi-platform support** - Meta, Google, TikTok all work together
✅ **Ads Library Search** - Free search using public ad libraries
✅ **Competitor Spy** - Real-time monitoring with Similarweb API integration
✅ **No API keys required** - Basic features work without configuration
✅ **Universal CLI** - Works on Linux, macOS, Windows
✅ **Full AdForge API** - All web features accessible via CLI

## Getting Help

```bash
# See all available commands
adforge --help

# See details for a specific command
adforge campaigns --help
adforge ads --help
```

## Architecture

The CLI adapter uses the existing AdForge REST API to provide full functionality. No need to rebuild or modify the web application - all features are already there!

## License

MIT License - Free for personal and commercial use
