#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse

API = "https://graph.facebook.com/v22.0"
ACT_ID = "2125021885010866"
ACT_PREFIX = "act_" + ACT_ID
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith("#"):
            continue
        if line.split("=", 1)[0] == "META_ACCESS_TOKEN":
            return line.split("=", 1)[1].strip()
    raise RuntimeError("token missing")

TOKEN=load_t...oken length: {len(TOKEN)}")
print(f"Token prefix: {TOKEN[:12]}...")

def req(url):
    r = urllib.request.Request(url)
    with urllib.request.urlopen(r, timeout=10) as resp:
        return resp.status, resp.headers, json.loads(resp.read())

# 1) /me + /me/accounts
for endpoint in ["me", "me/adaccounts"]:
    url = f"{API}/{endpoint}?access_token={TOKEN}"
    try:
        status, headers, body = req(url)
        print(f"\n{endpoint} status={status}")
        print(body)
    except Exception as e:
        print(f"{endpoint} error: {e}")

# 2) campaigns with minimal fields
url = f"{API}/{ACT_PREFIX}/campaigns?fields=id,name&limit=200&access_token={TOKEN}"
try:
    status, headers, body = req(url)
    print(f"\ncampaigns status={status}")
    print("count:", len(body.get("data", [])))
    for c in body.get("data", [])[:5]:
        print("  ", c["id"], c.get("name"))
    print("paging:", body.get("paging"))
except Exception as e:
    print(f"campaigns error: {e}")
