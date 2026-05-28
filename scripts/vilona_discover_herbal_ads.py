import requests
import os

ACCESS_TOKEN = 'os.getenv('META_ACCESS_TOKEN', '')'
ACCOUNTS = ['act_380721031313330', 'act_435670549443081', 'act_2522295627806509'] # Ditambah satu dummy/kemungkinan ID lain

def discover():
    for acc in ACCOUNTS:
        print(f"Checking Account: {acc}")
        url = f'https://graph.facebook.com/v19.0/{acc}/campaigns'
        params = {'access_token': ACCESS_TOKEN, 'fields': 'id,name,status', 'limit': 100}
        try:
            r = requests.get(url, params=params).json()
            campaigns = r.get('data', [])
            for c in campaigns:
                if any(x in c['name'].lower() for x in ['purwoceng', 'wedang', 'herbal', 'bawang', 'soca']):
                    print(f"  FOUND: {c['name']} | Status: {c['status']} | ID: {c['id']} | Account: {acc}")
        except:
            print(f"  Access Error to {acc}")

if __name__ == "__main__":
    discover()
