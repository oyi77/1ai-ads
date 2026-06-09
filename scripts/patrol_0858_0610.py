#!/usr/bin/env python3
"""
🔥 PATROL META ADS 0858 — June 10, 2026
Account: act_435670549443081
Rules from memory: Pause hanya jika CVR<3% + 0 completed ever + spend>50k + jalan>3hr + baru>24jam
"""

import requests, json, os, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# === CONFIG ===
WORKSPACE = Path(__file__).parent.parent
TOKEN_FILE = WORKSPACE / ".fb_token_0858"
if not TOKEN_FILE.exists():
    TOKEN_FILE = Path("/tmp/fb_token.txt")

ACCESS_TOKEN = TOKEN_FILE.read_text().strip() if TOKEN_FILE.exists() else None
if not ACCESS_TOKEN:
    print("❌ No access token found!")
    sys.exit(1)

API = 'https://graph.facebook.com/v19.0'
ACCOUNT_ID = 'act_435670549443081'
TODAY = '2026-06-10'
TODAY_DT = datetime(2026, 6, 10, tzinfo=timezone(timedelta(hours=7)))  # WIB
NOW = datetime.now(timezone(timedelta(hours=7)))

# === RULES ===
CVR_KEEP_THRESHOLD = 5.0      # Jangan pause jika CVR > 5%
PENDING_KEEP_THRESHOLD = 50000  # Jangan pause jika pending > 50k
CVR_KILL_THRESHOLD = 3.0      # Pause only if CVR < 3%
SPEND_KILL_THRESHOLD = 50000  # Pause only if spend > 50k
MIN_HOURS_RUNNING = 3         # Jalan > 3hr
MIN_HOURS_AGE = 24            # Baru < 24jam jangan dipause

# Taglink mapping for campaign name detection
TAGLINKS = [
    'rakpiringpengering', 'organizerpullout', 'setelanbajukaosmihugajah',
    'setelangajahthaialand', 'gajahThailand', 'lemarirakdapur', 'rakdapur'
]

print("=" * 70)
print(f"🔥 PATROL META ADS 0858 — {TODAY}")
print(f"🕐 Time: {NOW.strftime('%H:%M WIB')}")
print(f"📋 Account: {ACCOUNT_ID}")
print("=" * 70)

def api_get(path, params=None, retries=3):
    if params is None: params = {}
    params['access_token'] = ACCESS_TOKEN
    params['limit'] = params.get('limit', '200')
    for attempt in range(retries):
        try:
            r = requests.get(f'{API}/{path}', params=params, timeout=25)
            data = r.json()
            if 'error' in data:
                code = data['error'].get('code', 0)
                if code in [4, 17, 80000, 80001]:
                    import time; time.sleep(2 ** attempt * 3)
                    continue
                print(f"  ⚠️ API error: {data['error'].get('message', str(data['error']))}")
                return {'error': data['error']}
            return data
        except Exception as e:
            if attempt < retries - 1:
                import time; time.sleep(2 ** attempt)
                continue
            return {'error': str(e)}
    return {'error': 'max retries'}

def api_post(path, data, retries=3):
    for attempt in range(retries):
        try:
            r = requests.post(f'{API}/{path}',
                params={'access_token': ACCESS_TOKEN}, data=data, timeout=15)
            return r.json()
        except Exception as e:
            if attempt < retries - 1:
                import time; time.sleep(2 ** attempt)
                continue
            return {'error': str(e)}
    return {'error': 'max retries'}

def detect_taglink(name):
    name_lower = name.lower()
    for tl in TAGLINKS:
        if tl.lower() in name_lower:
            return tl
    return 'unknown'

def is_blacklisted(name):
    blacklist = ['kakriput', 'kancingjepit', 'gendongananjing', 'gendongan']
    return any(kw.lower() in name.lower() for kw in blacklist)

# === LOAD SHOPEE DATA ===
print("\n📦 Loading Shopee data...")
shopee_file = WORKSPACE / "data" / "brain" / "shopee_master_brain_2026-06-09.json"
shopee_data = {}
if shopee_file.exists():
    with open(shopee_file) as f:
        shopee_data = json.load(f)
    print("  ✅ Shopee master brain loaded (June 9)")
else:
    print("  ⚠️ No Shopee data found, using hardcoded fallback")

commission_data = shopee_data.get('commission_data_completed', {})
click_data_0858 = shopee_data.get('click_data', {}).get('0858/Kakriput', {})

