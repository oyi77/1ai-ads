import urllib.request, json, os

env_paths = ['/home/openclaw/projects/1ai-ads/scripts/.env','/home/openclaw/projects/1ai-ads/.env']
token = ''
for path in env_paths:
    if not os.path.exists(path):
        continue
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('#') or '=' not in line:
                continue
            k,v = line.split('=',1)
            if k.strip() == 'META_ACCESS_TOKEN':
                token = v.strip().strip('"').strip("'")
                break
    if token:
        break

def fb_get(path):
    return json.loads(urllib.request.urlopen('https://graph.facebook.com/v22.0/' + path + '?access_token=' + token, timeout=30).read())

print('APP CHECK...')
me = fb_get('me')
print('App name:', me.get('name'), 'id:', me.get('id'))
print('\nAD ACCOUNTS:')
accounts = fb_get('me/adaccounts')
for a in accounts.get('data', []):
    print('ID:', a['id'], 'name:', a.get('name'), 'status:', a.get('account_status'))
    act_id = a['id'].replace('act_', '')
    try:
        camps = fb_get(f'act_{act_id}/campaigns?fields=id,name,status&limit=100')
        active = [c['name'] for c in camps.get('data', []) if c.get('status')=='ACTIVE']
        print('  campaigns:', len(active), 'active')
        for n in active[:5]:
            print('   -', n[:80])
        if len(active)>5:
            print('   ...', len(active)-5, 'more')
    except Exception as e:
        print('  campaign list error:', e)
