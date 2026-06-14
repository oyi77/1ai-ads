#!/usr/bin/env python3
"""MACRO GOVERNOR — Layer 4: Account-Level Spending Cap (daily 00:05 WIB)"""
import json, os, csv, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).parent))
from trakpro_vilona import api as fb_get, ACCOUNTS as TRAKPRO_ACCOUNTS

WIB = timezone(timedelta(hours=7))
NOW = datetime.now(WIB)
TODAY = NOW.date()

PROJECT_DIR = Path(__file__).parent.parent
DATA_DIR = PROJECT_DIR / "data"
SHOPEE_DIR = DATA_DIR / "shopee"
STATE_FILE = DATA_DIR / "macro_governor_state.json"
LOG_FILE = PROJECT_DIR / "logs" / "macro_governor.log"
os.makedirs(PROJECT_DIR / "logs", exist_ok=True)

# ─── ACCOUNT MAP (trakpro → macro) ──────────────────────────────────
BASE_CAP = 300000
# 🔴 FOCUS ACCOUNTS (Veris, 13 June 2026)
ACCOUNTS = {
    "0858":      {"act_id": "act_435670549443081", "name": "Kakriput",  "csv_prefix": "selow0858"},
    "1041":      {"act_id": "act_380721031313330", "name": "Nyamiresep","csv_prefix": "nyamiresep"},
    "1134":       {"act_id": "act_1773760133153789", "name": "Selow",     "csv_prefix": "selow1134"},
    "glowscent":  {"act_id": "act_2125021885010866", "name": "Glowscent", "csv_prefix": "glowscent"},
}

# ─── EVENT CALENDAR ──────────────────────────────────────────────────
def is_twin_date(d):
    return d.month == d.day

def is_payday(d):
    return d.day >= 25 or d.day == 1

def is_event_day(d):
    return is_twin_date(d) or is_payday(d)

def is_event_eve(d):
    return is_event_day(d + timedelta(days=1))

def is_post_event(d):
    return is_event_day(d - timedelta(days=1)) and not is_event_day(d)

# ─── SHOPEE COMMISSION ───────────────────────────────────────────────
def load_commission(prefix):
    total = 0.0
    found = False
    for i in range(7):
        dt = (TODAY - timedelta(days=i)).strftime("%Y-%m-%d")
        p = SHOPEE_DIR / f"{prefix}_{dt}.csv"
        if p.exists():
            found = True
            try:
                with open(p, "r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        try:
                            comm = float(row.get("Komisi Bersih Affiliate (Rp)", "0").replace(",", "") or 0)
                        except:
                            comm = 0
                        if row.get("Status Pesanan", "") == "Selesai":
                            total += comm
            except:
                pass
    return total, found

# ─── GOVERNOR LOGIC ──────────────────────────────────────────────────
# ─── GHOST PROTOCOL: Fetch ALL campaigns including deleted/archived ──
def fetch_all_campaigns(act_id):
    """Fetch ALL campaigns including deleted/archived via filtering."""
    all_camps = []
    params = {
        'fields': 'id,name,status,effective_status',
        'limit': 500,
        'filtering': json.dumps([{
            'field': 'effective_status',
            'operator': 'IN',
            'value': ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED']
        }]),
    }
    data = fb_get(f'{act_id}/campaigns', params)
    all_camps.extend(data.get('data', []))
    while 'paging' in data and 'next' in data.get('paging', {}):
        import urllib.request
        req = urllib.request.Request(data['paging']['next'])
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read())
            all_camps.extend(data.get('data', []))
        except:
            break
    return all_camps

def count_campaigns(all_camps):
    """Count campaigns by effective_status including Graveyard (DELETED/ARCHIVED)."""
    active = sum(1 for c in all_camps if c.get('effective_status') == 'ACTIVE' and not c['name'].startswith('OFF_'))
    paused = sum(1 for c in all_camps if c.get('effective_status') == 'PAUSED' and not c['name'].startswith('OFF_'))
    off = sum(1 for c in all_camps if c['name'].startswith('OFF_'))
    deleted = sum(1 for c in all_camps if c.get('effective_status') in ('DELETED', 'ARCHIVED'))
    return active, paused, off, deleted

