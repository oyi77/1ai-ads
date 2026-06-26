---
name: meta-ads-engine
description: How to use vilona_trakpro_engine for all Meta Ads operations in 1ai-ads
version: 1.0
---

# Meta Ads Engine Skill

> **The ONLY way to do Meta Ads operations in 1ai-ads scripts.**

## When to Use This Skill
- Creating/reading/updating/deleting Meta Ads campaigns, adsets, ads
- Fetching insights (spend, ROAS, CPC, CTR)
- Token management for Meta API
- Account configuration (0858, 1041, 1208, 1134, 1340)
- Any script in `scripts/` that touches Meta API

## Engine Location
`scripts/vilona_trakpro_engine.py` — single source of truth.

## Imports (Always)

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from vilona_trakpro_engine import (
    ACCESS_TOKEN,    # String token
    API,             # "https://graph.facebook.com/v22.0"
    ACCOUNTS,        # Dict of account configs
    fb_get,          # GET helper with retry
    fb_post,         # POST helper with retry
    log,             # Structured logging
    WORKSPACE,       # Path to workspace root
    DATA_DIR,        # Path to data/ directory
)
```

## Account Configs

```python
# Engine has these accounts pre-configured:
ACCOUNTS = {
    "0858": {"id": "act_435670549443081", "name": "Kakriput"},
    "1041": {"id": "act_380721031313330", "name": "Nyamiresep"},
    "1208": {"id": "act_1439536310038458", "name": "Herbal"},
    "1134": {"id": "act_2125021885010866", "name": "Glowscent"},
    "1340": {"id": "act_1181078009580337", "name": "Selow"},
}

# Usage:
account_id = ACCOUNTS["1041"]["id"]
```

## API Helpers (Use These, Not `requests`)

### GET Request
```python
# Basic
campaigns = fb_get(f"{account_id}/campaigns", fields="id,name,status", limit="200")

# With filtering
camps = fb_get(
    f"{account_id}/campaigns",
    fields="id,name,status,effective_status",
    filtering=json.dumps([{
        "field": "effective_status",
        "operator": "IN",
        "value": ["ACTIVE", "IN_PROCESS"]
    }]),
    limit="200"
)
```

### POST Request
```python
# Create campaign
result = fb_post(
    f"{account_id}/campaigns",
    name=camp_name,
    objective="OUTCOME_TRAFFIC",
    status="PAUSED",
    special_ad_categories=json.dumps([]),
    is_adset_budget_sharing_enabled="false",
)

new_id = result.get("id")
```

### Insights (Time-Range)
```python
insights = fb_get(
    f"{account_id}/insights",
    fields="spend,impressions,clicks,ctr,cpc,actions",
    time_range=json.dumps({"since": "2026-06-09", "until": "2026-06-10"}),
    level="campaign",
    limit="200",
)
```

## Token Management (DON'T Reimplement)

The engine handles token loading in this order:
1. `/tmp/fb_token.txt` (if exists)
2. `META_ACCESS_TOKEN` env var
3. `ACCESS_TOKEN` env var

**Just import `ACCESS_TOKEN` — don't reimplement.**

```python
from vilona_trakpro_engine import ACCESS_TOKEN
# Token is already loaded and validated
```

## Paths (DON'T Hardcode)

```python
from vilona_trakpro_engine import WORKSPACE, DATA_DIR

# ✅ Use these
report_path = DATA_DIR / "brain" / "report.json"
log_file = WORKSPACE / "logs" / "engine.log"

# ❌ Never do this
report_path = Path("/home/openclaw/projects/1ai-ads/data/brain/report.json")
```

## Logging

```python
from vilona_trakpro_engine import log

log("Processing started", "INFO")
log(f"Found {len(campaigns)} campaigns", "INFO")
log("API rate limit hit", "WARNING")
log(f"Failed: {error}", "ERROR")
```

## Common Patterns

### Patrol Campaigns (Read + Decide + Act)
```python
# 1. Fetch active campaigns
camps = fb_get(
    f"{account_id}/campaigns",
    fields="id,name,status,effective_status,created_time",
    filtering=json.dumps([{
        "field": "effective_status",
        "operator": "IN",
        "value": ["ACTIVE"]
    }]),
)

# 2. Fetch insights for each
for camp in camps.get("data", []):
    insights = fb_get(
        f"{camp['id']}/insights",
        fields="spend,impressions,clicks,ctr,cpc",
        time_range=json.dumps({"since": "2026-06-03", "until": "2026-06-10"}),
    )
    # ... decide and act
```

### Create Scale Clone
```python
# Use engine's create_scale_clone helper
from vilona_trakpro_engine import create_scale_clone

result = create_scale_clone(
    account_id=ACCOUNTS["1041"]["id"],
    source_campaign_id=original_id,
    audience="IbuRumah",
    taglink="rakdapur3",
    daily_budget=500000,
    status="PAUSED",
)
```

### Pause Campaign
```python
result = fb_post(campaign_id, status="PAUSED")
if result.get("success"):
    log(f"Paused {name}", "INFO")
```

## Forbidden in Scripts

```python
# ❌ NEVER do these:
import requests
requests.get("https://graph.facebook.com/...")

import os
os.getenv("META_ACCESS_TOKEN")

from pathlib import Path
Path("/home/openclaw/projects/1ai-ads/...")

# ❌ Don't duplicate engine logic
# If you need something not in engine, ADD IT to the engine first
```

## Adding New Engine Functionality

If you need a new Meta API operation:
1. **Add to `vilona_trakpro_engine.py`** as a function
2. **Export it** in the imports
3. **Use it from your script** via import

This keeps the engine as the single source of truth.

## Reference Scripts (Good Examples)

| Script | Purpose |
|--------|---------|
| `vilona_trakpro_engine.py` | Engine itself |
| `auto_clone_winners.py` | Clone winners across accounts |
| `glowscent_681_engine.py` | Per-account engine pattern |
| `analyze_shopee.py` | Data analysis pattern |

## Quick Checklist

- [ ] Import from `vilona_trakpro_engine` (not `requests`/`os`)
- [ ] Use `fb_get`/`fb_post` (not raw HTTP)
- [ ] Use `WORKSPACE`/`DATA_DIR` (not hardcoded paths)
- [ ] Use `log()` (not `print()`)
- [ ] Use `ACCOUNTS["0858"]["id"]` (not hardcoded `act_...`)

**Violations = immediate rewrite.**