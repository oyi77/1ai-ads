#!/usr/bin/env python3
import json, sys, urllib.request, urllib.parse, time

API_BASE = 'https://graph.facebook.com/v22.0'
AD_ACCOUNT = 'act_435670549443081'
ENV_PATH = '/home/openclaw/projects/1ai-ads/.env'

token = None
with open(ENV_PATH) as f:
    for line in f:
        line = line.strip()
        if line.startswith('META_ACCESS_TOKEN='):
            token = line.split('=', 1)[1].strip().strip('"').strip("'")
            break
if not token:
    print('ERROR: token not found'); sys.exit(1)
print(f'Token: {token[:8]}...{token[-4:]}')
print(f'Account: {AD_ACCOUNT}')
print()

def is_rate_limited(resp):
    body = resp.get('body', '')
    return '2446079' in body or 'limit reached' in body.lower() or 'terlalu banyak' in body.lower()

def api_get(url, params=None, retries=5):
    if params is None: params = {}
    params['access_token'] = token
    full_url = url + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(full_url)
    req.add_header('User-Agent', 'HermesAgent/1.0')
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            result = dict(error=str(e), body=body, code=e.code)
            if is_rate_limited(result):
                wait = 5 * (2 ** attempt)
                print(f'  RATE LIMITED (attempt {attempt+1}/{retries}), waiting {wait}s...')
                time.sleep(wait)
                continue
            return result
    return dict(error='max retries exceeded')

def api_post(url, params=None, retries=5):
    if params is None: params = {}
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('User-Agent', 'HermesAgent/1.0')
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            result = dict(error=str(e), body=body, code=e.code)
            if is_rate_limited(result):
                wait = 5 * (2 ** attempt)
                print(f'  RATE LIMITED (attempt {attempt+1}/{retries}), waiting {wait}s...')
                time.sleep(wait)
                continue
            return result
    return dict(error='max retries exceeded')

def api_delete(cid):
    return api_post(API_BASE + '/' + cid, dict(access_token=token, method='DELETE'))

print('=== Step 1: Fetch ON_LC_ campaigns ===')
all_onlc = []
after = None
page = 1
while True:
    params = dict(fields='id,name,status,effective_status', limit=100)
    if after:
        params['after'] = after
    print('  Page ' + str(page) + '...')
    resp = api_get(API_BASE + '/' + AD_ACCOUNT + '/campaigns', params)
    if 'error' in resp:
        print('  ERROR:', resp.get('body', resp['error']))
        sys.exit(1)
    for c in resp.get('data', []):
        name = c.get('name', '')
        if 'ON_LC_' in name:
            all_onlc.append(c)
            print('    ON_LC_: ' + c['id'] + ' | ' + name + ' | ' + c.get('status','?') + ' | ' + c.get('effective_status','?'))
    after = resp.get('paging', {}).get('cursors', {}).get('after')
    if not after or not resp.get('data'):
        break
    page += 1

print()
print('Total ON_LC_: ' + str(len(all_onlc)))
print()
if not all_onlc:
    print('None found.'); sys.exit(0)

print('=== Step 2: Check adsets, delete if 0 ===')
deleted = []
skipped = []
errors = []

for i, c in enumerate(all_onlc):
    cid = c['id']
    cname = c['name']
    print()
    print('[' + str(i+1) + '/' + str(len(all_onlc)) + '] ' + cid + ' | ' + cname)
    
    resp = api_get(API_BASE + '/' + cid + '/adsets', dict(fields='id', limit=1))
    if 'error' in resp:
        print('  ERROR:', resp.get('body', '')[:200])
        errors.append(dict(cid=cid, name=cname, error=resp))
        time.sleep(2)
        continue
    
    count = resp.get('summary', {}).get('total_count', len(resp.get('data', [])))
    print('  Adsets: ' + str(count))
    
    if count == 0:
        print('  -> DELETING...')
        dr = api_delete(cid)
        if 'error' in dr:
            body = dr.get('body', '')
            if dr.get('success') is True or 'deleted' in body.lower():
                print('  OK DELETED')
                deleted.append(c)
            else:
                print('  FAILED: HTTP ' + str(dr.get('code')) + ' - ' + body[:200])
                errors.append(dict(cid=cid, name=cname, error=dr))
        else:
            print('  OK DELETE: success=' + str(dr.get('success')))
            deleted.append(c)
        time.sleep(2)
    else:
        print('  -> SKIPPING (has adsets)')
        skipped.append(c)
        time.sleep(1)

print()
print('=' * 60)
print('FINAL REPORT')
print('=' * 60)
print('Total:    ' + str(len(all_onlc)))
print('Deleted:  ' + str(len(deleted)))
print('Skipped:  ' + str(len(skipped)))
print('Errors:   ' + str(len(errors)))

if deleted:
    print()
    print('Deleted:')
    for c in deleted:
        print('  - ' + c['id'] + ' | ' + c['name'])
if errors:
    print()
    print('Errors:')
    for e in errors:
        print('  - ' + e['cid'] + ' | ' + e['name'])
print()
print('Done.')
