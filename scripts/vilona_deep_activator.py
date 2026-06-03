#!/usr/bin/env python3
"""
Vilona Deep Activator — runs every 5 minutes.
Scans both ad accounts for PAUSED adsets/ads under ACTIVE campaigns.
If found, auto-activates them OR alerts to Telegram if config says alert-only.

Mode: AUTO_FIX (default) — auto-activate
"""
import os, requests, json, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

TOKEN = os.environ.get('FACEBOOK_ACCESS_TOKEN',
    os.getenv('META_ACCESS_TOKEN', ''))

ACCOUNTS = {
    'act_380721031313330': 'Selow 1041',
    'act_435670549443081': 'Selow 0858',
}

TG_BOT_TOKEN = os.environ.get('TG_BOT_TOKEN', '')
TG_CHAT_ID = '157228659'
LOG = '/home/openclaw/.openclaw/workspace/logs/vilona_deep_activator.log'
SEEN = '/home/openclaw/.openclaw/workspace/logs/vilona_deep_activator_seen.json'
MODE = os.environ.get('VILONA_DEEP_MODE', 'AUTO_FIX')  # AUTO_FIX or ALERT_ONLY
WIB = timezone(timedelta(hours=7))


def log(m):
    line = f"[{datetime.now(WIB).strftime('%Y-%m-%d %H:%M:%S')}] {m}"
    with open(LOG, 'a') as f: f.write(line + '\n')
    print(line)


def tg(text):
    if not TG_BOT_TOKEN: return
    try:
        urllib.request.urlopen(
            f'https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage',
            data=urllib.parse.urlencode({'chat_id': TG_CHAT_ID, 'text': text, 'parse_mode': 'Markdown'}).encode(),
            timeout=8)
    except Exception: pass


def load_seen():
    if os.path.exists(SEEN):
        try: return json.load(open(SEEN))
        except: return {}
    return {}


def save_seen(d): json.dump(d, open(SEEN, 'w'))


def fetch_all(url):
    out = []
    while url:
        r = requests.get(url, timeout=20).json()
        out.extend(r.get('data', []))
        url = r.get('paging', {}).get('next')
    return out


def main():
    seen = load_seen()
    fixed_count = 0
    for acc_id, acc_name in ACCOUNTS.items():
        # ACTIVE campaigns only
        camps = fetch_all(f'https://graph.facebook.com/v19.0/{acc_id}/campaigns?fields=id,name,effective_status&effective_status=["ACTIVE"]&limit=200&access_token={TOKEN}')
        if not camps:
            log(f"⚪ {acc_name}: no ACTIVE campaigns"); continue
        for c in camps:
            cid = c['id']; cname = c['name']
            # Adsets under campaign
            adsets = fetch_all(f'https://graph.facebook.com/v19.0/{cid}/adsets?fields=id,name,effective_status,status&limit=100&access_token={TOKEN}')
            for a in adsets:
                aid = a['id']; aname = a['name']; astatus = a.get('effective_status')
                if astatus == 'PAUSED':
                    log(f"🚨 {acc_name} | Campaign ACTIVE {cname} → Adset PAUSED: {aname} ({aid})")
                    if MODE == 'AUTO_FIX':
                        rr = requests.post(f'https://graph.facebook.com/v19.0/{aid}',
                                          data={'status': 'ACTIVE', 'access_token': TOKEN}, timeout=15).json()
                        if rr.get('success'):
                            log(f"   ✅ AUTO-ACTIVATED adset {aname}")
                            tg(f"🟢 *AUTO-FIX* `{acc_name}`\nAdset `{aname}` di campaign `{cname}` re-activated.")
                            fixed_count += 1
                        else:
                            log(f"   ❌ activate failed: {rr}")
                            tg(f"⚠️ *FIX FAILED* `{acc_name}`\nAdset `{aname}`: {rr}")
                    else:
                        tg(f"🚨 *PAUSED ADSET DETECTED* `{acc_name}`\nCampaign: `{cname}`\nAdset: `{aname}` (PAUSED but parent ACTIVE)")

                # Ads under adset
                ads = fetch_all(f'https://graph.facebook.com/v19.0/{aid}/ads?fields=id,name,effective_status,status&limit=50&access_token={TOKEN}')
                for ad in ads:
                    if ad.get('effective_status') == 'PAUSED' and astatus != 'PAUSED':
                        log(f"🚨 {acc_name} | Adset ACTIVE → Ad PAUSED: {ad['name']} ({ad['id']})")
                        if MODE == 'AUTO_FIX':
                            rr = requests.post(f'https://graph.facebook.com/v19.0/{ad["id"]}',
                                              data={'status': 'ACTIVE', 'access_token': TOKEN}, timeout=15).json()
                            if rr.get('success'):
                                log(f"   ✅ AUTO-ACTIVATED ad {ad['name']}")
                                tg(f"🟢 *AUTO-FIX* `{acc_name}`\nAd `{ad['name']}` di adset `{aname}` re-activated.")
                                fixed_count += 1
    if fixed_count == 0:
        log(f"✅ Scan clean. No paused children under active parents.")
    else:
        log(f"🔧 Fixed {fixed_count} item(s) this cycle.")
        tg(f"📊 Deep Activator cycle: fixed *{fixed_count}* paused items.")


if __name__ == '__main__':
    main()
