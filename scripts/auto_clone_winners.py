#!/usr/bin/env python3
"""
Auto-clone winners across all active Meta Ads accounts.
- Scan 7-day insights for each account
- Filter: ACTIVE, non-OFF_, CPC < 120, spend > 50K, link_clicks >= 5
- Create Scale_ clone with diversified audience if no recent clone exists
- Max 5 clones per cycle
- All creates PAUSED
"""

import json, os, sys, time
from datetime import datetime, timedelta
from pathlib import Path

# Ensure we're in the right directory for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.chdir(str(Path(__file__).resolve().parent.parent))

WIB = timedelta(hours=7)
today = (datetime.utcnow() + WIB).strftime("%Y-%m-%d")
today_mmdd = (datetime.utcnow() + WIB).strftime("%m%d")
three_days_ago = (datetime.utcnow() + WIB) - timedelta(days=3)

# ─── IMPORT ENGINE FUNCTIONS ───────────────────────────────────────────────
from vilona_trakpro_engine import (
    ACCESS_TOKEN, API, ACCOUNTS, log,
    fb_get, fb_post,
    create_scale_clone,
    DATA_DIR,
)

LOG_DIR = DATA_DIR
SCALE_LOG_FILE = LOG_DIR / f"scale_clone_log_{today}.json"

# ─── CHECKS ─────────────────────────────────────────────────────────────────
if not ACCESS_TOKEN or len(ACCESS_TOKEN) < 100:
    log(f"Invalid token: len={len(ACCESS_TOKEN) if ACCESS_TOKEN else 0}", "ERROR")
    print(json.dumps({"error": "Invalid Meta access token"}, indent=2))
    sys.exit(1)

log(f"META_ACCESS_TOKEN loaded: {len(ACCESS_TOKEN)} chars")
log(f"Scale clone log: {SCALE_LOG_FILE}")

# ─── LOAD EXISTING LOG ──────────────────────────────────────────────────────
existing_log = []
if SCALE_LOG_FILE.exists():
    try:
        with open(SCALE_LOG_FILE) as f:
            existing_log = json.load(f)
        log(f"Loaded {len(existing_log)} existing entries from today's log")
    except:
        existing_log = []

# ─── DISCOVER WINNERS PER ACCOUNT ───────────────────────────────────────────
def detect_taglink_from_name(name, tags):
    """Extract taglink from campaign name."""
    name_lower = name.lower()
    # Remove common prefixes
    for prefix in ["on_", "scale_", "lc_", "bc_", "tc_", "bidcap_", "cbo_", "abo_", "bid_", "off_", "dead_", "🌟_"]:
        if name_lower.startswith(prefix):
            name_lower = name_lower[len(prefix):]
    # Known Shopee tags that may not yet be fully registered in account config.
    # Keep this fallback for detection only; engine account tags should still be updated.
    known_tags = list(tags) + ["atayasetelankaosanak", "pintulipatgeser", "rakdapur3", "organizerpullout", "rakpiringpengering"]
    # Try each tag
    for tag in known_tags:
        tag_clean = tag.lower().replace("_", "").replace("-", "").replace("3","").replace("2","")
        if tag_clean in name_lower.replace("_", "").replace("-", ""):
            return tag
    # Fallback: first segment after prefix
    parts = name_lower.split("_")
    if parts:
        return parts[0]
    return None

def has_recent_clone(taglink, account_id):
    """
    Behandlung von Incomplete-Clone-Shells: Wenn ein Scale_-Campaign ohne Adsets/Ads existiert,
    killen wir es und behandeln das als 'kein vorhandener Clone'.
    """
    try:
        campaigns = fb_get(f"{account_id}/campaigns",
            fields="id,name,created_time,status", limit="200")
    except Exception as e:
        log(f"has_recent_clone: campaigns fetch failed: {e}", "WARN")
        return False

    incomplete = []
    for c in campaigns.get("data", []):
        cname = c.get("name", "")
        if not (cname.startswith(f"Scale_{taglink}_") or cname.startswith(f"LC_{taglink}_")):
            continue
        created = c.get("created_time", "")
        recent = True
        if created:
            try:
                created_dt = datetime.strptime(created[:10], "%Y-%m-%d")
                recent = created_dt >= three_days_ago.replace(tzinfo=None)
            except Exception:
                recent = True
        if not recent:
            continue
        try:
            time.sleep(2)
            adsets = fb_get(f"{c['id']}/adsets", fields="id,name,status", limit="5")
            if not adsets.get("data"):
                incomplete.append(c)
                continue
            time.sleep(2)
            ads = fb_get(f"{c['id']}/ads", fields="id,name,status", limit="5")
            if not ads.get("data"):
                incomplete.append(c)
                continue
            log(f"  ✔ Valid recent clone exists: {cname}")
            return True
        except Exception as e:
            log(f"  ⚠️ Clone completeness check failed for {cname}: {e}", "WARN")
            return True

    if incomplete:
        log(f"  🧹 Removing {len(incomplete)} incomplete recent clone shell(s) for {taglink}...")
        for c in incomplete:
            try:
                time.sleep(2)
                # Pause and delete shell; we intentionally don't delete the campaign object,
                # so we set it to PAUSED and proceed as if it never blocked us.
                fb_post(c["id"], status="PAUSED")
                log(f"     Paused incomplete clone: {c.get('name')} ({c.get('id')})")
            except Exception as e:
                log(f"     Handling incomplete clone failed: {e}", "WARN")
        return False
    return False