# Hardcoded CVR from last patrol
cvr_fallback = {
    'rakpiringpengering': 26.32,
    'organizerpullout': 57.58,
    'setelanbajukaosmihugajah': 7.14,
    'setelangajahthaialand': 5.46,
}

# Build taglink health
taglink_health = {}
for tl in TAGLINKS:
    comm = commission_data.get(tl, {})
    clicks = click_data_0858.get(tl, 0)
    completed_orders = comm.get('completed_orders', 0)
    completed_commission = comm.get('completed_commission', 0)
    pending_commission = comm.get('pending_commission', 0)
    cvr = cvr_fallback.get(tl, 0)

    taglink_health[tl] = {
        'completed_orders': completed_orders,
        'completed_commission': completed_commission,
        'pending_commission': pending_commission,
        'cvr_7d_pct': cvr,
        'clicks_total': clicks,
        'keep_on': (cvr > CVR_KEEP_THRESHOLD or pending_commission > PENDING_KEEP_THRESHOLD or completed_orders > 0),
        'keep_reasons': []
    }

    h = taglink_health[tl]
    if cvr > CVR_KEEP_THRESHOLD:
        h['keep_reasons'].append(f"CVR {cvr}% > {CVR_KEEP_THRESHOLD}%")
    if pending_commission > PENDING_KEEP_THRESHOLD:
        h['keep_reasons'].append(f"Pending Rp{pending_commission:,} > Rp{PENDING_KEEP_THRESHOLD:,}")
    if completed_orders > 0:
        h['keep_reasons'].append(f"{completed_orders} completed orders")

print("\n🏷️ Taglink Health:")
for tl, info in taglink_health.items():
    status = "🟢 KEEP" if info['keep_on'] else "🔴 KILLABLE"
    print(f"  {status} {tl}: CVR={info['cvr_7d_pct']}% | Pending=Rp{info['pending_commission']:,} | Completed={info['completed_orders']}")

# === GET ACTIVE CAMPAIGNS ===
print("\n📡 Fetching active campaigns from Meta API...")
camps = api_get(f'{ACCOUNT_ID}/campaigns', {
    'fields': 'id,name,status,effective_status,daily_budget,created_time,updated_time',
    'limit': '200',
    'filtering': "[{'field':'effective_status','operator':'IN','value':['ACTIVE','IN_PROCESS']}]"
})

if 'error' in camps:
    print(f"❌ Campaign fetch error: {camps['error']}")
    # Try without filtering
    camps = api_get(f'{ACCOUNT_ID}/campaigns', {
        'fields': 'id,name,status,effective_status,daily_budget,created_time,updated_time',
        'limit': '200',
    })

if 'error' in camps:
    print(f"❌ FATAL: {camps['error']}")
    sys.exit(1)

all_camps = camps.get('data', [])
active_camps = [c for c in all_camps if c.get('effective_status') in ('ACTIVE', 'IN_PROCESS')]

print(f"  Total campaigns: {len(all_camps)}")
print(f"  Active: {len(active_camps)}")

if not active_camps:
    print("  ⚠️ No active campaigns found!")
    # Try without effective_status filter
    active_camps = [c for c in all_camps if c.get('status') == 'ACTIVE' or c.get('effective_status') in ('ACTIVE',)]
    print(f"  Active (by status field): {len(active_camps)}")

# === GET INSIGHTS FOR TODAY ===
print(f"\n📊 Fetching insights for {TODAY}...")

# Get insights in batches of 50
campaign_ids = [c['id'] for c in active_camps]
insights_map = {}

for i in range(0, len(campaign_ids), 50):
    batch = campaign_ids[i:i+50]
    ids_str = ','.join(batch)
    ins_data = api_get('/', {
        'ids': ids_str,
        'fields': f"insights.time_range({{'since':'{TODAY}','until':'{TODAY}'}}){{spend,impressions,clicks,ctr,cpc,actions}}",
        'limit': '200'
    })

    if isinstance(ins_data, dict):
        for cid, cdata in ins_data.items():
            if cid == 'error': continue
            insights = cdata.get('insights', {}).get('data', [])
            if insights:
                ins = insights[0]
                insights_map[cid] = {
                    'spend': int(float(ins.get('spend', 0))),
                    'impressions': int(float(ins.get('impressions', 0))),
                    'clicks': int(float(ins.get('clicks', 0))),
                    'ctr': float(ins.get('ctr', 0)),
                    'cpc': float(ins.get('cpc', 0)),
                    'actions': ins.get('actions', []),
                }
            else:
                insights_map[cid] = {
                    'spend': 0, 'impressions': 0, 'clicks': 0,
                    'ctr': 0, 'cpc': 0, 'actions': []
                }

