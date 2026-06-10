import urllib.request, urllib.parse, urllib.error, json

with open("/tmp/_tk_clean.txt") as f:
    TOKEN=f.read().strip()
ACT="380721031313330"
API="https://graph.facebook.com/v22.0"
AUTH={"Authorization":"Bearer "+TOKEN}

def req(url):
    r=urllib.request.Request(url, headers=AUTH)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            body=resp.read().decode("utf-8","ignore")
            print("OK",body[:300])
    except urllib.error.HTTPError as e:
        body=e.read().decode("utf-8","ignore")
        print("ERR",e.code,body[:500])
    except Exception as e:
        print("FAIL",e)

req(API+"/act_"+ACT+"?fields=id,name,account_status")
req(API+"/act_"+ACT+"/campaigns?fields=id,name,status&limit=1")
qs="fields=campaign_id,spend&level=campaign&limit=1&" + urllib.parse.urlencode({"since":"2026-06-03","until":"2026-06-10"})
req(API+"/act_"+ACT+"/insights?"+qs)
