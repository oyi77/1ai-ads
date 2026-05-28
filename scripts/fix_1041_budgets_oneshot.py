import urllib.request, json
import os
TOKEN = "os.getenv('META_ACCESS_TOKEN', '')"
ACCOUNT = "act_380721031313330"

def api(url):
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

def api_post(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req, timeout=15)
    return json.loads(resp.read())

# 1. Get active campaigns
url = f"https://graph.facebook.com/v19.0/{ACCOUNT}/campaigns?fields=name,id,status,daily_budget&effective_status=[\"ACTIVE\"]&limit=50&access_token={TOKEN}"
camps = api(url).get('data', [])

# 2. Pause anything with OFF or DEAD
active_clean = []
for c in camps:
    name = c['name']
    if 'off' in name.lower() or 'dead' in name.lower():
        print(f"Pausing: {name}")
        api_post(f"https://graph.facebook.com/v19.0/{c['id']}?access_token={TOKEN}", {"status": "PAUSED"})
    else:
        active_clean.append(c)

# 3. Distribute budget 631,000 to clean active campaigns
if active_clean:
    total_budget = 631000
    each = int((total_budget * 1.05) / len(active_clean)) # small buffer
    each = max(25000, each)
    print(f"Setting budget for {len(active_clean)} campaigns to Rp {each:,}")
    for c in active_clean:
        print(f"Updating: {c['name']}")
        try:
            res = api_post(f"https://graph.facebook.com/v19.0/{c['id']}?access_token={TOKEN}", {"daily_budget": str(each)})
            print(f"  Result: {res.get('success', 'ERROR')}")
        except Exception as e:
            print(f"  Fail updating {c['id']}: {e}")
