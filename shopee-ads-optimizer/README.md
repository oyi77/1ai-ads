# Shopee Ads Optimizer

Autonomous FB Ads campaign optimization tools for Shopee affiliate campaigns.

## Scripts

| Script | Purpose |
|--------|---------|
| `campaign_optimizer.py` | Analyze Shopee commission + click CSVs, calculate ROI per tag, recommend INCREASE/MAINTAIN/REDUCE/STOP |
| `monitor_0858.py` | FB Ads account 0858 monitor -- auto-pause zero-conversion campaigns, activate profitable ones |
| `spend_monitor_1041.py` | FB Ads account 1041 spend governor -- daily hard cap, peak hours resume, settlement rate checks |

## Requirements

Python 3.8+ (stdlib only -- no pip dependencies).

## Configuration

All scripts read FB tokens from environment variables. Set these before running:

```bash
# Per-account tokens (preferred)
export FB_ACCESS_TOKEN_0858="EAAK..."
export FB_ACCESS_TOKEN_1041="EAAK..."

# Fallback if per-account not set
export META_ACCESS_TOKEN="EAAK..."
```

Optional overrides:

```bash
# Spend governor thresholds (defaults shown)
export DAILY_HARD_CAP=200000
export WARNING_AT=150000
export AUTO_RESUME_AT=100000

# Paths (defaults shown)
export OPTIMIZER_BASE_DIR="/home/openclaw/.openclaw/workspace"
export MONITOR_LOG_DIR="/home/openclaw/.openclaw/workspace/logs/ads_0858_monitor.log"
export GOVERNOR_LOG_DIR="/home/openclaw/.openclaw/workspace/logs/ads_1041_spend_monitor.log"
export GOVERNOR_STATE_FILE="/tmp/ads_1041_governor_state.json"
```

## Usage

```bash
# Campaign ROI analysis from Shopee CSVs
python3 campaign_optimizer.py 1041 commission.csv clicks.csv

# One-shot checks
python3 monitor_0858.py
python3 spend_monitor_1041.py

# Daemon mode (continuous monitoring, 5 min interval)
python3 monitor_0858.py --daemon
python3 spend_monitor_1041.py --daemon
```

## Cron Example

```cron
*/5 * * * * cd /path/to/shopee-ads-optimizer && python3 spend_monitor_1041.py
*/5 * * * * cd /path/to/shopee-ads-optimizer && python3 monitor_0858.py
```

## Relationship to 1ai-ads

This is a standalone Python module within the 1ai-ads monorepo. It complements the Node.js backend (`scripts/auto_check_0858.py` handles bid cap/CTR/placement checks; this module handles spend governance and ROI optimization).
