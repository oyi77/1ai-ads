import urllib.request, urllib.parse, json, time, datetime, sys
ACT_ID = "380721031313330"
API = "https://graph.facebook.com/v22.0"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"

def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith('#'): continue
        if line.split('=',1)[0] == 'META_ACCESS_TOKEN':
            return line.split('=',1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing")

def fb_get(path, params=None, retries=3):
    params = dict(params or {})
    params["access_token"] = load_token()
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k,v in params.items())
    url = f"{API}/{path}?{qs}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            err = str(e)
            if hasattr(e, 'read'):
                err = e.read().decode(errors='replace')[:300]
            print(f"Error attempt={attempt+1} path={path}: {err}", file=sys.stderr)
            if attempt+1 < retries:
                time.sleep((attempt+1)*3)
            else:
                raise
    raise RuntimeError("retries exhausted")

def paging_all(initial):
    out = list(initial.get('data', []))
    nxt = initial.get('paging', {}).get('next')
    while nxt:
        time.sleep(0.8)
        nxt_data = fb_get(nxt)
        out.extend(nxt_data.get('data', []))
        nxt = nxt_data.get('paging', {}).get('next')
    return out

today = datetime.date.today().isoformat()

# 1. Campaigns
camps0 = fb_get(f"act_{ACT_ID}/campaigns", {"fields": "id,name,status,daily_budget", "limit": 200})
all_camps = paging_all(camps0)
active_campaigns = [c for c in all_camps if c.get('status') == 'ACTIVE']
total_camps = len(all_camps)
print(f"Total campaigns: {total_camps}", file=sys.stderr)

# 2. Account insights
acc_ins = fb_get(f"act_{ACT_ID}/insights", {
    "time_range": json.dumps({"since": today, "until": today}),
    "level": "account",
    "fields": "spend,clicks,cpc",
})
acc_data = ((acc_ins or {}).get("data") or [{}])[0]
spend_acc = float(acc_data.get("spend") or 0)
clicks_acc = int(acc_data.get("clicks") or 0)
cpc_api = acc_data.get("cpc")
global_cpc = float(cpc_api) if cpc_api not in (None, "", 0) else (spend_acc / clicks_acc if clicks_acc else 0)
mode = "AMAN" if global_cpc < 120 else "WASPADA"
print(f"Global CPC: Rp{global_cpc:.1f} | Mode: {mode}", file=sys.stderr)

# 3. Campaign-level insights today
ci_map = {}
ci0 = fb_get(f"act_{ACT_ID}/insights", {
    "time_range": json.dumps({"since": today, "until": today}),
    "level": "campaign",
    "fields": "campaign_id,campaign_name,spend,cpc,clicks",
    "limit": 500,
})
for row in paging_all(ci0):
    cid = row.get("campaign_id")
    if not cid: continue
    ci_map[cid] = {
        "name": row.get("campaign_name", ""),
        "spend": float(row.get("spend") or 0),
        "cpc": float(row.get("cpc") or 0),
        "clicks": int(row.get("clicks") or 0),
    }
print(f"Campaign insight rows: {len(ci_map)}", file=sys.stderr)

# 4. Compute buckets (NO mutations yet)
monster = []
watch = []
winners = []
lc_scale = []

for c in all_camps:
    cid = c["id"]
    if cid not in ci_map:
        continue
    info = ci_map[cid]
    cpc = info["cpc"]
    spend = info["spend"]
    clicks = info["clicks"]
    name = info["name"]

    if global_cpc >= 120:
        if (cpc >= 500 and spend > 1000) or (cpc >= 1000 and spend > 500):
            label = "[ALREADY OFF_]" if name.startswith("OFF_") else ""
            monster.append(f"{name} (CPC Rp{cpc:.0f}, Rp{spend:.0f}){label}")
        elif cpc > 200 and clicks == 0 and spend > 500:
            watch.append(f"{name} (CPC Rp{cpc:.0f}, Rp{spend:.0f})")
        elif cpc < 120 and clicks > 5 and spend > 10000:
            winners.append(f"{name} (CPC Rp{cpc:.0f}, clicks={clicks}, Rp{spend:.0f})")
    else:
        if "LC" in name and cpc < 120 and clicks > 0:
            lc_scale.append(name)
        if cpc >= 500:
            monster.append(f"{name} (CPC Rp{cpc:.0f}, Rp{spend:.0f})")

# 5. Apply LC scale (+20% budget up to 50K) for qualifying active campaigns
lc_mutated = []
for c in active_campaigns:
    cid = c["id"]
    if cid not in ci_map:
        continue
    info = ci_map[cid]
    cpc = info["cpc"]
    clicks = info["clicks"]
    name = info["name"]
    cur = c.get("daily_budget")
    if not cur:
        continue
    cur = int(cur)
    if "LC" in name and cpc < 120 and clicks > 0:
        new_budget = min(int(cur * 1.2), 50000)
        if new_budget > cur:
            try:
                fb_post(f"{cid}", {"daily_budget": str(new_budget)})
                lc_mutated.append(f"{name}: Rp{cur} -> Rp{new_budget}")
                time.sleep(1.4)
            except Exception as e:
                print(f"Budget bump failed {cid}: {e}", file=sys.stderr)

# 6. Pause + OFF-rename for monsters (only if allowed / active)
mon_actioned = []
if global_cpc >= 120:
    for c in all_camps:
        if c["id"] not in ci_map:
            continue
        info = ci_map[c["id"]]
        cpc = info["cpc"]
        spend = info["spend"]
        name = info["name"]
        if name.startswith("OFF_"):
            continue
        if ((cpc >= 500 and spend > 1000) or (cpc >= 1000 and spend > 500)) and c.get("status") == "ACTIVE":
            try:
                fb_post(c["id"], {"status": "PAUSED"})
                time.sleep(1.2)
                fb_post(c["id"], {"name": f"OFF_{name}"})
                mon_actioned.append(name)
                time.sleep(1.4)
            except Exception as e:
                print(f"Monster action failed {c['id']}: {e}", file=sys.stderr)

# 7. Dedup & report
uniq = lambda seq: list(dict.fromkeys(seq))
monster = uniq(monster); watch = uniq(watch); winners = uniq(winners); lc_scale = uniq(lc_scale)

ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M WIB")
rep = [
    f"🛡️ SATPAM 1041 {ts}",
    f"ACTIVE:{len(active_campaigns)} | Total:{total_camps} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}",
    f"Spend today: Rp{spend_acc:,.0f} | Clicks: {clicks_acc}",
    f"💀 MONSTER: {', '.join(monster) if monster else 'none'}",
]
if mon_actioned:
    rep += [f"   -> Paused+OFF_: {', '.join(uniq(mon_actioned))}"]
rep += [
    f"👀 WATCH: {', '.join(watch) if watch else 'none'}",
    f"🌟 WINNER: {', '.join(winners) if winners else 'none'}",
    f"💰 LC SCALE: {len(lc_mutated)} naik budget",
]
if lc_mutated:
    rep.append("   -> " + ", ".join(lc_mutated))

print("\n".join(rep))
