import urllib.request
import urllib.parse
import urllib.error
import json
import time
import datetime
import sys

ACT_ID = "380721031313330"
API = "https://graph.facebook.com/v22.0"
ENV_PATH = "/home/openclaw/projects/1ai-ads/.env"


def load_token():
    for line in open(ENV_PATH).read().splitlines():
        if not line or line.startswith('#'):
            continue
        if line.split('=', 1)[0] == 'META_ACCESS_TOKEN':
            return line.split('=', 1)[1].strip()
    raise RuntimeError("META_ACCESS_TOKEN missing")


def fb_get(path, params=None, retries=3):
    p = dict(params or {})
    p["access_token"] = load_token()
    qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in p.items())
    url = f"{API}/{path}?{qs}"
    for i in range(retries):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            print(f"GET {path} fail #{i+1}: {e}", file=sys.stderr)
            if i + 1 < retries:
                time.sleep((i + 1) * 4)
            else:
                raise


def paging_fetch(initial):
    out = list(initial.get('data', []))
    nxt = initial.get('paging', {}).get('next')
    while nxt:
        time.sleep(0.9)
        req = urllib.request.Request(nxt)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                nxt_data = json.loads(resp.read())
        except Exception as e:
            print(f"next page failed: {e}", file=sys.stderr)
            break
        out.extend(nxt_data.get('data', []))
        nxt = nxt_data.get('paging', {}).get('next')
    return out


def fb_post(path, data):
    data["access_token"] = load_token()
    req = urllib.request.Request(API + '/' + path, data=urllib.parse.urlencode(data).encode(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def main():
    today = datetime.date.today().isoformat()

    # Campaign inventory
    camps0 = fb_get(f"act_{ACT_ID}/campaigns", {"fields": "id,name,status,daily_budget", "limit": 200})
    all_camps = paging_fetch(camps0)
    active_campaigns = [c for c in all_camps if c.get('status') == 'ACTIVE']
    total_camps = len(all_camps)

    # Account insights (today)
    acc_ins = fb_get(f"act_{ACT_ID}/insights", {
        "time_range": json.dumps({"since": today, "until": today}),
        "level": "account",
        "fields": "spend,clicks,cpc",
    })
    acc = (((acc_ins or {}).get("data") or [{}])[0])
    spend_acc = acc.get("spend", "0")
    clicks_acc = acc.get("clicks", "0")
    cpc_api = acc.get("cpc")
    spend_acc = float(spend_acc or 0)
    clicks_acc = int(clicks_acc or 0)
    global_cpc = float(cpc_api) if cpc_api not in (None, "", 0) else (spend_acc / clicks_acc if clicks_acc else 0.0)
    global_cpc = round(global_cpc, 1)
    mode = "AMAN" if global_cpc < 120 else "WASPADA"

    # Campaign insights (today)
    ci0 = fb_get(f"act_{ACT_ID}/insights", {
        "time_range": json.dumps({"since": today, "until": today}),
        "level": "campaign",
        "fields": "campaign_id,campaign_name,spend,cpc,clicks",
        "limit": 500,
    })
    ci_map = {}
    for row in paging_fetch(ci0):
        cid = row.get("campaign_id")
        if not cid:
            continue
        ci_map[cid] = {
            'name': row.get('campaign_name', ''),
            'spend': float(row.get('spend') or 0),
            'cpc': float(row.get('cpc') or 0),
            'clicks': int(row.get('clicks') or 0),
        }

    monster = []
    watch = []
    winners = []
    lc_scale = []

    for c in all_camps:
        cid = c['id']
        if cid not in ci_map:
            continue
        info = ci_map[cid]
        cpc = info['cpc']
        spend = info['spend']
        clicks = info['clicks']
        name = info['name']

        if mode == "WASPADA":
            if name.startswith('OFF_'):
                continue
            if (cpc >= 500 and spend > 1000) or (cpc >= 1000 and spend > 500):
                monster.append(f"{name}|CPC Rp{cpc:.0f}|Rp{spend:.0f}")
            elif cpc > 200 and clicks == 0 and spend > 500:
                watch.append(f"{name}|CPC Rp{cpc:.0f}|Rp{spend:.0f}")
            elif cpc < 120 and clicks > 5 and spend > 10000:
                winners.append(f"{name}|CPC Rp{cpc:.0f}|clicks {clicks}|Rp{spend:.0f}")
        else:
            if cpc >= 500:
                monster.append(f"{name}|CPC Rp{cpc:.0f}|Rp{spend:.0f}")
            if 'LC' in name and cpc < 120 and clicks > 0:
                lc_scale.append(name)

    # LC scale
    mutated = []
    for c in active_campaigns:
        cid = c['id']
        if cid not in ci_map:
            continue
        info = ci_map[cid]
        if 'LC' in info['name'] and info['cpc'] < 120 and info['clicks'] > 0:
            cur = c.get('daily_budget')
            if not cur:
                continue
            cur = int(cur)
            new_budget = min(int(cur * 1.2), 50000)
            if new_budget > cur:
                try:
                    fb_post(f"{cid}", {"status": "ACTIVE" if c.get('status') != 'ACTIVE' else 'ACTIVE', "daily_budget": str(new_budget)})
                    mutated.append(f"{info['name']}: Rp{cur} -> Rp{new_budget}")
                    time.sleep(1.4)
                except Exception as e:
                    print(f"budget fail {cid}: {e}", file=sys.stderr)

    # Mutations: pause+rename monsters (only in WASPADA)
    actioned = []
    if mode == "WASPADA":
        for c in active_campaigns:
            cid = c['id']
            if cid not in ci_map:
                continue
            info = ci_map[cid]
            cpc = info['cpc']
            spend = info['spend']
            name = info['name']
            if name.startswith('OFF_'):
                continue
            if ((cpc >= 500 and spend > 1000) or (cpc >= 1000 and spend > 500)):
                try:
                    fb_post(f"{cid}", {"status": "PAUSED"})
                    time.sleep(1.2)
                    fb_post(f"{cid}", {"name": f"OFF_{name}"})
                    actioned.append(name)
                    time.sleep(1.4)
                except Exception as e:
                    print(f"monster action fail {cid}: {e}", file=sys.stderr)

    uniq = lambda seq: list(dict.fromkeys(seq))
    monster = uniq(monster); watch = uniq(watch); winners = uniq(winners); lc_scale = uniq(lc_scale)

    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M WIB")
    rep = [
        f"🛡️ SATPAM 1041 {ts}",
        f"ACTIVE:{len(active_campaigns)} | Total:{total_camps} | Global CPC:Rp{global_cpc:.0f} | Mode:{mode}",
        f"Spend today: Rp{spend_acc:,.0f} | Clicks: {clicks_acc}",
        f"💀 MONSTER: {', '.join(monster) if monster else 'none'}",
    ]
    if actioned:
        rep.append(f"   -> Paused+OFF_: {', '.join(uniq(actioned))}")
    rep += [
        f"👀 WATCH: {', '.join(watch) if watch else 'none'}",
        f"🌟 WINNER: {', '.join(winners) if winners else 'none'}",
        f"💰 LC SCALE: {len(mutated)} naik budget",
    ]
    if mutated:
        rep.append("   -> " + ", ".join(mutated))
    print("\n".join(rep))
    sys.stdout.flush()


if __name__ == "__main__":
    main()
