import sys, json
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from vilona_trakpro_engine import fb_get

ACT = 'act_435670549443081'
# Example from 1041 working call
page = fb_get(
    f'{ACT}/insights',
    fields='campaign_id,campaign_name,spend,cpc,clicks,ctr',
    params={
        'time_range': json.dumps({'since':'2026-06-06','until':'2026-06-13'}),
        'level':'campaign',
        'limit':'500'
    }
)
print('keys:', page.keys())
print('data len:', len(page.get('data', [])))
print('sample:', page.get('data', [{}])[0])