def evaluate_account(key, cfg):
    """Evaluate 7-day ROI and determine new cap."""
    act_id = cfg["act_id"]
    name = cfg["name"]

    prev_state = {}
    if STATE_FILE.exists():
        try:
            prev_state = json.loads(STATE_FILE.read_text()).get(key, {})
        except:
            pass

    current_cap = prev_state.get("current_cap", BASE_CAP)

    # GHOST PROTOCOL: Fetch ALL campaigns
    all_camps = fetch_all_campaigns(act_id)
    active, paused, off, deleted = count_campaigns(all_camps)

    since = (TODAY - timedelta(days=7)).strftime("%Y-%m-%d")
    until = TODAY.strftime("%Y-%m-%d")

    insights = fb_get(f"{act_id}/insights", {
        "fields": "spend,clicks,cpc",
        "time_range": json.dumps({"since": since, "until": until}),
        "level": "account",
        "filtering": json.dumps([{
            "field": "campaign.effective_status",
            "operator": "IN",
            "value": ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"]
        }]),
    })

    if "error" in insights:
        return {"account": key, "name": name, "error": str(insights["error"]),
                "current_cap": current_cap, "action": "ERROR"}
    
    data = insights.get("data", [])
    if not data:
        return {"account": key, "name": name, "spend_7d": 0, "clicks_7d": 0,
                "cpc_global": 0, "commission_7d": 0, "roi": 0,
                "current_cap": current_cap, "new_cap": current_cap, "action": "NO_DATA",
                "reason": "No insight data"}
    
    d = data[0]
    spend = float(d.get("spend", 0))
    clicks = int(d.get("clicks", 0))
    cpc = float(d.get("cpc", 0))
    
    commission, _ = load_commission(cfg["csv_prefix"])
    roi = round(commission / spend, 2) if spend > 0 else 0
    
    new_cap = current_cap
    action = "HOLD"
    reason = ""
    
    if is_event_eve(TODAY):
        if roi >= 1.5 and spend > 0:
            new_cap = current_cap * 2
            action = "EVENT_2X"
            reason = f"H-1 Event day, ROI {roi:.2f}x >= 1.5"
        else:
            action = "EVENT_SKIP"
            reason = f"H-1 Event day, ROI {roi:.2f}x < 1.5 — defensive"
    elif is_post_event(TODAY):
        new_cap = BASE_CAP
        action = "EVENT_END"
        reason = "Post-event, return to base"
    elif is_event_day(TODAY):
        if roi >= 1.5 and spend > 0:
            action = "EVENT_HOLD"
            reason = f"Event day, ROI {roi:.2f}x >= 1.5, keep 2x"
        else:
            new_cap = min(current_cap, 200000)
            action = "EVENT_DEFEND"
            reason = f"Event day, ROI {roi:.2f}x < 1.5, clamp Rp200K"
    else:
        if roi > 2.0 and spend > 50000:
            new_cap = int(current_cap * 1.5)
            action = "RAISE"
            reason = f"ROI {roi:.2f}x > 2.0 → +50%"
        elif roi >= 1.5 or spend == 0:
            action = "HOLD"
            reason = f"ROI {roi:.2f}x 1.5-2.0, sustain"
        elif roi < 1.5 and cpc > 120:
            new_cap = 200000
            action = "LOWER"
            reason = f"ROI {roi:.2f}x < 1.5 + CPC Rp{cpc:.0f} > Rp120"
        else:
            action = "HOLD"
            reason = f"ROI {roi:.2f}x, CPC Rp{cpc:.0f} OK"
    
    return {
        "account": key, "name": name,
        "spend_7d": int(spend), "clicks_7d": clicks,
        "cpc_global": int(cpc), "commission_7d": int(commission),
        "roi": roi,
        "active": active, "paused": paused, "OFF_": off, "GRAVEYARD": deleted,
        "prev_cap": current_cap, "new_cap": new_cap,
        "action": action, "reason": reason,
    }

# ─── LOG ─────────────────────────────────────────────────────────────
def log(msg):
    ts = NOW.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except:
        pass

# ─── MAIN ────────────────────────────────────────────────────────────
import time as _time

