from vilona_trakpro_engine import fb_get, fb_post, ACCOUNTS, API, ACCESS_TOKEN, log, WIB
import json
from datetime import datetime
account_key = "1041"
act = ACCOUNTS[account_key]["id"]

since_date = "2026-06-06"
until_date = "2026-06-13"

insights = fb_get(
    f"{act}/insights",
    fields="campaign_id,campaign_name,spend,clicks,impressions,cpc,ctr,actions",
    time_range=json.dumps({"since": since_date, "until": until_date}),
    level="campaign",
    limit="100",
)

by_id = {}
for c in insights.get("data", []):
    cid = c.get("campaign_id")
    link_clicks = 0
    for a in c.get("actions", []):
        if a["action_type"] == "link_click":
            link_clicks = int(a["value"])
    by_id[cid] = {
        "name": c.get("campaign_name", "?"),
        "spend": float(c.get("spend", 0)),
        "clicks": int(c.get("clicks", 0)),
        "impressions": int(c.get("impressions", 0)),
        "cpc": float(c.get("cpc", 0)),
        "ctr": float(c.get("ctr", 0)),
        "link_clicks": link_clicks,
    }

campaigns = fb_get(f"{act}/campaigns", fields="id,name,status", limit="200")

kill = []
watch = []
winners = []
active_count = 0
off_count = 0
star_count = 0
total_spend = 0
for ch in campaigns.get("data", []):
    name = ch["name"]
    status = ch["status"]
    cid = ch["id"]
    d = by_id.get(cid, {})
    spend = d.get("spend", 0)
    total_spend += spend
    if name.startswith("OFF_"):
      off_count += 1
      continue
    if name.startswith("🌟_"):
      star_count += 1
    ctype = "CBO"
    upper = name.upper()
    if "TEST" in upper or "TESTING" in upper:
      ctype = "TEST"
    elif upper.startswith(("ABO", "BIDCAP")):
      ctype = "ABO"
    elif upper.startswith(("CBO", "BC_", "LC_", "TC_", "ON_LC", "GLW")):
      ctype = "CBO"
    elif "_" in upper[:20] and upper.split("_")[0] in ("ON", "PROFIT", "SCALE"):
      ctype = "CBO"
    else:
      ctype = "CBO"
    cpc = d.get("cpc", 0)
    ctr = d.get("ctr", 0)
    impr = d.get("impressions", 0)
    clicks = d.get("clicks", 0)
    if cpc > 200 and spend > 2000:
      kill.append((name, cpc, spend))
      try:
        fb_post(cid, status="PAUSED")
        fb_post(cid, name=f"OFF_{name}" if not name.startswith("OFF_") else name)
      except Exception as e:
        print(f"pause/rename failed {cid}: {e}")
      continue
    if status == "PAUSED":
      continue
    if cpc > (250 if ctype == "ABO" else 120) and spend > 5000:
      watch.append((name, cpc, ctr, spend))
      continue
    if ctr < 1 and impr > 1000:
      watch.append((name, cpc, ctr, spend))
      continue
    if cpc < 120 and spend > 50000 and clicks > 0:
      winners.append((name, ctc:=cpc, ctr, spend, d.get("link_clicks", 0)))
      new_name = f"🌟_{name}" if not name.startswith("🌟_") else name
      try:
        fb_post(cid, name=new_name)
      except Exception as e:
        print(f"star rename failed {cid}: {e}")
      continue
    active_count += 1

alerts = []
alerts.append(f"🛡️ SATPAM 1041 — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
alerts.append(f"ACTIVE: {active_count} | OFF_: {off_count} | 🌟: {star_count}")
alerts.append(f"⚠️ KILL: {len(kill)}")
for k in kill:
  alerts.append(f" - {k[0]} | CPC Rp{k[1]:.0f} | spend Rp{k[2]:,.0f}")
alerts.append(f"👀 WATCH: {len(watch)}")
for w in watch:
  alerts.append(f" - {w[0]} | CPC Rp{w[1]:.0f} CTR {w[2]:.2f}% spend Rp{w[3]:,.0f}")
alerts.append(f"🌟 WINNERS: {len(winners)}")
for w in winners:
  alerts.append(f" - {w[0]} | CPC Rp{w[1]:.0f} CTR {w[2]:.2f}% link_clicks={w[4]} spend Rp{w[3]:,.0f}")
alerts.append(f"💰 Spend 7d: Rp{total_spend:,.0f}")

for line in alerts:
  print(line)
print("\n".join(alerts))
