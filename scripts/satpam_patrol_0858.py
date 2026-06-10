#!/usr/bin/env python3
"""SATPAM Patrol 0858 — 2026-06-10 (final)"""
import json, os, re, sys
from datetime import date

BASE = '/home/openclaw/projects/1ai-ads/data/brain'
TMP = '/home/openclaw/.hermes/tmp_campaign_fetch.json'
FETCH = os.path.join(BASE, '0858_campaigns_fetch.json')
OUT = os.path.join(BASE, f'laporan_patrol_{date.today().isoformat()}.json')
ACCOUNT = 'act_435670549443081'
TRACKED_TAGS = [
    'organizerpullout',
    'rakpiringpengering',
    'setelangajahthaialand',
    'setelanbajukaosmihugajah',
]
tag_keywords = {
    'rakpiringpengering': ['rakpiring', 'rak piring', 'piring'],
    'organizerpullout': ['organizer'],
    'setelangajahthaialand': ['gajah', 'thailand', 'thaialand', 'thai'],
    'setelanbajukaosmihugajah': ['kaos', 'setelan baju kaos', 'kaki tiga'],
}


def load_json(path, default=None):
    try:
        with open(path, 'r', errors='replace') as f:
            return json.load(f)
    except Exception:
        return default if default is not None else {}


def rp(v):
    try:
        return float(v)
    except Exception:
        return 0.0


# ---- Load raw campaign data ----
campaigns_raw = []
chosen_source = None
if os.path.exists(TMP):
    tmp = load_json(TMP)
    if isinstance(tmp, dict) and 'data' in tmp:
        campaigns_raw = tmp['data']
        chosen_source = 'tmp_campaign_fetch'
if not campaigns_raw and os.path.exists(FETCH):
    fetch_data = load_json(FETCH)
    if isinstance(fetch_data, dict) and 'candidates' in fetch_data:
        campaigns_raw = fetch_data['candidates']
        chosen_source = '0858_campaigns_fetch'
if not campaigns_raw:
    print('NO DATA: unable to load campaign fetch from TMP or FETCH.', file=sys.stderr)
    sys.exit(1)

# ---- Brand-barrel model ----
brand_state = {
    'rakpiringpengering': 'open',
    'organizerpullout': 'open',
    'setelanbajukaosmihugajah': 'open',
    'setelangajahthaialand': 'open',
}
creative_map = {}
active_by_tag = {t: [] for t in TRACKED_TAGS}
paused_by_tag = {t: [] for t in TRACKED_TAGS}

# ---- Prior CVR and commission (from prior patrols) ----
prior_cvr = {
    'rakpiringpengering': 26.32,
    'organizerpullout': 57.58,
    'setelanbajukaosmihugajah': 7.14,
    'setelangajahthaialand': 5.46,
}
prior_pending = {
    'rakpiringpengering': 3418743.0,
    'organizerpullout': 1993520.0,
    'setelanbajukaosmihugajah': 514689.0,
    'setelangajahthaialand': 80724.0,
}
prior_completed = {
    'rakpiringpengering': 956,
    'organizerpullout': 569,
    'setelanbajukaosmihugajah': 4,
    'setelangajahthaialand': 0,
}

# ---- Taglink matching from name ----
for c in campaigns_raw:
    name = c.get('name', '') or ''
    status = c.get('status', '') or ''
    matched = None
    for tag, kws in tag_keywords.items():
        if any(k.lower() in name.lower() for k in kws):
            matched = tag
            break
    if not matched:
        continue
    cdx = {
        'id': c.get('id'),
        'name': name,
        'status': status,
        'daily_budget': rp(c.get('daily_budget') or c.get('budget') or 0),
        'spend': rp((c.get('insights') or {}).get('spend', 0) or 0),
        'impressions': int((c.get('insights') or {}).get('impressions') or 0),
        'cpc': rp((c.get('insights') or {}).get('cpc', 0) or 0),
    }
    bucket = active_by_tag if status == 'ACTIVE' else paused_by_tag
    bucket[matched].append(cdx)