def morning_reset():
    """PROTOCOL 14: Elite Wake Up Sequence — smart unpause max 15 per account."""
    from pathlib import Path as _P
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).parent))
    from trakpro_vilona import api_post, api as fb_get

    cb_files = {
        "0858": _P("/tmp") / "0858_cb_state.json",
        "1041": _P("/tmp") / "1041_cb_state.json",
    }
    total_purged = 0
    total_awake = 0
    
    for key, cb_file in cb_files.items():
        if not cb_file.exists():
            continue
        try:
            state = json.loads(cb_file.read_text())
            ids = state.get("paused_ids", [])
            cap = state.get("cap", 0)
            spend_yesterday = state.get("spend", 0)
            cb_date = state.get("date", "?")
            
            if not ids:
                cb_file.unlink()
                continue
            
            cfg = ACCOUNTS.get(key)
            if not cfg:
                continue
            
            act_id = cfg["act_id"]
            log(f"  ⚡ ELITE WAKE {key}: {len(ids)} candidates from {cb_date} (cap={cap} spend={spend_yesterday})")
            
            # Fetch H-1 insights for all paused IDs
            yesterday = (TODAY - timedelta(days=1)).isoformat()
            h1_insights = {}
            for i in range(0, len(ids), 20):
                chunk = ids[i:i+20]
                data = fb_get(f"{act_id}/insights", {
                    "fields": "campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions",
                    "time_range": json.dumps({"since": yesterday, "until": yesterday}),
                    "level": "campaign", "limit": 100,
                    "filtering": json.dumps([{"field":"campaign.id","operator":"IN","value":chunk}]),
                })
                for row in data.get("data", []):
                    h1_insights[row["campaign_id"]] = row
                _time.sleep(0.5)
            
            # Load Shopee commission for ROI calc
            from collections import defaultdict
            commission, _ = load_commission(cfg["csv_prefix"])
            total_7d_spend = 0
            # Get 7D spend for ROI per campaign
            ins_7d = fb_get(f"{act_id}/insights", {
                "fields": "spend",
                "time_range": json.dumps({"since": (TODAY-timedelta(days=7)).isoformat(), "until": TODAY.isoformat()}),
                "level": "account",
            })
            for r in ins_7d.get("data", []):
                total_7d_spend = float(r.get("spend", 0))
            global_roi = commission / total_7d_spend if total_7d_spend > 0 else 0
            
            # Also fetch campaign names from API
            camp_names = {}
            for i in range(0, len(ids), 50):
                chunk = ids[i:i+50]
                camp_data = fb_get(f"{act_id}/campaigns", {
                    "fields": "id,name",
                    "filtering": json.dumps([{"field":"id","operator":"IN","value":chunk}]),
                    "limit": 50,
                })
                for c in camp_data.get("data", []):
                    camp_names[c["id"]] = c["name"]
                time.sleep(0.5)
            
            # ═══════ PROTOCOL 14: ELITE WAKE UP ═══════
            tier_vip = []      # 🌟 WINNER + ROI > 1.5x
            tier_healthy = []  # CPC ≤ 120 + CTR > 1.5%
            tier_seeders = []  # CPC ≤ 120, ranked by CTR
            purged = []        # CPC > 120 → OFF_
            
            for cid in ids:
                ins = h1_insights.get(cid, {})
                cpc = float(ins.get("cpc", 999))
                ctr = float(ins.get("ctr", 0))
                name = camp_names.get(cid, f"camp_{cid}")
                is_winner = name.startswith("🌟_")
                
                # THE PURGE — CPC > 120 = instant OFF_
                if cpc > 120:
                    purged.append((cid, name, cpc))
                    continue
                
                # Priority 1: VIP (Winner + good ROI)
                if is_winner and global_roi > 1.5:
                    tier_vip.append((cid, name, ctr, cpc, "VIP"))
                # Priority 2: Healthy
                elif ctr > 1.5:
                    tier_healthy.append((cid, name, ctr, cpc, "Healthy"))
                # Priority 3: Seeders (CPC OK, min CTR 1.0%)
                elif ctr >= 1.0:
                    tier_seeders.append((cid, name, ctr, cpc, "Seeder"))
                # Below 1.0% CTR → stay PAUSED (reserve)
            
            # Sort by CTR descending within tiers
            tier_healthy.sort(key=lambda x: x[2], reverse=True)
            tier_seeders.sort(key=lambda x: x[2], reverse=True)
            
            # CASCADE: fill top 15
            awake = []
            for tier in [tier_vip, tier_healthy, tier_seeders]:
                slots_left = 15 - len(awake)
                if slots_left <= 0: break
                awake.extend(tier[:slots_left])
            
            # EXECUTE PURGE — rename to OFF_
            for cid, name, cpc in purged:
                try:
                    api_post(f"{act_id}/{cid}", {"status": "PAUSED"})
                    time.sleep(0.3)
                    new_name = name if name.startswith("OFF_") else f"OFF_{name}"
                    api_post(f"{act_id}/{cid}", {"name": new_name})
                    time.sleep(0.3)
                except: pass
            
            # EXECUTE WAKE — activate top 15
            for cid, name, ctr, cpc, tier in awake:
                try:
                    api_post(f"{act_id}/{cid}", {"status": "ACTIVE"})
                    time.sleep(0.3)
                except: pass
            
            log(f"    💀 Purged: {len(purged)} | ⭐ VIP: {len(tier_vip)} | ✅ Healthy: {len(tier_healthy)} | 🌱 Seeders: {len(tier_seeders)}")
            log(f"    🔥 Activated: {len(awake)} | 💤 Reserve: {len(ids)-len(purged)-len(awake)}")
            
            total_purged += len(purged)
            total_awake += len(awake)
            cb_file.unlink()
            
        except Exception as e:
            log(f"  ⚠️ ELITE WAKE error {key}: {e}")
    
    return total_purged, total_awake

