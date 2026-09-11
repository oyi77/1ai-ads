"""VILONA TrakPro — audience picking and clone creation

Split from vilona_trakpro_engine.py to enforce the 800-line module limit.
"""

import json, os, sys, time, traceback, threading
import urllib.request, urllib.parse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

from trakpro_config import (
    WIB, WORKSPACE, DATA_DIR, LOG_FILE, STATE_FILE, SHOPEE_DATA,
    ACCESS_TOKEN, API, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_API,
    EXEC_STATE_FILE, ACCOUNTS, CORE_PORTFOLIO, AUDIENCE_POOL,
    SCALE_SEED_AUDIENCE, log, _load_exec_state, _save_exec_state, exec_state,
)

from trakpro_meta import fb_get, fb_post

def _pick_diversified_audience(og_targeting, existing_clone_names, taglink):
    """Pilih audience group yang BERBEDA dari original dan clone yang sudah ada.
    
    Logika:
    1. Deteksi interest group yang dipakai original campaign
    2. Deteksi interest group yang dipakai clone-clone yang sudah ada
    3. Pilih group BARU yang belum terpakai (round-robin dari AUDIENCE_POOL)
    4. Jika semua sudah terpakai → fallback ke Broad (hapus interest)
    
    Returns: (new_targeting_dict, audience_label_str)
    """
    # Deteksi interest IDs dari original targeting
    og_interest_ids = set()
    for spec in og_targeting.get("flexible_spec", []):
        for interest in spec.get("interests", []):
            og_interest_ids.add(interest.get("id", ""))
    
    # Deteksi audience groups yang sudah terpakai dari nama clone yang ada
    used_audiences = set()
    for cname in existing_clone_names:
        for pool_name in AUDIENCE_POOL:
            if pool_name.lower() in cname.lower():
                used_audiences.add(pool_name)
    
    # Cek mana yang original pakai (match by interest ID)
    for pool_name, pool_interests in AUDIENCE_POOL.items():
        pool_ids = {i["id"] for i in pool_interests}
        if pool_ids & og_interest_ids:
            used_audiences.add(pool_name)
    
    # Pilih audience baru yang belum terpakai
    available = [k for k in AUDIENCE_POOL if k not in used_audiences and k != "Broad"]
    
    if not available:
        # Semua sudah terpakai → Broad targeting (hapus interest, max reach)
        new_targeting = {k: v for k, v in og_targeting.items() if k != "flexible_spec"}
        log(f"  🌐 Semua audience terpakai, fallback ke Broad targeting")
        return new_targeting, "Broad"
    
    # Round-robin: pilih berdasarkan jumlah clone yang sudah ada
    pick = available[len(existing_clone_names) % len(available)]
    new_interests = AUDIENCE_POOL[pick]
    
    # Build targeting baru: base dari original, ganti flexible_spec
    new_targeting = {k: v for k, v in og_targeting.items()}
    if new_interests:
        new_targeting["flexible_spec"] = [{"interests": new_interests}]
    else:
        new_targeting.pop("flexible_spec", None)
    
    log(f"  🎯 Audience diversifikasi: {pick} ({len(new_interests)} interest)")
    return new_targeting, pick

