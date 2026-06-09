#!/usr/bin/env python3
"""
🔥 AGGRESSIVE 0858 CAMPAIGN ACTIVATOR — 9 Juni 2026
Mengaktifkan SEMUA OFF_ rakpiringpengering & Perlengkapan Rumah campaigns
"""
import os, json, urllib.request, time, sys

TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
if not TOKEN:
    print("❌ No META_ACCESS_TOKEN")
    sys.exit(1)

API = "https://graph.facebook.com/v22.0"
ACT = "act_435670549443081"

def api_get(path):
    url = f"{API}/{path}&access_token={TOKEN}&limit=100"
    try:
        return json.loads(urllib.request.urlopen(url, timeout=15).read())
    except Exception as e:
        return {"error": str(e)}

def api_post(path, data):
    url = f"{API}/{path}"
    data["access_token"] = TOKEN
    req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=15).read())
    except urllib.error.HTTPError as e:
        return {"error": True, "code": e.code, "msg": e.read().decode()[:200]}
    except Exception as e:
        return {"error": str(e)}

print("="*60)
print("🔥 AGGRESSIVE 0858 ACTIVATION — Perlengkapan Rumah Push")
print("="*60)

# Step 1: Get ALL campaigns (paginate manually)
all_camps = []
after = ""
page = 0
while page < 10:  # max 10 pages = 1000 campaigns
    params = f"{ACT}/campaigns?fields=name,id,daily_budget,status,effective_status&limit=100"
    if after:
        params += f"&after={after}"
    
    data = api_get(params)
    if "error" in data:
        print(f"❌ API Error: {data}")
        break
    
    camps = data.get("data", [])
    if not camps:
        break
    
    all_camps.extend(camps)
    print(f"  Page {page+1}: {len(camps)} campaigns (total: {len(all_camps)})")
    
    paging = data.get("paging", {})
    cursors = paging.get("cursors", {})
    after = cursors.get("after", "")
    if not after:
        break
    page += 1
    time.sleep(0.3)

print(f"\n📊 Total campaigns fetched: {len(all_camps)}")

# Step 2: Find rakpiringpengering & organizer campaigns that are OFF_/PAUSED
target_keywords = ["rakpiring", "rakdapur", "organizer", "rak_piring", "dapur"]
reactivated = []
errors = []

for c in all_camps:
    name = c.get("name", "")
    cid = c.get("id", "")
    status = c.get("status", "")
    eff = c.get("effective_status", "")
    budget_raw = c.get("daily_budget", 0)
    
    # Convert budget - might be string or int
    try:
        budget_idr = float(budget_raw) / 100 if budget_raw and float(budget_raw) > 0 else 0
    except (ValueError, TypeError):
        budget_idr = 0
    
    # Only target Perlengkapan Rumah related campaigns
    matched = any(kw in name.lower() for kw in target_keywords)
    if not matched:
        continue
    
    # Check if it's OFF_ and PAUSED
    is_off = "OFF_" in name
    is_paused = status == "PAUSED" or eff == "PAUSED"
    
    if is_off and is_paused and budget_idr >= 15:
        # Reactivate! Strip ALL OFF_ prefixes  
        new_name = name
        while new_name.startswith("OFF_"):
            new_name = new_name[4:]
        if not new_name.startswith("ON_"):
            new_name = f"ON_{new_name}"
        
        # Ensure minimum budget of Rp20K (2,000,000 cents)
        new_budget_cents = max(float(budget_raw) if budget_raw else 0, 2000000)
        
        print(f"\n🔄 {name[:55]}...")
        print(f"   Budget: Rp{budget_idr:,.0f} | Status: {eff}")
        print(f"   → Rename: {new_name[:55]}...")
        
        r = api_post(cid, {"name": new_name, "status": "ACTIVE", "daily_budget": int(new_budget_cents)})
        
        if r.get("success", False):
            print(f"   ✅ ACTIVATED!")
            reactivated.append({"id": cid, "name": new_name, "budget": budget_idr})
        else:
            err_msg = str(r.get("error", r))[:100]
            print(f"   ❌ Failed: {err_msg}")
            errors.append({"id": cid, "name": name, "error": err_msg})
        
        time.sleep(1.5)
    
    # Also try PAUSED but ON_ campaigns with no OFF_ prefix
    elif not is_off and is_paused and budget_idr >= 15 and ("rakpiring" in name.lower() or "rakdapur" in name.lower()):
        print(f"\n🔄 {name[:55]}... (PAUSED, ON_ prefix)")
        r = api_post(cid, {"status": "ACTIVE"})
        if r.get("success", False):
            print(f"   ✅ REACTIVATED!")
            reactivated.append({"id": cid, "name": name, "budget": budget_idr})
        else:
            err_msg = str(r.get("error", r))[:100]
            print(f"   ❌ Failed: {err_msg}")
        time.sleep(1)

print("\n" + "="*60)
print(f"📋 RESULTS")
print("="*60)
print(f"✅ Reactivated: {len(reactivated)} campaigns")
for c in reactivated:
    print(f"   • {c['name'][:50]} — Rp{c['budget']:,.0f}")
print(f"❌ Errors: {len(errors)}")
for e in errors:
    print(f"   • {e['name'][:40]}: {e['error'][:60]}")
total_budget = sum(c['budget'] for c in reactivated)
print(f"\n💰 Total budget reactivated: Rp{total_budget:,.0f}")
print("="*60)
