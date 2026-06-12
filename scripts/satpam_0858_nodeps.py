import json
import os
import time
import urllib.request
import urllib.parse
import datetime
from pathlib import Path

API = "https://graph.facebook.com/v22.0"
ACT = "435670549443081"
ACT_ID = f"act_{ACT}"
SINCE = "2026-06-05"
UNTIL = "2026-06-12"


def load_token():
    env_path = "/home/openclaw/projects/1ai-ads/.env"
    for line in Path(env_path, encoding="utf-8").read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing from .env")


TOKEN = "TOKEN_PLACEHOLDER"