# Also get 7-day insights for spend > 50k check
print("📊 Fetching 7-day insights...")
insights_7d_map = {}
for i in range(0, len(campaign_ids), 50):
    batch = campaign_ids[i:i+50]
    ids_str = ','.join(batch)
    ins_data = api_get('/', {
        'ids': ids_str,
        'fields': f"insights.time_range({{'since':'2026-06-03','until':'{TODAY}'}}){{spend,impressions,clicks,ctr,cpc,actions}}",
        'limit': '200'
    })
    if isinstance(ins_data, dict):
        for cid, cdata in ins_data.items():
            if cid == 'error': continue
            insights = cdata.get('insights', {}).get('data', [])
            if insights:
                ins = insights[0]
                insights_7d_map[cid] = {
                    'spend': int(float(ins.get('spend', 0))),
                    'impressions': int(float(ins.get('impressions', 0))),
                    'clicks': int(float(ins.get('clicks', 0))),
                    'ctr': float(ins.get('ctr', 0)),
                    'cpc': float(ins.get('cpc', 0)),
                }
            else:
                insights_7d_map[cid] = {'spend': 0, 'impressions': 0, 'clicks': 0, 'ctr': 0, 'cpc': 0}

# === ANALYZE EACH CAMPAIGN ===
print("\n" + "=" * 70)
print("🔍 CAMPAIGN ANALYSIS")
print("=" * 70)

to_pause = []
to_keep = []
total_spend_today = 0
total_spend_7d = 0
total_clicks_today = 0

