import urllib.request, json, os

env_path = '/home/openclaw/projects/1ai-ads/scripts/.env'
if not os.path.exists(env_path):
    env_path = '/home/openclaw/projects/1ai-ads/.env'

token = ''
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        if k.strip() == 'META_ACCESS_TOKEN':
            token = v.strip().strip('"').strip("'")
            break

print('token_len=', len(token))
print('token_prefix=', token[:12])
print('token_suffix=', token[-8:])

url = 'https://graph.facebook.com/v22.0/me?access_token=' + token
try:
    with urllib.request.urlopen(url, timeout=30) as r:
        me = json.loads(r.read())
        print('token_valid=yes app=', me.get('name'), 'id=', me.get('id'))
except urllib.error.HTTPError as e:
    print('http_error=', e.code)
    print(e.read().decode('utf-8', errors='ignore')[:300])
except Exception as e:
    print('error=', repr(e))
