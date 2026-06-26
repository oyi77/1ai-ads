import requests
import time
import os
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '') or (
    (REPO_ROOT / '.env').read_text().split('META_ACCESS_TOKEN=')[1].strip()
    if (REPO_ROOT / '.env').exists()
    else ''
)
TARGET_ACCOUNT = os.getenv('META_TARGET_ACCOUNT', 'act_380721031313330')
LOG_FILE = REPO_ROOT / 'outputs' / 'jendralbot_autoscaler' / 'vilona_nyamiresep_gass.log'
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

STRICT_MAX_CPC = 175
ELITE_CTR = 7.5
GASS_MULTIPLIER = 1.30
MAX_DAILY_BUDGET = 2_000_000
SCALE_TEST_BUDGET = 1.15
EXPORT_PREFIXES = ('BIDCAP_', 'BC_', 'LC_', 'TC_', 'OFF_')
REQUIRE_META_PREFIX = True


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}")
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{ts}] {msg}\n")


def get_data(endpoint, params=None):
    if params is None:
        params = {}
    params['access_token'] = ACCESS_TOKEN
    return requests.get(
        f'https://graph.facebook.com/v19.0/{endpoint}', params=params, timeout=15
    ).json().get('data', [])


def update_obj(obj_id, data):
    params = {'access_token': ACCESS_TOKEN}
    params.update(data)
    return requests.post(
        f'https://graph.facebook.com/v19.0/{obj_id}', params=params, timeout=10
    ).json()


def assert_meta_prefix(name):
    norm = str(name or '').strip()
    if REQUIRE_META_PREFIX and not any(norm.startswith(pref) for pref in EXPORT_PREFIXES):
        log(f"⚠️ ACTIVE campaign missing Nyamiresep export prefix: {name}")
        return False
    return True


def apply_budget(cid, current_budget, factor):
    new_budget = int(current_budget * factor)
    new_budget = min(new_budget, MAX_DAILY_BUDGET)
    if new_budget == current_budget:
        log(f"⏸ Budget capped for {cid}: {current_budget:,}, daily cap {MAX_DAILY_BUDGET:,}")
        return False
    resp = update_obj(cid, {'daily_budget': new_budget})
    return bool(resp.get('success', True))


def run_gass_engine():
    log("VILONA 'GASS' ENGINE ACTIVATED EXCLUSIVELY FOR NYAMIRESEP")
    log(
        f"Limits: STRICT_MAX_CPC={STRICT_MAX_CPC} | ELITE_CTR={ELITE_CTR} "
        f"| MAX_DAILY_BUDGET={MAX_DAILY_BUDGET:,}"
    )
    while True:
        try:
            insights = get_data(
                f'{TARGET_ACCOUNT}/insights',
                {
                    'level': 'campaign',
                    'fields': 'campaign_id,campaign_name,cost_per_inline_link_click,inline_link_click_ctr,spend',
                    'date_preset': 'today',
                },
            )
            campaigns = get_data(
                f'{TARGET_ACCOUNT}/campaigns',
                {'fields': 'id,name,status,effective_status,daily_budget'},
            )
            camp_map = {c['id']: c for c in campaigns}

            active_candidates = 0
            active_norm = 0

            for ins in insights:
                cid = ins.get('campaign_id')
                name = ins.get('campaign_name', '')
                cpc = float(ins.get('cost_per_inline_link_click', 0) or 0)
                ctr = float(ins.get('inline_link_click_ctr', 0) or 0)
                status = camp_map.get(cid, {}).get('effective_status', 'Unknown')
                current_budget = int(camp_map.get(cid, {}).get('daily_budget', 0) or 0)

                if status != 'ACTIVE':
                    continue

                active_candidates += 1
                if assert_meta_prefix(name):
                    active_norm += 1

                # Strict protection: pause if CPC too high
                if cpc > STRICT_MAX_CPC:
                    log(f"🛡️ AUTO-PROTECT: Pausing {name} | CPC {cpc} > {STRICT_MAX_CPC}")
                    update_obj(cid, {'status': 'PAUSED'})
                    continue

                # Aggressive scale for elite CTR + low CPC
                if cpc < 150 and ctr > ELITE_CTR:
                    if apply_budget(cid, current_budget, GASS_MULTIPLIER):
                        new_budget = min(int(current_budget * GASS_MULTIPLIER), MAX_DAILY_BUDGET)
                        log(
                            f"🚀 ELITE GASS: {name} | CTR {ctr}% "
                            f"| Budget {current_budget:,} -> {new_budget:,}"
                        )
                # Steady scale for solid CTR + low CPC
                elif cpc < 160 and ctr > 5.0:
                    if apply_budget(cid, current_budget, SCALE_TEST_BUDGET):
                        new_budget = min(int(current_budget * SCALE_TEST_BUDGET), MAX_DAILY_BUDGET)
                        log(
                            f"📈 STEADY SCALE: {name} | CTR {ctr}% "
                            f"| Budget {current_budget:,} -> {new_budget:,}"
                        )

            log(
                f"Audit: ACTIVE campaigns={active_candidates} | prefixed={active_norm} "
                f"| uncapped={MAX_DAILY_BUDGET:,}"
            )
        except Exception as e:
            log(f"GENERAL ERROR: {e}")
        time.sleep(300)


if __name__ == "__main__":
    run_gass_engine()
