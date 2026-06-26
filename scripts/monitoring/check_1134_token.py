import os, json, urllib.request
token = os.environ.get('META_ACCESS_TOKEN', '')
url = f"https://graph.facebook.com/v22.0/act_2125021885010866?fields=account_name&access_token={token}"
req = urllib.request.Request(url)
with urllib.request.urlopen(req, timeout=15) as r:
    data = json.loads(r.read())
print(json.dumps(data))