for camp in active_camps:
    cid = camp['id']
    name = camp['name']
    created = camp.get('created_time', '')
    taglink = detect_taglink(name)
    health = taglink_health.get(taglink, {
        'cvr_7d_pct': 0, 'completed_orders': 0,
        'pending_commission': 0, 'keep_on': False, 'keep_reasons': []
    })

    # Get insights
    ins = insights_map.get(cid, {'spend': 0, 'impressions': 0, 'clicks': 0, 'ctr': 0, 'cpc': 0})
    ins_7d = insights_7d_map.get(cid, {'spend': 0, 'impressions': 0, 'clicks': 0, 'ctr': 0, 'cpc': 0})

    spend_today = ins['spend']
    spend_7d = ins_7d['spend']
    clicks_today = ins['clicks']
    clicks_7d = ins_7d['clicks']
    ctr = ins['ctr']
    cpc = ins['cpc']
    ctr_7d = ins_7d['ctr']

    total_spend_today += spend_today
    total_spend_7d += spend_7d
    total_clicks_today += clicks_today

    # Calculate campaign age
    campaign_hours_old = 999  # default old
    if created:
        try:
            created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
            campaign_hours_old = (NOW - created_dt.astimezone(NOW.tzinfo)).total_seconds() / 3600
        except:
            pass

    # === APPLY RULES ===
    cvr = health['cvr_7d_pct']
    pending = health['pending_commission']
    completed = health['completed_orders']

    # RULE 1: Jangan pause jika CVR > 5%
    if cvr > CVR_KEEP_THRESHOLD:
        reason = f"CVR {cvr}% > {CVR_KEEP_THRESHOLD}% → KEEP"
        to_keep.append({'name': name, 'id': cid, 'taglink': taglink,
                        'spend_today': spend_today, 'spend_7d': spend_7d,
                        'clicks_today': clicks_today, 'cvr': cvr,
                        'decision': 'KEEP', 'reason': reason})
        continue

    # RULE 2: Jangan pause jika pending > 50k
    if pending > PENDING_KEEP_THRESHOLD:
        reason = f"Pending Rp{pending:,} > Rp{PENDING_KEEP_THRESHOLD:,} → KEEP"
        to_keep.append({'name': name, 'id': cid, 'taglink': taglink,
                        'spend_today': spend_today, 'spend_7d': spend_7d,
                        'clicks_today': clicks_today, 'cvr': cvr,
                        'decision': 'KEEP', 'reason': reason})
        continue

    # RULE 3: Jangan pause jika pernah ada completed orders
    if completed > 0:
        reason = f"{completed} completed orders ever → KEEP"
        to_keep.append({'name': name, 'id': cid, 'taglink': taglink,
                        'spend_today': spend_today, 'spend_7d': spend_7d,
                        'clicks_today': clicks_today, 'cvr': cvr,
                        'decision': 'KEEP', 'reason': reason})
        continue

    # RULE 4: Jangan pause jika baru < 24 jam
    if campaign_hours_old < MIN_HOURS_AGE:
        reason = f"Baru {campaign_hours_old:.1f} jam (< {MIN_HOURS_AGE}jam) → KEEP"
        to_keep.append({'name': name, 'id': cid, 'taglink': taglink,
                        'spend_today': spend_today, 'spend_7d': spend_7d,
                        'clicks_today': clicks_today, 'cvr': cvr,
                        'decision': 'KEEP', 'reason': reason})
        continue

    # === PAUSE CHECK: ALL conditions must be met ===
    pause_reasons = []
    meets_pause = True

    # Condition 1: CVR < 3%
    if cvr >= CVR_KILL_THRESHOLD:
        meets_pause = False
        pause_reasons.append(f"CVR {cvr}% >= {CVR_KILL_THRESHOLD}% → NOT met")
    else:
        pause_reasons.append(f"CVR {cvr}% < {CVR_KILL_THRESHOLD}% → MET")

    # Condition 2: 0 completed orders in 7 days
    if completed > 0:
        meets_pause = False
        pause_reasons.append(f"{completed} completed orders → NOT met")
    else:
        pause_reasons.append("0 completed orders → MET")

    # Condition 3: Spend > 50k
    if spend_7d <= SPEND_KILL_THRESHOLD:
        meets_pause = False
        pause_reasons.append(f"Spend 7d Rp{spend_7d:,} <= Rp{SPEND_KILL_THRESHOLD:,} → NOT met")
    else:
        pause_reasons.append(f"Spend 7d Rp{spend_7d:,} > Rp{SPEND_KILL_THRESHOLD:,} → MET")

    # Condition 4: Running > 3 hours
    if campaign_hours_old <= MIN_HOURS_RUNNING:
        meets_pause = False
        pause_reasons.append(f"Running {campaign_hours_old:.1f}hr <= {MIN_HOURS_RUNNING}hr → NOT met")
    else:
        pause_reasons.append(f"Running {campaign_hours_old:.1f}hr > {MIN_HOURS_RUNNING}hr → MET")

    if meets_pause and not is_blacklisted(name):
        to_pause.append({
            'name': name, 'id': cid, 'taglink': taglink,
            'spend_today': spend_today, 'spend_7d': spend_7d,
            'clicks_today': clicks_today, 'cvr': cvr,
            'decision': '⏸️ PAUSE', 'reason': ' | '.join(pause_reasons),
            'hours_old': campaign_hours_old
        })
    else:
        reason = ' | '.join(pause_reasons)
        if is_blacklisted(name):
            reason = "BLACKLISTED → KEEP"
        to_keep.append({
            'name': name, 'id': cid, 'taglink': taglink,
            'spend_today': spend_today, 'spend_7d': spend_7d,
            'clicks_today': clicks_today, 'cvr': cvr,
            'decision': 'KEEP', 'reason': reason,
            'hours_old': campaign_hours_old
        })

# === PRINT ANALYSIS ===
print(f"\n🟢 KEPT ({len(to_keep)} campaigns):")
for c in to_keep:
    print(f"  [{c['taglink']}] {c['name'][:60]}")
    print(f"    Today: Rp{c['spend_today']:,} | {c['clicks_today']} clicks | CVR={c['cvr']}%")
    print(f"    7d: Rp{c['spend_7d']:,}")
    print(f"    → {c['reason']}")

if to_pause:
    print(f"\n🔴 TO PAUSE ({len(to_pause)} campaigns):")
    for c in to_pause:
        print(f"  [{c['taglink']}] {c['name'][:60]}")
        print(f"    Today: Rp{c['spend_today']:,} | {c['clicks_today']} clicks | CVR={c['cvr']}%")
        print(f"    7d: Rp{c['spend_7d']:,} | Age: {c['hours_old']:.1f}hr")
        print(f"    → ALL KILL CONDITIONS MET: {c['reason']}")
else:
    print(f"\n🔴 TO PAUSE: NONE — semua campaign memenuhi safety rules!")

# === EXECUTE PAUSES ===
paused_count = 0
pause_results = []

