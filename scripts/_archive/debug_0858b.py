import sys, json
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from vilona_trakpro_engine import fb_get

ACT = 'act_435670549443081'
for fields in [
    'campaign_id,campaign_name,spend,cpc,clicks,ctr',
    'campaign_name,spend,cpc,clicks,ctr',
]:
    page = fb_get(
        f'{ACT}/insights',
        fields=fields,
        params={
            'time_range': json.dumps({'since':'2026-06-06','until':'2026-06-13'}),
            'level':'campaign',
            'limit':'5'
        }
    )
    print('FIELDS:', fields, 'ROWS:', len(page.get('data', [])), 'KEYS:', list(page.get('data', [{}])[0].keys())[:8])
