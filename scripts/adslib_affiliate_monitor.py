#!/usr/bin/env python3
"""
Adslibrary (Meta Ads Archive) screener for Shopee Affiliate
- Run every 15 mins (cron)
- Query 's.shopee.co.id' keyword
- Find duplicate ads, scaleup pattern, rapid-fire launches
- Match & report new/viral/push campaigns with extreme scale or dupe pattern
- Sends realtime notif to Telegram
"""
import os, time, urllib.request, urllib.parse, json
from datetime import datetime

QUERIES = ['s.shopee.co.id', 'organizer pullout', 'rak piring pengering', 'dongkrak elektrik', 'tissue salad', 'kancing jepit', 'rak sepatu susun', 'rak pot kabinet']
ACTIVE_QUERY = os.getenv('ADSLIB_QUERY', QUERIES[0])  # default: shopee

# Rotate through all queries
QUERY_ROTATION = os.getenv('ADSLIB_ROTATE', '0') == '1'
QUERY_INDEX_PATH = 'logs/adslib_query_idx.json'
TG_BOT_TOKEN = os.environ.get('TG_BOT_TOKEN', '')
TG_CHAT_ID = os.environ.get('TG_ADSLIB_CHAT_ID', '157228659')
SINCE_MINS = int(os.getenv('ADSLIB_SINCE_MINS', '180'))  # history window for alerting
SEEN_PATH = 'logs/adslib_seen_aff.json'
LOG_PATH = 'logs/adslib_aff_monitor.log'

# Meta Ad Library API endpoint
API = 'https://graph.facebook.com/v19.0/ads_archive'
ACCESS_TOKEN = os.getenv('META_ADLIB_ACCESS_TOKEN', os.getenv('META_ACCESS_TOKEN', ''))

FIELDS = [
    'ad_creative_body', 'ad_creative_link_caption', 'ad_creative_link_description',
    'ad_creation_time', 'ad_delivery_start_time', 'ad_delivery_stop_time',
    'ad_snapshot_url', 'advertiser_name', 'demographic_distribution',
    'funding_entity', 'id', 'page_id', 'page_name', 'region_distribution',
    'spend', 'currency', 'impressions', 'ad_status', 'ad_creative_link_title',
]


def tg_notify(text):
    if not TG_BOT_TOKEN: return
    data = urllib.parse.urlencode({'chat_id': TG_CHAT_ID, 'text': text, 'parse_mode': 'Markdown'}).encode()
    try: urllib.request.urlopen(f'https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage', data=data, timeout=8)
    except Exception: pass

def fetch_ads(after=None):
    params = {
        'access_token': ACCESS_TOKEN,
        'ad_reached_countries': 'ID',
        'search_terms': ACTIVE_QUERY,
        'fields': ','.join(FIELDS),
        'ad_active_status': 'ALL',
        'limit': 50,
    }
    if after: params['after'] = after
    url = API + '?' + urllib.parse.urlencode(params)
    r = urllib.request.urlopen(url, timeout=20)
    return json.load(r)

def load_seen():
    if os.path.exists(SEEN_PATH):
        try: return json.load(open(SEEN_PATH))
        except: pass
    return {}

def save_seen(d):
    json.dump(d, open(SEEN_PATH, 'w'), indent=2)

def log(msg):
    t = datetime.now().strftime('%H:%M:%S')
    with open(LOG_PATH, 'a') as f: f.write(f'[{t}] {msg}\n')


def main():
    seen = load_seen()
    after = None; new_alerts = []
    recent_ids = set()
    for _ in range(4):  # up to 200 ads per cycle
        try:
            resp = fetch_ads(after)
            data = resp.get('data', [])
            paging = resp.get('paging', {})
            for ad in data:
                adid = str(ad['id'])
                recent_ids.add(adid)
                cbody = ad.get('ad_creative_body', '').lower()
                url = ad.get('ad_snapshot_url')
                cr_title = ad.get('ad_creative_link_title')
                adv = ad.get('advertiser_name','')
                t0 = ad.get('ad_creation_time','')
                status = ad.get('ad_status','UNKNOWN')

                # Alert if brand new (never seen), created < SINCE_MINS ago, or dupe count >2
                ts = int(time.mktime(datetime.strptime(t0.split('T')[0], '%Y-%m-%d').timetuple()))
                min_ago = int((time.time() - ts) / 60)
                dupe = sum(1 for v in seen.values() if v.get('ad_creative_body','').lower() == cbody)
                alert = False
                if adid not in seen and min_ago < SINCE_MINS:
                    alert = True  # brand new
                elif dupe > 2:
                    alert = True  # dupe/scale cluster
                if alert:
                    msg = f"🔥 *AdPush Detected* [Shopee Affiliate]\nAdvertiser: `{adv}`\nStatus: *{status}*\nTitle: {cr_title}\nURL: {url}\nStart: {t0}\nDUPES: {dupe}"
                    tg_notify(msg)
                    log(msg)
                    new_alerts.append(adid)
                seen[adid] = ad
            if 'next' in paging: after = paging['cursors'].get('after'); time.sleep(2)
            else: break
        except Exception as e:
            log(f"fetch_ads ERROR: {e}"); break
    # Cleanup old
    to_del = [k for k in seen.keys() if k not in recent_ids]
    for k in to_del: seen.pop(k)
    save_seen(seen)
    log(f"SCAN DONE. Alerts: {len(new_alerts)}; Seen: {len(seen)}\n")

if __name__=='__main__':
    main()
