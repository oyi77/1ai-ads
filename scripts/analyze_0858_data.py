import pandas as pd
import json

# File paths
EXCEL_ADS = '/home/openclaw/.openclaw/media/inbound/Selow-ID-0858-Kampanye-13-Mei-2026-13-Mei-2026_1---5be73abf-d775-4970-8ff9-725908cc8ed6.xlsx'
CLICK_CSV = '/home/openclaw/.openclaw/media/inbound/WebsiteClickReport202605141242---e98a09e4-6966-49f1-9519-fd16fefe37c2.csv'
COMMISSION_CSV = '/home/openclaw/.openclaw/media/inbound/AffiliateCommissionReport202605141242---ee139e64-585f-4131-8065-49faf7dc98ba.csv'

def analyze_0858():
    # 1. Load Ads Data (Cost)
    df_ads = pd.read_excel(EXCEL_ADS)
    df_ads['spend'] = pd.to_numeric(df_ads['Jumlah yang dibelanjakan (IDR)'], errors='coerce').fillna(0)
    
    # Map campaign to tags (Heuristic)
    # Example: 'CBO_1-1-1_rakpiringpengering' -> tag 'rakpiringpengering'
    campaign_costs = []
    for _, row in df_ads.iterrows():
        name = row['Nama kampanye']
        spend = row['spend']
        tag = 'unknown'
        if 'rakpiringpengering' in name.lower(): tag = 'rakpiringpengering'
        elif 'dongkrakelektrik' in name.lower(): tag = 'Dongkrakelektrik'
        elif 'gendongananjing' in name.lower(): tag = 'gendongananjing'
        elif 'testing_rak' in name.lower(): tag = 'rakpiringpengering' # Usually same niche
        campaign_costs.append({'tag': tag, 'campaign': name, 'spend': spend})
    
    df_cost_mapped = pd.DataFrame(campaign_costs)
    tag_costs = df_cost_mapped.groupby('tag')['spend'].sum().reset_index()
    
    # 2. Load Click Data (Traffic)
    df_clicks = pd.read_csv(CLICK_CSV)
    df_clicks['tag'] = df_clicks['Tag_link'].str.replace('----', '')
    agg_clicks = df_clicks.groupby('tag').size().reset_index(name='clicks')
    
    # 3. Load Commission Data (Earnings)
    df_comm = pd.read_csv(COMMISSION_CSV)
    df_comm['tag'] = df_comm['Tag_link1']
    df_comm['earnings'] = pd.to_numeric(df_comm['Komisi Bersih Affiliate (Rp)'], errors='coerce').fillna(0)
    agg_comm = df_comm.groupby('tag').agg(
        orders=('ID Pemesanan', 'nunique'),
        total_comm=('earnings', 'sum')
    ).reset_index()
    
    # 4. Merge Data
    summary = pd.merge(tag_costs, agg_comm, on='tag', how='outer').fillna(0)
    summary = pd.merge(summary, agg_clicks, on='tag', how='left').fillna(0)
    
    # Apply Tax 5%
    summary['cost_plus_tax'] = summary['spend'] * 1.05
    summary['profit'] = summary['total_comm'] - summary['cost_plus_tax']
    summary['ROI%'] = (summary['profit'] / summary['cost_plus_tax'] * 100).replace([float('inf'), -float('inf')], 0).fillna(0)
    
    print("\n--- 0858 PROFIT/LOSS ANALYSIS (MAY 13) ---")
    print(summary[['tag', 'spend', 'cost_plus_tax', 'total_comm', 'profit', 'ROI%']].sort_values('profit', ascending=False))
    
    print("\n--- TOP PRODUCTS PER TAG ---")
    for tag in summary['tag'].unique():
        if tag == 0: continue
        print(f"\n[TAG: {tag}]")
        prods = df_comm[df_comm['tag'] == tag].groupby('Nama Barange')['earnings'].sum().sort_values(ascending=False).head(3)
        print(prods)

if __name__ == "__main__":
    analyze_0858()