def main():
    # Filter enabled accounts only
    enabled_accounts = {k: v for k, v in ACCOUNTS.items() 
                        if v.get("enabled", True) and k in ("0858", "1041", "1134")}
    
    log(f"Scanning winners for accounts: {list(enabled_accounts.keys())}")
    
    all_results = []
    clone_count = 0
    max_clones = 5
    
    since_date = three_days_ago.strftime("%Y-%m-%d")
    until_date = today
    
    for acc_key, acc_cfg in enabled_accounts.items():
        acc_name = acc_cfg["name"]
        act_id = acc_cfg["id"]
        tags = acc_cfg.get("tags", [])
        
        log(f"\n{'='*60}")
        log(f"📊 Scanning {acc_name} ({acc_key}) — {act_id}")
        
        # Fetch campaign insights for 7 days
        try:
            insights = fb_get(f"{act_id}/campaigns",
                fields="id,name,status,daily_budget,lifetime_budget",
                limit="200")
        except Exception as e:
            log(f"Failed to fetch campaigns for {acc_key}: {e}", "ERROR")
            time.sleep(3)
            continue
        
        campaigns = insights.get("data", [])
        log(f"Found {len(campaigns)} campaigns")
        
        # Filter ACTIVE campaigns only
        active_campaigns = [c for c in campaigns if c.get("status") == "ACTIVE"]
        log(f"ACTIVE: {len(active_campaigns)}")
        
        # Get account-level campaign insights for last 7 days.
        # IMPORTANT: Meta v22 does NOT accept direct `link_clicks` field here;
        # parse link clicks from `actions` instead, same as engine.get_campaign_insights().
        winners = []
        try:
            time.sleep(2)  # Rate limit before insights call
            insights_resp = fb_get(f"{act_id}/insights",
                fields="campaign_name,campaign_id,spend,clicks,impressions,cpc,ctr,reach,actions",
                time_range=json.dumps({"since": since_date, "until": until_date}),
                level="campaign",
                limit="200")
            insights_by_id = {}
            for d in insights_resp.get("data", []):
                link_clicks = 0
                for a in d.get("actions", []):
                    if a.get("action_type") == "link_click":
                        try:
                            link_clicks = int(float(a.get("value", 0)))
                        except Exception:
                            link_clicks = 0
                d["_link_clicks"] = link_clicks
                insights_by_id[d.get("campaign_id")] = d
            log(f"Insights rows: {len(insights_by_id)}")

            for camp in active_campaigns:
                cid = camp["id"]
                cname = camp.get("name", "")
                
                # Skip OFF_ campaigns
                if cname.startswith("OFF_") or cname.startswith("DEAD_"):
                    continue
                
                d = insights_by_id.get(cid)
                if not d:
                    continue
                
                spend = float(d.get("spend", 0))
                cpc = float(d.get("cpc", 0))
                link_clicks = int(d.get("_link_clicks", 0))
                clicks = int(d.get("clicks", 0))
                
                # CPC < 120 hard KPI
                if cpc >= 120:
                    log(f"  ❌ {cname[:35]} — CPC {cpc:.0f} >= 120, skip")
                    continue
                
                # Spend > 50K
                if spend < 50000:
                    log(f"  ⏳ {cname[:35]} — spend Rp{spend:,.0f} < 50rb, skip")
                    continue
                
                # Link clicks >= 5
                if link_clicks < 5:
                    log(f"  ⏳ {cname[:35]} — link_clicks {link_clicks} < 5, skip")
                    continue
                
                # It's a winner!
                winners.append({
                    "campaign": camp,
                    "spend": spend,
                    "cpc": cpc,
                    "link_clicks": link_clicks,
                    "clicks": clicks,
                })
                log(f"  ✅ WINNER: {cname[:40]} — CPC {cpc:.0f} | spend Rp{spend:,.0f} | clicks {link_clicks}")
                
        except Exception as e:
            log(f"Error during insights fetch: {e}", "ERROR")
            time.sleep(3)
            continue
        
        log(f"{acc_name}: {len(winners)} winners found")
        
        # ─── PROCESS WINNERS → CREATE CLONES ──────────────────────────────
        for w in winners:
            if clone_count >= max_clones:
                log(f"\nReached max {max_clones} clones for this cycle. Stopping.")
                break
            
            camp = w["campaign"]
            cname = camp.get("name", "")
            cid = camp.get("id", "")
            
            # Detect taglink
            taglink = detect_taglink_from_name(cname, tags)
            if not taglink:
                log(f"  ⚠️ Cannot detect taglink for {cname[:35]}, skip")
                continue
            
            log(f"\n  🔍 Taglink detected: {taglink}")
            
            # Check if clone already exists
            time.sleep(1.5)
            if has_recent_clone(taglink, act_id):
                log(f"  ⏭️ Scale_{taglink}_ clone already exists in last 3 days, skip")
                continue
            
            # Create clone!
            log(f"  🧬 Creating Scale_{taglink}_ clone...")
            time.sleep(2)  # Rate limit
            
            try:
                new_camp_id = create_scale_clone(camp, act_id, acc_cfg)
            except Exception as e:
                log(f"  ❌ clone creation error: {e}", "ERROR")
                import traceback
                traceback.print_exc()
                continue
            
            if new_camp_id:
                clone_count += 1
                entry = {
                    "timestamp": (datetime.utcnow() + WIB).strftime("%Y-%m-%d %H:%M:%S"),
                    "account": acc_key,
                    "account_name": acc_name,
                    "original_campaign": cname,
                    "original_campaign_id": cid,
                    "clone_campaign_id": new_camp_id,
                    "clone_name": f"Scale_{taglink}_*",
                    "taglink": taglink,
                    "status": "PAUSED",
                }
                all_results.append(entry)
                log(f"  ✅ SCALE CLONE CREATED (PAUSED): {new_camp_id}")
            else:
                log(f"  ❌ Failed to create clone for {cname[:35]}")
    
    # ─── SAVE LOG ──────────────────────────────────────────────────────────
    merged_log = existing_log + all_results
    
    # Deduplicate by clone_campaign_id
    seen_ids = set()
    unique_log = []
    for entry in merged_log:
        cid = entry.get("clone_campaign_id")
        if cid and cid not in seen_ids:
            seen_ids.add(cid)
            unique_log.append(entry)
        elif not cid:
            unique_log.append(entry)
    
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(SCALE_LOG_FILE, "w") as f:
        json.dump(unique_log, f, indent=2, ensure_ascii=False)
    
    log(f"\n{'='*60}")
    log(f"📝 SCALE CLONE LOG SAVED: {SCALE_LOG_FILE}")
    log(f"Today's new clones: {len(all_results)}")
    log(f"Total log entries: {len(unique_log)}")
    
    # ─── PRINT SUMMARY ────────────────────────────────────────────────────
    summary = {
        "date": today,
        "accounts_scanned": list(enabled_accounts.keys()),
        "total_new_clones": len(all_results),
        "max_clones_per_cycle": max_clones,
        "clones": all_results,
        "log_file": str(SCALE_LOG_FILE),
    }
    
    print("\n" + "=" * 60)
    print("🏆 SCALE AUTO-CLONE SUMMARY")
    print("=" * 60)
    for entry in all_results:
        print(f"  ✅ [{entry['account']}/{entry['account_name']}] "
              f"Scale_{entry['taglink']}_* → {entry['clone_campaign_id']} (PAUSED)")
    if not all_results:
        print("  ℹ️ No new clones created this cycle")
    print(f"\n📄 Log: {SCALE_LOG_FILE}")
    print(f"⏰ Time: {(datetime.utcnow() + WIB).strftime('%Y-%m-%d %H:%M:%S WIB')}")

if __name__ == "__main__":
    main()