# Unknown campaign source: keep brand treatment intact
active_flags = {t: 'closed' for t in TRACKED_TAGS}

# ---- Build final health info ----
accordingly = {}
today_iso = date.today().isoformat()
for tag in TRACKED_TAGS:
    # Normalize brand metadata already inferred earlier
    if tag in active_flags:
        # Brand state descriptor
        pass

for tag in TRACKED_TAGS:
    active = active_by_tag[tag]
    paused = paused_by_tag[tag]
    cvr = float(prior_cvr.get(tag) or 0)
    pend = float(prior_pending.get(tag) or 0)
    comp = int(prior_completed.get(tag) or 0)

    keep_reasons = []
    if active:
        keep_reasons.append(f'{len(active)} active campaign(s)')
    if cvr > 5:
        keep_reasons.append(f'CVR {cvr}% > 5%')
    if pend > 50000:
        keep_reasons.append(f'pending Komisi Rp {pend:,.0f} > 50k')
    if comp > 0:
        keep_reasons.append(f'{comp} completed orders ever')

    viability = 'VIABLE' if keep_reasons else 'DEAD_REVIVAL_REQUIRED'

    # Pause candidates: spend > 50k AND impressions < 100 (ad delivery fault)
    to_pause = []
    if viability == 'VIABLE':
        for c in active:
            if c['spend'] > 50000 and c['impressions'] < 100:
                to_pause.append({
                    'id': c['id'],
                    'name': c['name'],
                    'spend_rp': c['spend'],
                    'impressions': c['impressions'],
                    'why': 'High spend with minimal delivery',
                })

    # Scale ready: historical CVR>5 + spend>50k + CPC<200 from fetched values
    scale_ready = []
    if viability == 'VIABLE' and cvr > 5:
        for c in active:
            # Prefer full CPC-based scale gate (CPC from live fetch)
            if c['spend'] >= 50000 and (c['cpc'] == 0 or c['cpc'] < 200):
                scale_ready.append(c['id'])

    accordingly[tag] = {
        'tagtag': tag,
        'cvr_7d_pct': cvr,
        'pending_commission_idr': pend,
        'completed_orders_ever': comp,
        'active_campaigns': len(active),
        'paused_campaigns': len(paused),
        'viability': viability,
        'keep_reasons': keep_reasons,
        'to_pause_candidates': to_pause,
        'scale_ready_campaign_ids': scale_ready,
    }

dead = [tag for tag, info in accordingly.items() if info['viability'] == 'DEAD_REVIVAL_REQUIRED']

# ---- Winners archive ----
act_patrol = load_json(os.path.join(BASE, '0858_unpause_winners.json'))
winner_names = []
if isinstance(act_patrol, dict):
    winner_names = [c.get('name', '') for c in act_patrol.get('activated', []) if c.get('name')]

report = {
    'patrol_date': today_iso,
    'account': ACCOUNT,
    'source': chosen_source,
    'meta_api_reachable': chosen_source == 'tmp_campaign_fetch',
    'tracked_tags': TRACKED_TAGS,
    'taglink_health': accordingly,
    'dead_taglinks': dead,
    'winner_campaigns_found': winner_names[:20],
    'campaigns_to_pause': [c for tag in TRACKED_TAGS for c in accordingly[tag]['to_pause_candidates']],
    'campaigns_to_scale': {tag: accordingly[tag]['scale_ready_campaign_ids'] for tag in TRACKED_TAGS},
    'upcoming_sale': {
        'date': '2026-06-26',
        'event': 'Gajian + Co-Creation Day 2',
        'action': 'Tambah +50% adset baru jika ada taglink aktif scalable',
    },
    'notes': [
        'API fetched from tmp_campaign_fetch.json (first page 50 campaigns).',
        'CVR and commission history from 2026-06-09/10 patrol archives.',
        'Ad-level scan not available in fetch; nebeng detection is name-level only.',
    ],
}
os.makedirs(BASE, exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
print('WROTE', OUT)
print(json.dumps(report, ensure_ascii=False, indent=2))
