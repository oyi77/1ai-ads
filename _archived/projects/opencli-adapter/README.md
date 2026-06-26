# 1ai-ads CLI Adapter

Universal command-line interface for 1ai-ads, powered by [OpenCLI](https://github.com/jackwener/opencli).

## Features

### Campaign Management
- Create, list, update, and sync campaigns across platforms
- Support for Meta (Facebook/Instagram), Google Ads, and TikTok Ads
- Campaign status tracking and performance metrics

### Ads Library
- **Multi-platform search** across Meta, Google, TikTok ads
- Search public ad libraries without API keys
- Access competitor ads from specific pages
- Support for multiple countries and platforms

### Competitor Spy
- Track multiple competitors simultaneously
- Real-time ad data capture and analysis
- Platform-specific metrics (impressions, clicks, CTR, spend)
- Strategy analysis and bidding pattern detection
- Free monitoring using public data sources

### Trending & Analytics
- Internal trending from your campaigns
- External market trends comparison
- Performance insights and reporting
- Keyword and topic discovery

### Account Management
- Connect and manage multiple platform accounts
- Health checks and status monitoring
- OAuth flow for Google Ads

### Export & Reporting
- Export campaigns and analytics to CSV
- Generate performance reports
- Save reports to files

## Installation

```bash
# Clone or download this repository
git clone https://github.com/your-repo/1ai-ads
cd 1ai-ads/opencli-adapter

# Install dependencies
npm install

# Make CLI available globally
npm link
```

## Configuration

The CLI uses the 1ai-ads API URL. Set it via:

```bash
# Option 1: Environment variable
export ADFORGE_CLI_API_URL=http://localhost:3001/api

# Option 2: Command line flag
1ai-ads --api-url http://localhost:3001/api campaigns list
```

## Usage

```bash
# Authentication
1ai-ads login --username <user> --password <pass>
1ai-ads status

# Campaigns
1ai-ads campaigns list                          List all campaigns
1ai-ads campaigns get <id>                      Get campaign details
1ai-ads campaigns create --name "Summer Sale" --platform meta --budget 100
1ai-ads campaigns update <id> --status active --budget 150
1ai-ads campaigns sync --platform meta           Sync Meta campaigns

# Ads Library
1ai-ads ads search "running shoes" --platform meta
1ai-ads ads search "fitness app" --platform google --limit 50
1ai-ads ads search "makeup tutorial" --platform tiktok --country US

# Competitors
1ai-ads competitors list                         List all competitors
1ai-ads competitors add https://competitor.com --platform meta
1ai-ads competitors add https://another.com --name "Brand X"
1ai-ads competitors analyze <id> --platform all          Get detailed analysis
1ai-ads competitors analyze <id> --strategy              Get strategy analysis
1ai-ads competitors refresh                            Refresh all tracked competitors
1ai-ads competitors remove https://competitor.com          Stop tracking

# Trending
1ai-ads trending                                   Get internal + external trends
1ai-ads trending --industry ecommerce --region US
1ai-ads trending --source internal                Internal campaigns only
1ai-ads trending --source external                 External market data only

# Analytics
1ai-ads analytics --campaign <id> --platform meta     Get campaign analytics
1ai-ads analytics performance <id> --platform meta   Get performance metrics
1ai-ads analytics campaign <id> --days 30 --platform meta

# Accounts
1ai-ads accounts list --platform meta                List connected accounts
1ai-ads accounts connect --platform meta              Connect platform account
1ai-ads accounts sync                                Sync all accounts
1ai-ads accounts health --platform meta              Check account health

# Settings
1ai-ads settings get                                  View user settings
1ai-ads settings set --key llm_model --value gpt-4
1ai-ads settings credentials                         Check API credential status

# Export
1ai-ads export campaigns --format csv              Export campaigns to CSV
1ai-ads export campaigns --file report.csv     Save to file
1ai-ads reports type --campaign --format json   Generate campaign report
1ai-ads reports type --competitor --platform all   Generate competitor report
```

## Output Formats

- `table` - Default, human-readable tables
- `json` - Machine-readable JSON
- `csv` - Spreadsheet-friendly CSV

## Examples

### Login and list campaigns
```bash
1ai-ads login --username myuser --password mypass
1ai-ads campaigns list
```

### Search ads library
```bash
# Search Meta ads library
1ai-ads ads search "summer sale" --platform meta

# Search Google ads library
1ai-ads ads search "software tools" --platform google

# Search TikTok ads library
1ai-ads ads search "dance tutorial" --platform tiktok
```

### Competitor tracking
```bash
# Add a competitor
1ai-ads competitors add https://example.com --name "Brand X"

# Get analysis
1ai-ads competitors analyze abc123 --platform all

# Analyze strategy
1ai-ads competitors strategy abc123 --platform meta
```

### Generate reports
```bash
# Export campaigns to CSV
1ai-ads export campaigns --format csv > campaigns.csv

# Generate performance report
1ai-ads reports type --campaign --format json
```

## Features Explained

### Free Research
- **Ads Library Search**: Uses Meta Ad Library API - no API key required for basic search
- **Competitor Pages**: Search and browse competitor pages from Meta
- **Trending**: Internal trends come from your own campaigns, external from configured APIs

### Multi-Platform Support
- Meta, Google, TikTok platforms all supported
- Switch platforms using `--platform` flag
- Sync campaigns and accounts across all connected platforms

## License

MIT License - Free for personal and commercial use

## Contributing

This is an OpenCLI adapter for 1ai-ads. For the main OpenCLI project:
- https://github.com/jackwener/opencli
- Issues: https://github.com/jackwener/opencli/issues
