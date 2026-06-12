import os, sys, json, time
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vilona_trakpro_engine import fb_get, fb_post, API

ACT = 'act_435670549443081'

def now_wib():
    return datetime.utcnow() + timedelta(hours=7)

def to_rp(n):
    if n is None:
        return 'Rp0'
    return f"Rp{n:,.0f}".replace(',', '.')

def main():
    today = now_wib().date()
    since = today - timedelta(days=7)
    ts = now_wib().strftime('%d %b %Y %H:%M')

    campaigns = fb_get(f'{ACT}/campaigns', fields='id,name,status', limit='200').get('data', [])
    ids = [c['id'] for c in campaigns]
    insights = {}
    for i in range(0, len(ids), 25):
        chunk = ids[i:i+25]
        filt = json.dumps([{'field':'campaign.id','operator':'IN','value':chunk}])
        r = fb_get(f'{ACT}/insights', fields='campaign_id,campaign_name,spend,cpc,clicks,ctr,impressions', time_range=json.dumps({'since': str(since), 'until': str(today)}), filtering=filt, level='campaign', limit='50')
        for row in r.get('data', []):
            cid = row.get('campaign_id')
            if cid:
                insights[cid] = row
        time.sleep(1.6)
    rules = {}
    try:
        rl = fb_get(f'{ACT}/adrules_library', fields='id,name,execution_spec,evaluation_spec', limit='50')
        for r in rl.get('data', []):
            rules[r['id']] = r['name']
    except Exception:
        pass

    active, off, watch, kill, stars = [], [], [], [], []
    total_spend = 0
    for c in campaigns:
        name = c.get('name', '')
        status = c.get('status', '')
        i = insights.get(c['id'], {})
        spend = float(i.get('spend') or 0)
        cpc = float(i.get('cpc') or 0)
        ctr = float(i.get('ctr') or 0)
        clicks = float(i.get('clicks') or 0)
        impr = float(i.get('impressions') or 0)
        total_spend += spend

        if name.startswith('OFF_'):
            off.append(name)
            continue
        if cpc > 200 and spend > 2000:
            kill.append(f"{name} | CPC {cpc:,.0f} | spend {spend:,.0f}")
            try:
                fb_post(c['id'], status='PAUSED')
                time.sleep(1.5)
            except Exception:
                pass
            if not name.startswith('OFF_'):
                try:
                    fb_post(c['id'], name=f"OFF_{name}")
                    time.sleep(1.5)
                except Exception:
                    pass
            off.append(f"OFF_{name}")
            continue
        if (cpc > 120) or (ctr < 1 and impr > 1000):
            watch.append(f"{name} | CPC {cpc:,.0f} | CTR {ctr:,.2f}% | spend {spend:,.0f}")
        if name.startswith('🌟_'):
            stars.append(name)
        active.append(f"{name} | CPC {cpc:,.0f} | CTR {ctr:,.2f}% | Clicks {clicks:,.0f} | spend {spend:,.0f}")

    report = []
    report.append(f"🛡️ SATPAM 0858 — {ts}")
    report.append(f"ACTIVE: {len(active)} | OFF_: {len(off)}")
    report.append(f"⚠️ KILL ({len(kill)}):")
    for k in kill:
        report.append(f"- {k}")
    report.append(f"👀 WATCH ({len(watch)}):")
    for w in watch:
        report.append(f"- {w}")
    report.append(f"🌟 WINNERS ({len(stars)}):")
    for s in stars:
        report.append(f"- {s}")
    report.append(f"💰 Total spend 7d: {to_rp(total_spend)}")
    if rules:
        conflicting = [n for n in rules.values() if any(x in n.upper() for x in ['CPC','CTR','SPENT','STOPLOSS','OFF'])]
        report.append(f"📋 AdRules conflicting: {', '.join(conflicting) if conflicting else 'none'}")
    out = "\n".join(report)
    print(out)

main()