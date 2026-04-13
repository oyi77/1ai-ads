# AdForge CLI Adapter

Universal command-line interface for AdForge, powered by [OpenCLI](https://github.com/jackwener/opencli).

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
git clone https://github.com/your-repo/adforge
cd adforge/opencli-adapter

# Install dependencies
npm install

# Make CLI available globally
npm link
```

## Configuration

The CLI uses the AdForge API URL. Set it via:

```bash
# Option 1: Environment variable
export ADFORGE_CLI_API_URL=http://localhost:3001/api

# Option 2: Command line flag
adforge --api-url http://localhost:3001/api campaigns list
```

## Usage

```bash
# Authentication
adforge login --username <user> --password <pass>
adforge status

# Campaigns
adforge campaigns list                          List all campaigns
adforge campaigns get <id>                      Get campaign details
adforge campaigns create --name "Summer Sale" --platform meta --budget 100
adforge campaigns update <id> --status active --budget 150
adforge campaigns sync --platform meta           Sync Meta campaigns

# Ads Library
adforge ads search "running shoes" --platform meta
adforge ads search "fitness app" --platform google --limit 50
adforge ads search "makeup tutorial" --platform tiktok --country US

# Competitors
adforge competitors list                         List all competitors
adforge competitors add https://competitor.com --platform meta
adforge competitors add https://another.com --name "Brand X"
adforge competitors analyze <id> --platform all          Get detailed analysis
adforge competitors analyze <id> --strategy              Get strategy analysis
adforge competitors refresh                            Refresh all tracked competitors
adforge competitors remove https://competitor.com          Stop tracking

# Trending
adforge trending                                   Get internal + external trends
adforge trending --industry ecommerce --region US
adforge trending --source internal                Internal campaigns only
adforge trending --source external                 External market data only

# Analytics
adforge analytics --campaign <id> --platform meta     Get campaign analytics
adforge analytics performance <id> --platform meta   Get performance metrics
adforge analytics campaign <id> --days 30 --platform meta

# Accounts
adforge accounts list --platform meta                List connected accounts
adforge accounts connect --platform meta              Connect platform account
adforge accounts sync                                Sync all accounts
adforge accounts health --platform meta              Check account health

# Settings
adforge settings get                                  View user settings
adforge settings set --key llm_model --value gpt-4
adforge settings credentials                         Check API credential status

# Export
adforge export campaigns --format csv              Export campaigns to CSV
adforge export campaigns --file report.csv     Save to file
adforge reports type --campaign --format json   Generate campaign report
adforge reports type --competitor --platform all   Generate competitor report
```

## Output Formats

- `table` - Default, human-readable tables
- `json` - Machine-readable JSON
- `csv` - Spreadsheet-friendly CSV

## Examples

### Login and list campaigns
```bash
adforge login --username myuser --password mypass
adforge campaigns list
```

### Search ads library
```bash
# Search Meta ads library
adforge ads search "summer sale" --platform meta

# Search Google ads library
adforge ads search "software tools" --platform google

# Search TikTok ads library
adforge ads search "dance tutorial" --platform tiktok
```

### Competitor tracking
```bash
# Add a competitor
adforge competitors add https://example.com --name "Brand X"

# Get analysis
adforge competitors analyze abc123 --platform all

# Analyze strategy
adforge competitors strategy abc123 --platform meta
```

### Generate reports
```bash
# Export campaigns to CSV
adforge export campaigns --format csv > campaigns.csv

# Generate performance report
adforge reports type --campaign --format json
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

This is an OpenCLI adapter for AdForge. For the main OpenCLI project:
- https://github.com/jackwener/opencli
- Issues: https://github.com/jackwener/opencli/issues