def main():
    log("MACRO GOVERNOR — Layer 4")
    log(f"Date: {TODAY} | Event: {is_event_day(TODAY)} | Eve: {is_event_eve(TODAY)}")
    
    # PROTOCOL 14: Elite Wake Up — smart selective unpause
    purged, awake = morning_reset()
    if purged or awake:
        log(f"⚡ Elite Wake: {awake} activated, {purged} purged to OFF_")
    
    state = {}
    lines = []
    
    for key, cfg in ACCOUNTS.items():
        try:
            r = evaluate_account(key, cfg)
            state[key] = r
            
            icon = {"RAISE":"📈","EVENT_2X":"🔥","HOLD":"➡️","EVENT_HOLD":"🔥",
                    "LOWER":"📉","EVENT_DEFEND":"🛡️","EVENT_SKIP":"⏭️",
                    "EVENT_END":"↩️","ERROR":"❌","NO_DATA":"💤"}.get(r["action"],"➡️")
            
            chg = ""
            if r.get("new_cap") != r.get("prev_cap"):
                chg = f" Rp{r['prev_cap']:,.0f} → Rp{r['new_cap']:,.0f}"
            
            lines.append(
                f"{icon} **{cfg['name']}** — {r['action']}{chg}\n"
                f"   Active: {r.get('active','?')} | Paused: {r.get('paused','?')} | OFF_: {r.get('OFF_','?')} | 💀 Deleted: {r.get('GRAVEYARD','?')}\n"
                f"   Spend: Rp{r.get('spend_7d',0):,.0f} | Comm: Rp{r.get('commission_7d',0):,.0f} | "
                f"ROI: {r.get('roi',0):.2f}x | CPC: Rp{r.get('cpc_global',0):,.0f}\n"
                f"   _{r.get('reason','')}_"
            )
            
            log(f"  {cfg['name']}: {r['action']} cap={r.get('prev_cap')}→{r.get('new_cap')} "
                f"roi={r.get('roi')} cpc={r.get('cpc_global')}")
        except Exception as e:
            log(f"  ERROR {cfg['name']}: {e}")
            state[key] = {"error": str(e)}
    
    STATE_FILE.write_text(json.dumps(state, indent=2, default=str))
    
    event_note = ""
    if is_event_eve(TODAY):
        event_note = f"\n⚠️ **H-1 EVENT** — ({TODAY+timedelta(days=1)}) multiplier check!\n"
    elif is_event_day(TODAY):
        event_note = f"\n🔥 **EVENT DAY** — 2x cap active!\n"
    elif is_post_event(TODAY):
        event_note = f"\n↩️ **POST-EVENT** — Back to base\n"
    
    report = f"🏛️ **MACRO GOVERNOR — {TODAY:%d %b %Y}**{event_note}\n" + "\n\n".join(lines)
    report += f"\n\n⚖️ Base: Rp{BASE_CAP:,}/d | L1 CPC wins | Event: Payday(25-1)+Twin"
    
    log("DONE")
    return report, state

if __name__ == "__main__":
    r, s = main()
    print(r)
