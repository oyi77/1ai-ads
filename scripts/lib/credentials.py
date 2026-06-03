#!/usr/bin/env python3
"""
Shared credential loader for PoC scripts.

Resolution order (highest to lowest):
  1. Environment variable (META_ACCESS_TOKEN, META_TOKEN, or FB_ACCESS_TOKEN)
  2. .env file in project root (parsed with simple key=value, no deps)
  3. ~/.openclaw/workspace/config/meta_token.json (workspace source of truth)
  4. ./.fb_token_0858 (local project copy)
  5. Raises CredentialError — NEVER hardcode fallbacks

This way, token rotation only needs to happen in one place (the workspace
config file or .env), not in every script.
"""
import json
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_FILE = PROJECT_ROOT / '.env'
WORKSPACE_TOKEN_JSON = Path.home() / '.openclaw' / 'workspace' / 'config' / 'meta_token.json'
LOCAL_TOKEN_FILE = PROJECT_ROOT / '.fb_token_0858'

META_TOKEN_ENV_KEYS = ('META_ACCESS_TOKEN', 'META_TOKEN', 'FB_ACCESS_TOKEN', 'FB_SYSTEM_TOKEN')


class CredentialError(RuntimeError):
    """Raised when no Meta access token can be resolved."""


def _load_env_file(path):
    """Minimal .env parser (no shell expansion, no comments beyond #)."""
    env = {}
    if not path.is_file():
        return env
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        key, _, value = line.partition('=')
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def get_meta_token():
    """Resolve the Meta access token from the highest-priority source.

    Returns:
        str: The access token.

    Raises:
        CredentialError: If no token is found in any of the resolved sources.
    """
    for key in META_TOKEN_ENV_KEYS:
        val = os.environ.get(key)
        if val:
            return val

    if WORKSPACE_TOKEN_JSON.is_file():
        try:
            data = json.loads(WORKSPACE_TOKEN_JSON.read_text(encoding='utf-8'))
            token = data.get('access_token')
            if token:
                return token
        except (json.JSONDecodeError, OSError):
            pass

    env = _load_env_file(ENV_FILE)
    for key in META_TOKEN_ENV_KEYS:
        if env.get(key):
            return env[key]

    if LOCAL_TOKEN_FILE.is_file():
        try:
            content = LOCAL_TOKEN_FILE.read_text(encoding='utf-8').strip()
            if content:
                return content
        except OSError:
            pass

    raise CredentialError(
        'Meta access token not found. Set META_ACCESS_TOKEN env var, '
        'add META_ACCESS_TOKEN=... to .env, or place token in '
        f'{WORKSPACE_TOKEN_JSON} or {LOCAL_TOKEN_FILE}'
    )


def get_account_id():
    """Resolve the default ad account ID from .env or env var (e.g. META_AD_ACCOUNT_ID)."""
    val = os.environ.get('META_AD_ACCOUNT_ID')
    if val:
        return val
    env = _load_env_file(ENV_FILE)
    return env.get('META_AD_ACCOUNT_ID', 'act_380721031313330')
