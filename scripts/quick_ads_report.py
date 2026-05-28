import requests
import json
from datetime import datetime
import os

ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

def get_report():
    print(f"--- FETCHING DATA FOR {AD_ACCOUNT_ID} ---")
    
    # Get Campaigns
    c_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/campaigns'
    c_params = {'access_token': ACCESS_TOKEN, 'fields': 'id,name,status,effective_status', 'limit': 100}
    campaigns = requests.get(c_url, params=c_params).json().get('data', [])
    
    # Get Insights (Today)
    i_url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights'
    i_params = {
        'access_token': ACCESS_TOKEN,
        'level': 'campaign',
        'fields': 'campaign_id,campaign_name,cost_per_inline_link_click,inline_link_click_ctr,spend,impressions,inline_link_clicks',
        'date_preset': 'today',
        'limit': 100
    }
    insights = requests.get(i_url, params=i_params).json().get('data', [])
    
    # Map Campaign status to insights
    c_status = {c['id']: c['effective_status'] for c in campaigns}
    
    print(f"\n{'CAMPAIGN NAME':<40} | {'STATUS':<12} | {'SPEND':<7} | {'CPC':<5} | {'CTR':<6}")
    print("-" * 85)
    
    total_spend = 0
    total_clicks = 0
    total_impressions = 0
    
    insights_list = requests.get(i_url, params=i_params).json().get('data', [])
    for ins in insights_list:
        cid = ins.get('campaign_id')
        name = ins.get('campaign_name', 'Unknown')
        status = c_status.get(cid, 'Unknown')
        spend = float(ins.get('spend', 0))
        cpc = float(ins.get('cost_per_inline_link_click', 0))
        ctr = float(ins.get('inline_link_click_ctr', 0))
        clicks = int(ins.get('inline_link_clicks', 0))
        imps = int(ins.get('impressions', 0))
        
        total_spend += spend
        total_clicks += clicks
        total_impressions += imps
        
        print(f"{name[:40]:<40} | {status:<12} | {spend:<7.0f} | {cpc:<5.2f} | {ctr:<5.2f}%")

    if total_impressions > 0:
        avg_ctr = (total_clicks / total_impressions) * 100
    else:
        avg_ctr = 0
        
    avg_cpc = total_spend / total_clicks if total_clicks > 0 else 0
    
    print("-" * 80)
    print(f"{'TOTAL':<40} | {'':<10} | {total_spend:<7.0f} | {avg_cpc:<5.2f} | {avg_ctr:<5.2f}%")

if __name__ == "__main__":
    get_report()
