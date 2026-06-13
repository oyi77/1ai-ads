import urllib.request
import urllib.parse
import json
import time
import datetime
import sys

ACT_ID = "380721031313330"
API = "https://graph.facebook.com/v22.0"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"


def load_token():
    token = None
    try:
        for line in open(ENV_PATH).read().splitlines():
            if not line or line.startswith('#'):
                continue
            if line.split('=', 1)[0] == 'META_ACCESS_TOKEN':
                token = line.split('=', 1)[1].strip()
                break
    except Exception:
        pass
    if not token:
        raise RuntimeError("META_ACCESS_TOKEN missing")
    print(f"Token loaded: {len(token)} chars", file=sys.stderr)
    return token


def fb_get(path, params=None, retries=3):
    # The engine approach here is simpler: construct final URL, GET
    params = dict(params or {})
    params["access_token"] = load_token()
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
    url = f"{API}/{path}?{qs}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors='replace')
            print(f"HTTPError {e.code} attempt={attempt+1} path={path} body={body[:300]}", file=sys.stderr)
            if e.code in (429, 400) and ('2446079' in body or 'limit' in body.lower() or e.code == 429):
                wait = (attempt + 1) * 4
                time.sleep(wait)
                continue
            raise
    raise RuntimeError("Max retries exceeded " + path)


def fb_post(path, data):
    token = load_token()
    data["access_token"] = token
    qs = urllib.parse.urlencode(data)
    url = f"{API}/{path}"
    req = urllib.request.Request(url, data=qs.encode(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main():
    today = datetime.date.today().isoformat()
    # account-level insights
    acc = fb_get(f"act_{ACT_ID}/insights", {
        "time_range": json.dumps({"since": today, "until": today}),
        "level": "account",
        "fields": "spend,clicks,cpc",
    })
    row = (((acc or {}).get("data") or [{}])[0])
    spend = float(row.get("spend") or 0)
    clicks = int(row.get("clicks") or 0)
    cpc_api = row.get("cpc")
    global_cpc = float(cpc_api) if cpc_api not in (None, "", 0) else (spend / clicks if clicks else 0)
    print(json.dumps({"account_insights": row, "global_cpc": global_cpc, "spend": spend, "clicks": clicks}, indent=2))

    # campaign list
    camps = fb_get(f"act_{ACT_ID}/campaigns", {
        "fields": "id,name,status,daily_budget",
        "limit": 200,
    })
    data = camps.get("data", [])
    print(json.dumps({"campaign_count": len(data), "sample": data[:2]}, indent=2))

    # page adsets for first active
    active = [c for c in data if c.get("status") == "ACTIVE"]
    print(f"ACTIVE:{len(active)} | Total:{len(data)} | GlobalCPC:Rp{global_cpc:.0f} | Spend:{spend:.0f} | Clicks:{clicks}")
    sys.stdout.flush()

if __name__ == "__main__":
    main()