if to_pause:
    print("\n" + "=" * 70)
    print("⏸️ EXECUTING PAUSES...")
    print("=" * 70)

    for camp in to_pause:
        name = camp['name']
        cid = camp['id']
        print(f"\n  ⏸️ Pausing: {name[:70]} (ID: {cid})")
        print(f"     Spend 7d: Rp{camp['spend_7d']:,} | CVR: {camp['cvr']}%")

        resp = api_post(cid, {'status': 'PAUSED'})
        if resp.get('success'):
            print(f"     ✅ PAUSED successfully!")
            paused_count += 1
            pause_results.append({'name': name, 'id': cid, 'status': 'PAUSED'})
        else:
            error_msg = resp.get('error', {}).get('message', str(resp))
            print(f"     ❌ Failed: {error_msg}")
            pause_results.append({'name': name, 'id': cid, 'status': 'FAILED', 'error': error_msg})
else:
    print("\n✅ No campaigns to pause — all safe!")

# === SUMMARY REPORT ===
print("\n" + "=" * 70)
print("📊 PATROL SUMMARY — June 10, 2026")
print("=" * 70)

total_completed_commission = sum(
    taglink_health[tl]['completed_commission'] for tl in TAGLINKS if tl in taglink_health
)
total_pending_commission = sum(
    taglink_health[tl]['pending_commission'] for tl in TAGLINKS if tl in taglink_health
)

print(f"""
📋 ACCOUNT: act_435670549443081 (0858)
📅 DATE: {TODAY}
🕐 TIME: {NOW.strftime('%H:%M WIB')}

📢 ACTIVE CAMPAIGNS: {len(active_camps)}
💰 TODAY SPEND: Rp{total_spend_today:,}
💰 7-DAY SPEND: Rp{total_spend_7d:,}
🖱️ TODAY CLICKS: {total_clicks_today:,}

⏸️ PAUSED THIS PATROL: {paused_count}
🟢 KEPT ACTIVE: {len(to_keep)}

💵 REVENUE:
   Completed Commission: Rp{total_completed_commission:,}
   Pending Commission: Rp{total_pending_commission:,}

🏷️ TAGLINK STATUS:
""")

for tl in TAGLINKS:
    h = taglink_health.get(tl, {})
    if h:
        cvr = h['cvr_7d_pct']
        pending = h['pending_commission']
        completed = h['completed_orders']
        status = "🟢 SAFE" if h['keep_on'] else "🔴 VULNERABLE"
        print(f"  {status} {tl}: CVR={cvr}% | Pending=Rp{pending:,} | Completed={completed}")

print(f"\n📌 RULES APPLIED:")
print(f"   • CVR > {CVR_KEEP_THRESHOLD}% → KEEP (don't pause)")
print(f"   • Pending > Rp{PENDING_KEEP_THRESHOLD:,} → KEEP")
print(f"   • Has completed orders → KEEP")
print(f"   • Campaign < {MIN_HOURS_AGE} jam → KEEP (too new)")
print(f"   • Only pause if ALL: CVR<{CVR_KILL_THRESHOLD}% + 0 completed + spend>Rp{SPEND_KILL_THRESHOLD:,} + jalan>{MIN_HOURS_RUNNING}hr")

# === SAVE REPORT ===
report = {
    'patrol_date': TODAY,
    'patrol_time_wib': NOW.strftime('%H:%M'),
    'account': ACCOUNT_ID,
    'active_campaigns': len(active_camps),
    'total_spend_today': total_spend_today,
    'total_spend_7d': total_spend_7d,
    'total_clicks_today': total_clicks_today,
    'paused_count': paused_count,
    'kept_count': len(to_keep),
    'total_completed_commission': total_completed_commission,
    'total_pending_commission': total_pending_commission,
    'to_pause': to_pause,
    'to_keep_summary': [{
        'name': c['name'], 'taglink': c['taglink'],
        'spend_today': c['spend_today'], 'decision': c['decision'],
        'reason': c['reason']
    } for c in to_keep],
    'pause_results': pause_results,
    'taglink_health': {tl: {
        'cvr': taglink_health[tl]['cvr_7d_pct'],
        'pending': taglink_health[tl]['pending_commission'],
        'completed': taglink_health[tl]['completed_orders'],
        'keep_on': taglink_health[tl]['keep_on']
    } for tl in TAGLINKS if tl in taglink_health}
}

report_path = WORKSPACE / "data" / "brain" / "laporan_patrol_2026-06-10.json"
with open(report_path, 'w') as f:
    json.dump(report, f, indent=2, default=str)

print(f"\n📝 Report saved: {report_path}")
print("=" * 70)
print("✅ PATROL COMPLETE")
print("=" * 70)
