"""
Shared Meta Ads API helpers — canonical module.

Scripts should import from this module instead of re-implementing
token loading, API calls, and account configuration.

Usage:
    from meta_shared import get_token, api_get, api_post, get_config
    cfg = get_config('1041')
    token = get_token()
    data = api_get(token, f'{cfg.account_id}/campaigns')
"""

import os
import requests
import json
from datetime import datetime
from pathlib import Path

# ─── Canonical imports from lib ────────────────────────────────
from lib.credentials import get_meta_token, CredentialError
from lib.config import (
    get_config,
    META_API_VERSION,
    META_API_BASE,
    ACCOUNTS,
    list_accounts,
    get_account_id,
)

# ─── Logging ──────────────────────────────────────────────────

_log_file = None

def _ensure_log():
    """Lazy init for log file."""
    global _log_file
    if _log_file is None:
        log_dir = Path(__file__).resolve().parent.parent / 'data'
        log_dir.mkdir(exist_ok=True)
        _log_file = log_dir / 'meta_shared.log'
    return _log_file

def log(msg, level='INFO'):
    """Timestamped log to stdout and file."""
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] [{level}] {msg}'
    print(line)
    try:
        _ensure_log().write_text(
            _ensure_log().read_text(encoding='utf-8') + line + '\n',
            encoding='utf-8'
        )
    except (OSError, FileNotFoundError):
        pass

# ─── Token Loading ─────────────────────────────────────────────

def load_token():
    """Load Meta access token using the canonical credential resolution order.

    Resolution: env var > .env > workspace config > local token file
    Falls back to META_ACCESS_TOKEN env if credentials.py fails.
    """
    try:
        return get_meta_token()
    except CredentialError:
        token = os.environ.get('META_ACCESS_TOKEN', '')
        if not token:
            raise CredentialError(
                'No Meta token found. Set META_ACCESS_TOKEN env var or .env file.'
            )
        return token

def get_token():
    """Alias for load_token()."""
    return load_token()

# ─── API Helpers ───────────────────────────────────────────────

def api_get(access_token, path, params=None, timeout=15, version=None):
    """GET request to Meta Graph API.

    Args:
        access_token: Meta access token
        path: API path (e.g., 'act_123/campaigns')
        params: Query parameters dict
        timeout: Request timeout in seconds
        version: API version override (default: v22.0)
    """
    if params is None:
        params = {}
    params['access_token'] = access_token
    api_base = f'https://graph.facebook.com/{version or META_API_VERSION}'
    try:
        r = requests.get(f'{api_base}/{path}', params=params, timeout=timeout)
        return r.json()
    except Exception as e:
        log(f'API GET error: {e}', 'ERROR')
        return {'error': str(e)}


def api_post(access_token, path, data=None, timeout=15, version=None):
    """POST request to Meta Graph API."""
    if data is None:
        data = {}
    data['access_token'] = access_token
    api_base = f'https://graph.facebook.com/{version or META_API_VERSION}'
    try:
        r = requests.post(f'{api_base}/{path}', data=data, timeout=timeout)
        return r.json()
    except Exception as e:
        log(f'API POST error: {e}', 'ERROR')
        return {'error': str(e)}


# ─── Quick Scans ──────────────────────────────────────────────

def scan_account(access_token, act_id):
    """Single account quick scan — returns summary dict."""
    ins = api_get(
        access_token,
        f'{act_id}/insights',
        {
            'fields': 'spend,impressions,clicks,ctr,cpc,cpm,actions,cost_per_action_type',
            'date_preset': 'today',
        },
    )
    d = ins.get('data', [{}])[0] if ins.get('data') else {}

    purchases = sum(
        int(a['value'])
        for a in d.get('actions', [])
        if 'purchase' in a.get('action_type', '').lower()
    )

    return {
        'spend': float(d.get('spend', 0)),
        'impressions': int(float(d.get('impressions', 0))),
        'clicks': int(float(d.get('clicks', 0))),
        'ctr': float(d.get('ctr', 0)),
        'cpc': float(d.get('cpc', 0)),
        'cpm': float(d.get('cpm', 0)),
        'purchases': purchases,
    }


def get_active_campaigns(access_token, act_id):
    """Get all ACTIVE campaigns for an account."""
    camps = api_get(
        access_token,
        f'{act_id}/campaigns',
        {'fields': 'id,name,status,daily_budget', 'limit': 50},
    )
    if 'error' in camps:
        return []
    return [c for c in camps.get('data', []) if c.get('status') == 'ACTIVE']


def get_campaign_insights(access_token, camp_id):
    """Get today's insights for a specific campaign."""
    ins = api_get(
        access_token,
        f'{camp_id}/insights',
        {
            'fields': 'spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type',
            'date_preset': 'today',
        },
    )
    d = ins.get('data', [{}])[0] if ins.get('data') else {}

    purchases = sum(
        int(a['value'])
        for a in d.get('actions', [])
        if 'purchase' in a.get('action_type', '').lower()
    )
    cpr = next(
        (
            float(x['value'])
            for x in d.get('cost_per_action_type', [])
            if 'purchase' in x.get('action_type', '').lower()
        ),
        None,
    )

    return {
        'spend': float(d.get('spend', 0)),
        'impressions': int(float(d.get('impressions', 0))),
        'clicks': int(float(d.get('clicks', 0))),
        'ctr': float(d.get('ctr', 0)),
        'cpc': float(d.get('cpc', 0)),
        'purchases': purchases,
        'cpr': cpr,
    }