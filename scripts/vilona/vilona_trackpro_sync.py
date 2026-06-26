import csv
import json
import os
import glob
from collections import defaultdict
from datetime import datetime

# Paths
REPORTS_DIR = 'reports'
MANUAL_DATA_FILE = os.path.join(REPORTS_DIR, 'manual_ads_data.json')
INBOUND_DIR = '../media/inbound'

def get_latest_csv(pattern):
    files = glob.glob(os.path.join(INBOUND_DIR, pattern))
    if not files:
        return None
    return max(files, key=os.path.getmtime)

def sync_trackpro():
    click_file = get_latest_csv('WebsiteClickReport20260520*.csv')
    comm_file = get_latest_csv('AffiliateCommissionReport_20260520*.csv')
    
    if not click_file or not comm_file:
        return "❌ Latest May 20 files not found."

    print(f"Parsing Clicks: {os.path.basename(click_file)}")
    print(f"Parsing Commission: {os.path.basename(comm_file)}")

    # 1. Process Click Report
    clicks = defaultdict(int)
    try:
        with open(click_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                tag = row['Tag_link'].replace('----', '').strip()
                if tag:
                    clicks[tag] += 1
    except Exception as e:
        return f"❌ Error clicking: {e}"
            
    # 2. Process Commission Report
    orders = defaultdict(set)
    total_comm = defaultdict(float)
    
    try:
        with open(comm_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                oid = row.get('ID Pemesanan')
                if not oid: continue
                tag = row.get('Tag_link1', '').strip()
                comm_raw = row.get('Komisi Bersih Affiliate (Rp)', '0').replace(',', '')
                try:
                    comm = float(comm_raw)
                except:
                    comm = 0.0
                
                if tag:
                    orders[tag].add(oid)
                    total_comm[tag] += comm
    except Exception as e:
        return f"❌ Error commission: {e}"

    # 3. Aggregate results
    today_revenue = sum(total_comm.values())
    today_orders = sum(len(o) for o in orders.values())
    today_clicks = sum(clicks.values())
    
    # 4. Update manual_ads_data.json
    if os.path.exists(MANUAL_DATA_FILE):
        with open(MANUAL_DATA_FILE, 'r') as f:
            data = json.load(f)
    else:
        data = {'revenue_entries': [], 'notes': [], 'status_updates': []}
        
    # Check if we already have an entry for today
    today_str = datetime.now().strftime('%Y-%m-%d')
    existing = [e for e in data['revenue_entries'] if e.get('timestamp', '').startswith(today_str) and e.get('source') == 'Shopee Affiliate (Sync)']
    
    if existing:
        # Update existing
        existing[0]['amount'] = today_revenue
        existing[0]['note'] = f"Sync: {today_orders} orders from {today_clicks} clicks"
    else:
        data['revenue_entries'].append({
            'timestamp': datetime.now().isoformat(),
            'source': 'Shopee Affiliate (Sync)',
            'amount': today_revenue,
            'note': f"Sync: {today_orders} orders from {today_clicks} clicks"
        })
        
    with open(MANUAL_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

    # 5. Push to External Supabase Dashboard
    print("Pushing to Supabase (0858)...")
    os.system(f"python3 scripts/push_to_dashboard.py 0858 '{click_file}'")
    os.system(f"python3 scripts/push_to_dashboard.py 0858 '{comm_file}'")
    
    # Also push for 8458 if found
    click_8458 = get_latest_csv('WebsiteClickReport202605201427*.csv')
    comm_8458 = get_latest_csv('AffiliateCommissionReport_202605201427*.csv')
    if click_8458 and comm_8458:
        print("Pushing to Supabase (8458)...")
        os.system(f"python3 scripts/push_to_dashboard.py 8458 '{click_8458}'")
        os.system(f"python3 scripts/push_to_dashboard.py 8458 '{comm_8458}'")
        
    summary = f"✅ Sync Complete for May 20 (files found: {datetime.fromtimestamp(os.path.getmtime(click_file)).strftime('%H:%M')})\n"
    summary += f"   - Total Revenue: Rp{today_revenue:,.0f}\n"
    summary += f"   - Total Orders: {today_orders}\n"
    summary += f"   - Total Clicks: {today_clicks}\n"
    
    return summary

if __name__ == "__main__":
    print(sync_trackpro())