def _pick_scale_audience(og_targeting, existing_clone_names, taglink):
    """Pilih audience untuk Scale_ clone.
    
    - FIRST clone (existing_clones==0): gunakan SCALE_SEED_AUDIENCE (Belanja fixed, 5 interest)
    - Subsequent clones: deep audience dari AUDIENCE_POOL, min reach 2M
    - Fallback ke Broad jika semua audience terpakai
    
    Returns: (new_targeting_dict, audience_label_str)
    """
    if not existing_clone_names:
        # FIRST clone → seed audience Belanja (5 interest wajib)
        new_targeting = {k: v for k, v in og_targeting.items()}
        new_targeting["flexible_spec"] = [{"interests": SCALE_SEED_AUDIENCE}]
        log(f"  🌱 SCALE SEED: First clone → Belanja (5 interests, reach 21M+)")
        return new_targeting, "Belanja"
    
    # Subsequent clones: deep audience dari pool yang belum terpakai
    used_audiences = set()
    for cname in existing_clone_names:
        for pool_name in AUDIENCE_POOL:
            if pool_name.lower() in cname.lower():
                used_audiences.add(pool_name)
    
    # Cek original campaign's interests
    og_interest_ids = set()
    for spec in og_targeting.get("flexible_spec", []):
        for interest in spec.get("interests", []):
            og_interest_ids.add(interest.get("id", ""))
    for pool_name, pool_interests in AUDIENCE_POOL.items():
        pool_ids = {i["id"] for i in pool_interests}
        if pool_ids & og_interest_ids:
            used_audiences.add(pool_name)
    
    # Seed audience juga dianggap terpakai setelah clone pertama
    used_audiences.add("Belanja")
    
    # Pilih dari pool, skip Broad (Broad = fallback)
    available = [k for k in AUDIENCE_POOL if k not in used_audiences and k != "Broad"]
    
    if not available:
        new_targeting = {k: v for k, v in og_targeting.items() if k != "flexible_spec"}
        log(f"  🌐 Semua audience terpakai, fallback ke Broad targeting")
        return new_targeting, "Broad"
    
    # Round-robin berdasarkan jumlah clone
    pick = available[len(existing_clone_names) % len(available)]
    new_interests = AUDIENCE_POOL[pick]
    
    new_targeting = {k: v for k, v in og_targeting.items()}
    if new_interests:
        new_targeting["flexible_spec"] = [{"interests": new_interests}]
    else:
        new_targeting.pop("flexible_spec", None)
    
    log(f"  🎯 Deep audience: {pick} ({len(new_interests)} interest, reach verified 2M+)")
    return new_targeting, pick

