import requests
import json
import os
from datetime import datetime, timedelta

# Files for cookies (the one user pasted)
COOKIE_JSON_FILE = 'config/shopee_cookies_nyamirespedapur.json'

def get_headers():
    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://affiliate.shopee.co.id/conversion_report',
        'X-Requested-With': 'XMLHttpRequest'
    }

def fetch_shopee_via_requests():
    print(f"--- VILONA REQUESTS RAID ---")
    
    if not os.path.exists(COOKIE_JSON_FILE):
        print("No cookie file.")
        return

    with open(COOKIE_JSON_FILE, 'r') as f:
        cookies_list = json.load(f)
    
    # Convert JSON list to requests cookie jar
    jar = requests.cookies.RequestsCookieJar()
    for c in cookies_list:
        jar.set(c['name'], c['value'], domain=c['domain'], path=c['path'])

    # Range
    dates = []
    start = datetime.strptime("2026-04-28", "%Y-%m-%d")
    for i in range(15):
        dates.append((start + timedelta(days=i)).strftime("%Y-%m-%d"))

    scraped = {}
    for d in dates:
        print(f"Bypassing with Requests for {d}...")
        api_url = f"https://affiliate.shopee.co.id/api/v3/report/order/list?start_date={d}&end_date={d}&page_offset=0&page_size=20"
        
        try:
            r = requests.get(api_url, cookies=jar, headers=get_headers(), timeout=20)
            if r.status_code == 200:
                data = r.json()
                if data.get('data'):
                    summary = data['data'].get('summary', {})
                    scraped[d] = {
                        'comm': float(summary.get('actual_commission', 0)),
                        'orders': int(summary.get('order_count', 0)),
                        'clicks': int(summary.get('click_count', 0))
                    }
                    print(f"   -> HIT! Rp {scraped[d]['comm']}")
                else:
                    print(f"   -> Failed Auth? {r.text[:100]}")
            else:
                print(f"   -> Bad Status: {r.status_code}")
        except Exception as e:
            print(f"   -> Error: {e}")

    with open('reports/REQUESTS_RAID_DATA.json', 'w') as f:
        json.dump(scraped, f, indent=2)

if __name__ == "__main__":
    fetch_shopee_via_requests()
