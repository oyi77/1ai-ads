"""
Central configuration for all ad automation scripts.

Eliminates hardcoded API versions, account IDs, and thresholds
across 40+ scripts. Import from scripts/lib/config.py instead of
hardcoding values.

Usage:
    from scripts.lib.config import get_config
    cfg = get_config('1041')  # or '0858', '1134', 'glowscent', etc.
    print(cfg.api_version)    # 'v22.0'
    print(cfg.hard_cap)      # 300000
    print(cfg.account_id)    # 'act_380721031313330'
"""

import json
import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
CONFIGS_DIR = Path(__file__).resolve().parent.parent / 'configs'

# ─── API Configuration ────────────────────────────────────────

META_API_VERSION = os.environ.get('META_API_VERSION', 'v22.0')
META_API_BASE = f'https://graph.facebook.com/{META_API_VERSION}'

# ─── Account Registry ────────────────────────────────────────
# Single source of truth for account IDs.
# Scripts should reference accounts by nickname, not by raw ID.

ACCOUNTS: Dict[str, dict] = {
    '1041': {
        'id': 'act_380721031313330',
        'name': '1041',
        'currency': 'IDR',
        'timezone': 'Asia/Jakarta',
    },
    '0858': {
        'id': 'act_435670549443081',
        'name': '0858_Vilona',
        'currency': 'IDR',
        'timezone': 'Asia/Jakarta',
    },
    '1134': {
        'id': 'act_1773760133153789',
        'name': '1134_Malaysia',
        'currency': 'MYR',
        'timezone': 'Asia/Kuala_Lumpur',
    },
    'glowscent': {
        'id': 'act_2125021885010866',
        'name': 'Glowscent_681',
        'currency': 'IDR',
        'timezone': 'Asia/Jakarta',
    },
    '1208': {
        'id': 'act_1439536310038458',
        'name': '1208',
        'currency': 'IDR',
        'timezone': 'Asia/Jakarta',
    },
}

# ─── Default Thresholds ──────────────────────────────────────
# Per-account threshold overrides go in configs/<account>.json

DEFAULT_THRESHOLDS = {
    'hard_cap': 300_000,        # IDR — max daily spend
    'cpc_kill': 150,            # IDR — CPC above this triggers pause
    'cpc_warn': 100,            # IDR — CPC above this triggers warning
    'ctr_min': 3.0,             # % — CTR below this triggers review
    'roas_min': 1.0,            # minimum acceptable ROAS
    'scale_up_pct': 20,         # % — budget increase on positive signals
    'scale_down_pct': 15,        # % — budget decrease on negative signals
    'check_interval_min': 15,    # minutes between checks
}

# ─── Threshold Profiles ──────────────────────────────────────
# Per-account overrides that differ from defaults

THRESHOLD_PROFILES = {
    '1041': {
        'hard_cap': 300_000,
        'cpc_kill': 150,
        'ctr_min': 3.0,
        'scale_up_pct': 20,
    },
    '0858': {
        'hard_cap': 300_000,
        'cpc_kill': 130,
        'ctr_min': 3.0,
        'scale_up_pct': 20,
    },
    '1134': {
        'hard_cap': 400_000,
        'cpc_kill': 500,
        'ctr_min': 3.0,
        'scale_up_pct': 20,
    },
    'glowscent': {
        'hard_cap': 300_000,
        'cpc_kill': 200,
        'ctr_min': 3.0,
        'scale_up_pct': 20,
    },
}


@dataclass
class AccountConfig:
    """Resolved configuration for a specific account."""
    account_key: str
    account_id: str
    account_name: str
    currency: str
    timezone: str
    api_version: str
    api_base: str
    hard_cap: float
    cpc_kill: float
    cpc_warn: float
    ctr_min: float
    roas_min: float
    scale_up_pct: float
    scale_down_pct: float
    check_interval_min: int
    extra: dict = field(default_factory=dict)


def get_config(account_key: str) -> AccountConfig:
    """
    Get resolved configuration for an account.

    Resolution order:
    1. configs/<account_key>.json (file override)
    2. THRESHOLD_PROFILES[account_key] (hardcoded profile)
    3. DEFAULT_THRESHOLDS (defaults)
    4. ACCOUNTS[account_key] for account ID/name
    """
    if account_key not in ACCOUNTS:
        raise ValueError(
            f'Unknown account key: {account_key}. '
            f'Valid keys: {", ".join(ACCOUNTS.keys())}'
        )

    acct = ACCOUNTS[account_key]
    profile = THRESHOLD_PROFILES.get(account_key, {})

    # Load file override if exists
    file_config = {}
    config_path = CONFIGS_DIR / f'{account_key}.json'
    if config_path.is_file():
        try:
            file_config = json.loads(config_path.read_text(encoding='utf-8'))
        except (json.JSONDecodeError, OSError):
            pass

    # Merge: file > profile > defaults
    merged = {**DEFAULT_THRESHOLDS, **profile, **file_config}

    return AccountConfig(
        account_key=account_key,
        account_id=acct['id'],
        account_name=acct['name'],
        currency=acct.get('currency', 'IDR'),
        timezone=acct.get('timezone', 'Asia/Jakarta'),
        api_version=META_API_VERSION,
        api_base=META_API_BASE,
        hard_cap=merged['hard_cap'],
        cpc_kill=merged['cpc_kill'],
        cpc_warn=merged['cpc_warn'],
        ctr_min=merged['ctr_min'],
        roas_min=merged['roas_min'],
        scale_up_pct=merged['scale_up_pct'],
        scale_down_pct=merged['scale_down_pct'],
        check_interval_min=merged['check_interval_min'],
        extra=file_config,  # any extra keys from file
    )


def list_accounts():
    """Return list of all available account keys."""
    return list(ACCOUNTS.keys())


def get_account_id(account_key: str) -> str:
    """Quick lookup: account key → Meta ad account ID."""
    return ACCOUNTS[account_key]['id']