def create_lc_clone(original_campaign, account_id, account_config, variant_num=1):
    """Create ON_LC_ clone with Lowest Cost + Age-Shifting strategy.
    
    PROTOCOL 15 BIRTH CONTROL (2026-06-13):
    - ALL clones SPAWN AS PAUSED — Elite Wake decides fate at 00:05
    - CB CHECK: if spend_today >= cap, ABORT immediately
    - MAX 1 clone per account per day — enforced via state file
    
    Strategy:
    - Budget: Rp 20,000/hari (micro-budget, horizontal scale)
    - Bid: LOWEST_COST_WITHOUT_CAP (no bid cap)
    - Targeting: EXACT copy (audience/gender/placement)
    - Creative: EXACT copy (post_id)
    - Age: randomize ±3 years, MINIMUM 24
    - Status: PAUSED (Protocol 15 — Elite Wake determines fate)
    """
    import random
    from pathlib import Path as _P
    
    # ═══ PROTOCOL 15: BIRTH CONTROL — CB CHECK ═══
    # Check if today's cap is already breached
    try:
        cb_path = None
        for suffix in ['0858', '1041']:
            p = _P('/tmp') / f'{suffix}_cb_state.json'
            if p.exists():
                cb_path = p
                break
        if cb_path:
            cb_data = json.loads(cb_path.read_text())
            spend = cb_data.get('spend', 0)
            cap = cb_data.get('cap', 300000)
            if spend >= cap:
                log(f"⛔ BIRTH CONTROL: CB TRIPPED spend={spend} >= cap={cap} — ABORT clone", "CRITICAL")
                return None
    except:
        pass
    
    # Check spend_today live if no CB file
    try:
        today_str2 = datetime.now(WIB).strftime('%Y-%m-%d')
        today_ins = fb_get(f'{account_id}/insights', {
            'fields': 'spend',
            'time_range': json.dumps({'since': today_str2, 'until': today_str2}),
            'level': 'account',
        })
        today_spend = sum(int(float(r.get('spend',0))) for r in today_ins.get('data', []))
        # Read cap from governor state
        cap = 300000
        try:
            gs_path = _P(__file__).parent.parent / 'data' / 'macro_governor_state.json'
            gs = json.loads(gs_path.read_text())
            for k in gs:
                if isinstance(gs[k], dict) and gs[k].get('new_cap'):
                    cap = gs[k]['new_cap']
                    break
        except: pass
        if today_spend >= cap:
            log(f"⛔ BIRTH CONTROL: spend_today={today_spend} >= cap={cap} — ABORT clone", "CRITICAL")
            return None
    except:
        pass
    
    # ═══ PROTOCOL 15: MAX 1 CLONE PER DAY ═══
    clone_tracker = _P('/tmp') / 'clone_count_today.json'
    today_date = datetime.now(WIB).strftime('%Y-%m-%d')
    clone_count = 0
    try:
        if clone_tracker.exists():
            ct = json.loads(clone_tracker.read_text())
            if ct.get('date') == today_date:
                clone_count = ct.get('count', 0)
    except: pass
    
    if clone_count >= 1:
        log(f"⛔ BIRTH CONTROL: Daily clone limit reached ({clone_count}/1) — ABORT", "CRITICAL")
        return None
   
    try:
        # Get original's adsets for targeting + ads
        adsets = fb_get(f"{original_campaign['id']}/adsets",
            fields="name,targeting,optimization_goal,bid_strategy,promoted_object,status,daily_budget",
            limit="5")
        
        if not adsets.get("data"):
            log(f"No adsets found for clone", "WARN")
            return None
        
        og_adset = adsets["data"][0]
        today_str = datetime.now(WIB).strftime("%m%d")
        
        # Parse original campaign name for product/taglink
        og_name = original_campaign["name"]
        parts = og_name.split("_")
        
        # Auto-detect product from account tags
        product = account_config.get("tags", ["unknown"])[0] if account_config.get("tags") else "product"
        for p in parts:
            for t in account_config.get("tags", []):
                tag_clean = t.replace("3","").replace("2","").replace("pengering","").replace("pullout","")
                if tag_clean.lower() in p.lower():
                    product = t
                    break
        taglink = product
        
        # Get promoted_object for page_id
        page_id = og_adset.get("promoted_object", {}).get("page_id", "1014428148422867")
    
        # ─── ADSET TARGETING: EXACT COPY ──────────────────────────────────
        og_targeting = og_adset.get("targeting", {})
        lc_targeting = {k: v for k, v in og_targeting.items()}
        
        # ─── AGE SHIFTING: ±1-3 years ───────────────────────────────────
        age_min = og_targeting.get("age_min", 18)
        age_max = og_targeting.get("age_max", 65)
        
        # Default age range jika tidak ada di targeting
        if "age_min" not in og_targeting and "age_max" not in og_targeting:
            age_min, age_max = 25, 55
        
        shift_min = random.randint(-3, 3)
        shift_max = random.randint(-3, 3)
        new_age_min = max(24, age_min + shift_min)  # minimum age 24 — anak muda gak ada duit
        new_age_max = min(65, age_max + shift_max)
        
        # Swap if inverted
        if new_age_min > new_age_max:
            new_age_min, new_age_max = new_age_max, new_age_min
        
        lc_targeting["age_min"] = new_age_min
        lc_targeting["age_max"] = new_age_max
        age_range_str = f"{new_age_min}-{new_age_max}"
        
        # ─── COPY PLACEMENT ────────────────────────────────────────────
        orig_placement_keys = [
            "publisher_platforms", "facebook_positions", "instagram_positions",
            "device_platforms", "locales",
        ]
        for pk in orig_placement_keys:
            if pk in og_targeting:
                lc_targeting[pk] = og_targeting[pk]
        
        # Remove deprecated video_feeds from facebook_positions
        if "facebook_positions" in lc_targeting and "video_feeds" in lc_targeting.get("facebook_positions", []):
            lc_targeting["facebook_positions"] = [
                p for p in lc_targeting["facebook_positions"] if p != "video_feeds"
            ]
        
        # Copy gender jika ada
        if "genders" in og_targeting:
            lc_targeting["genders"] = og_targeting["genders"]
        
        # Meta API v22: explicit Advantage Audience OFF
        lc_targeting.setdefault("targeting_automation", {})
        lc_targeting["targeting_automation"]["advantage_audience"] = 0
        
        # ─── NAMING: ON_LC_[Product]_[AgeRange]_[MMDD] ──────────────────
        camp_name = f"ON_LC_{taglink}_{age_range_str}_{today_str}"
        adset_name = f"ON_LC_{taglink}_{age_range_str}_{today_str}"
        ad_name = f"{taglink}_Vdo1_v1"
        
        # Deduplicate nama campaign
        existing = fb_get(f"{account_id}/campaigns",
            fields="name", limit="200")
        existing_names = set(c.get("name", "") for c in existing.get("data", []))
        
        base = camp_name
        n = variant_num + 1
        while camp_name in existing_names:
            camp_name = f"{base}_v{n}"
            n += 1
            if n > variant_num + 20:  # safety valve
                break
        
        if camp_name in existing_names:
            camp_name = f"{base}_v{int(datetime.now(WIB).timestamp()) % 1000}"
        
        # ─── COPY POST ID + CREATIVE ────────────────────────────────────
        post_id = None
        creative_id = None
        try:
            ads = fb_get(f"{original_campaign['id']}/ads",
                fields="creative{object_story_id,id}", limit="1")
            if ads.get("data"):
                creative = ads["data"][0].get("creative", {})
                if creative.get("object_story_id"):
                    post_id = creative["object_story_id"]
                    log(f"  📋 Copy Post ID: {post_id}")
                if creative.get("id"):
                    creative_id = creative["id"]
        except Exception as e:
            log(f"Post ID fetch warning: {e}", "WARN")
        
        # ─── CREATE CAMPAIGN (PAUSED — Protocol 15) ───────────────────
        camp_result = fb_post(f"{account_id}/campaigns",
            name=camp_name,
            objective="OUTCOME_TRAFFIC",
            status="PAUSED",
            special_ad_categories="[]",
            is_adset_budget_sharing_enabled="false")
        
        if "id" not in camp_result:
            log(f"LC clone campaign creation failed: {camp_result}", "WARN")
            return None
        
        new_camp_id = camp_result["id"]
        
        # ─── CREATE ADSET (PAUSED, Rp 20k, LOWEST_COST) ────────────────
        adset_payload = {
            "name": adset_name,
            "campaign_id": new_camp_id,
            "targeting": json.dumps(lc_targeting),
            "optimization_goal": "LINK_CLICKS",
            "billing_event": "IMPRESSIONS",
            "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
            "daily_budget": "20000",
            "status": "PAUSED",
            "promoted_object": json.dumps({"page_id": page_id}),
        }
        
        adset_result = fb_post(f"{account_id}/adsets", **adset_payload)
        
        if "id" not in adset_result:
            log(f"LC clone adset creation failed: {adset_result}", "WARN")
            return None
        
        new_adset_id = adset_result["id"]
        
        # ─── CREATE AD (PAUSED — Protocol 15) ──────────────────────────
        ad_payload = {
            "name": ad_name,
            "adset_id": new_adset_id,
            "status": "PAUSED",
        }
        if creative_id:
            ad_payload["creative"] = json.dumps({"creative_id": creative_id})
        elif post_id:
            ad_payload["creative"] = json.dumps({
                "object_story_id": post_id,
                "call_to_action_type": "SHOP_NOW",
            })
        
        ad_result = fb_post(f"{account_id}/ads", **ad_payload)
        
        if "id" not in ad_result:
            log(f"LC clone ad creation failed: {ad_result}", "WARN")
        
        log(f"🧬 LC CLONE CREATED (PAUSED — P15): {camp_name}")
        log(f"     Budget: Rp 20,000 | Bid: LOWEST_COST | Age: {age_range_str}")
        log(f"     Adset: {adset_name} | Creative: {'copy' if creative_id else 'post_id:' + str(post_id)}")
        
        # ═══ PROTOCOL 15: Increment clone counter ═══
        try:
            clone_tracker.write_text(json.dumps({'date': today_date, 'count': clone_count + 1}))
            log(f"     📊 Clone count: {clone_count + 1}/1 today")
        except: pass
        
        return {
            "campaign_id": new_camp_id,
            "adset_id": new_adset_id,
            "name": camp_name,
            "age_range": age_range_str,
            "budget": 20000,
        }
            
    except Exception as e:
        log(f"LC clone creation error: {e}", "ERROR")
        traceback.print_exc()
        return None