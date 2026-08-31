"""Shared meta API configuration — load token, helpers"""

import json, requests, os


def get_token():
    """Load Meta API access token from environment (never hardcode credentials)."""
    token = os.getenv("META_ACCESS_TOKEN", "").strip()
    if not token:
        raise Exception("META_ACCESS_TOKEN not set in environment")
    return token


TOKEN = get_token()
API_VERSION = "v19.0"
BASE = f"https://graph.facebook.com/{API_VERSION}"


def api_get(path, params=None):
    p = {"access_token": TOKEN}
    if params:
        p.update(params)
    return requests.get(f"{BASE}/{path}", params=p).json()


def api_post(path, data):
    d = {"access_token": TOKEN}
    d.update(data)
    return requests.post(f"{BASE}/{path}", data=d).json()


def log(msg, log_file=None):
    from datetime import datetime

    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    if log_file:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        with open(log_file, "a") as f:
            f.write(line + "\n")
    return line


# Account config
ACCOUNTS = {
    "act_380721031313330": {"name": "1041", "budget_cap": 300000},
    "act_435670549443081": {"name": "0858", "budget_cap": 300000},
    "act_2125021885010866": {"name": "glowscent", "budget_cap": 300000},
}
