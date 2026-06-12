#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse
import urllib.error

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

TOKEN = load_token()
print(f"Token length: {len(TOKEN)}")
print(f"Token prefix: {TOKEN[:12]}...")

def req(url, method="GET", data=None):
    if data is not None:
        data = urllib.parse.urlencode(data).encode()
    r = urllib.request.Request(url, data=data, method=method)
    return urllib.request.urlopen(r, timeout=10)

# 1) Account access
acct_url = f"{API}/{ACT_PREFIX}?fields=account_name,id&access_token={TOKEN}"
try:
    with req(acct_url) as resp:
        print("ACCOUNT:", json.loads(resp.read()))
except urllib.error.HTTPError as e:
    print(f"ACCOUNT ERROR {e.code}:", e.read().decode()[:500])

# 2) Campaigns raw
camp_url = f"{API}/{ACT_PREFIX}/campaigns?fields=id,name,status,effective_status&limit=200&access_token={TOKEN}"
try:
    with req(camp_url) as resp:
        body = json.loads(resp.read())
        print("CAMPAIGNS total returned:", len(body.get("data", [])))
        for c in body.get("data", [])[:10]:
            print("  ", c["id"], c["name"][:60], c["status"])
        print("Paging after:", body.get("paging", {}).get("cursors", {}))
except urllib.error.HTTPError as e:
    print(f"CAMPAIGNS ERROR {e.code}:", e.read().decode()[:500])
