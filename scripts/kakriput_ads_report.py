import requests
import json
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_435670549443081'

def get_report():
    print(f"--- 📊 KAK RIPUT ADS REPORT ({AD_ACCOUNT_ID}) ---")
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights'
    params = {
        'access_token': ACCESS_TOKEN,
        'level': 'campaign',
        'fields': 'campaign_id,campaign_name,spend,inline_link_click_ctr,cost_per_inline_link_click,inline_link_clicks,impressions',
        'date_preset': 'today',
        'limit': 50
    }
    r = requests.get(url, params=params).json()
    insights = r.get('data', [])
    
    if not insights:
        print("Belum ada data spend untuk hari ini (Tgl 13).")
        return

    print(f"{'CAMPAIGN NAME':<40} | {'SPEND':<7} | {'CTR':<6} | {'CPC':<5}")
    print("-" * 75)
    for ins in insights:
        name = ins.get('campaign_name', 'Unknown')
        spend = float(ins.get('spend', 0))
        ctr = float(ins.get('inline_link_click_ctr', 0))
        cpc = float(ins.get('cost_per_inline_link_click', 0))
        print(f"{name[:40]:<40} | {spend:<7.0f} | {ctr:<5.2f}% | {cpc:<5.2f}")

if __name__ == "__main__":
    get_report()
