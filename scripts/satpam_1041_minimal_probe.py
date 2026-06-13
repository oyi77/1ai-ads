import sys, json, time
sys.path.insert(0, '/home/openclaw/projects/1ai-ads/scripts')
import vilona_trakpro_engine as engine

ACT_ID = "380721031313330"

def paging_fetch_all(start_res):
    items = list(start_res.get('data', []))
    nxt = start_res.get('paging', {}).get('next')
    while nxt:
        time.sleep(0.8)
        data = engine.fb_get(nxt)
        if isinstance(data, dict):
            items.extend(data.get('data', []))
            nxt = data.get('paging', {}).get('next')
        else:
            nxt = None
    return items

camps0 = engine.fb_get(
    f"{ACT_ID}/campaigns",
    fields='id,name,status,daily_budget',
    limit=200
)
campaigns = paging_fetch_all(camps0)
active_campaigns = [c for c in campaigns if c.get('status') == 'ACTIVE']
out = {
    'active': len(active_campaigns),
    'total': len(campaigns)
}
print(json.dumps(out, indent=2))
