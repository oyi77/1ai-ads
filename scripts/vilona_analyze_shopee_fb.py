import pandas as pd
import requests
import json
from datetime import datetime, timedelta
import os

# Config from scripts/quick_ads_report.py
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
AD_ACCOUNT_ID = 'act_380721031313330'

# Files
COMMISSION_FILE = '/home/openclaw/.openclaw/media/inbound/AffiliateCommissionReport202605141227_1---dd9befc5-3121-43c9-8a89-fb60a8f31d49.csv'
CLICK_FILE = '/home/openclaw/.openclaw/media/inbound/WebsiteClickReport202605141228---86ceb03d-c041-4599-912b-3c71963f5b2c.csv'

def get_fb_ads_report(date_str):
    url = f'https://graph.facebook.com/v19.0/{AD_ACCOUNT_ID}/insights'
    params = {
        'access_token': ACCESS_TOKEN,
        'level': 'campaign',
        'fields': 'campaign_name,spend,impressions,inline_link_clicks,clicks',
        'time_range': json.dumps({'since': date_str, 'until': date_str}),
        'limit': 100
    }
    r = requests.get(url, params=params).json()
    return r.get('data', [])

def analyze():
    target_date = '2026-05-13'
    print(f"--- ANALYZING DATA FOR {target_date} ---")
    
    # 1. FB Ads Data
    fb_data = get_fb_ads_report(target_date)
    df_fb = pd.DataFrame(fb_data)
    if not df_fb.empty:
        df_fb['spend'] = df_fb['spend'].astype(float)
        df_fb['inline_link_clicks'] = df_fb['inline_link_clicks'].fillna(0).astype(int)
    
    # 2. Click Report (Traffic)
    df_clicks = pd.read_csv(CLICK_FILE)
    # Tag_link format: rakdapur3----
    df_clicks['tag'] = df_clicks['Tag_link'].str.replace('----', '')
    
    # Filter clicks for 2026-05-13 (Wait, click file has 2026-05-12 in snippets)
    # User said "data shopee kemarin sudah keluar" -> Shopee report shows May 13 orders.
    # Clicks that led to May 13 orders could be from May 12 or 13.
    # The WebsiteClickReport has timestamps. Let's see what's in it.
    df_clicks['Waktu Klik'] = pd.to_datetime(df_clicks['Waktu Klik'])
    # Check distribution
    print("\nClick distribution by date in Click Report:")
    print(df_clicks['Waktu Klik'].dt.date.value_counts())
    
    # 3. Shopee Report (Conversions)
    df_comm = pd.read_csv(COMMISSION_FILE)
    # Commission report can have multiple tags, we use Tag_link1
    df_comm['tag'] = df_comm['Tag_link1']
    
    # Filter comm for May 13 (Waktu Pemesanan)
    df_comm['Waktu Pemesanan'] = pd.to_datetime(df_comm['Waktu Pemesanan'])
    df_target_comm = df_comm[df_comm['Waktu Pemesanan'].dt.date.astype(str) == target_date].copy()
    
    # Clean money columns
    # Example format: 6.130,8 or 17472.25? Shopee ID usually uses dots for thousands and comma for decimals or just dots.
    # Looking at CSV snippet: 6130.8 (it's using dot for decimal in the snippet)
    # Wait, 100.00%
    # Price: 104800 (no dot)
    # Commission: 6130.8
    # We should ensure numeric conversion.
    money_cols = ['Harga(Rp)', 'Nilai Pembelian(Rp)', 'Total Komisi per Pesanan(Rp)', 'Komisi Bersih Affiliate (Rp)']
    for col in money_cols:
        if col in df_target_comm.columns:
            df_target_comm[col] = pd.to_numeric(df_target_comm[col], errors='coerce').fillna(0)

    # 4. Aggregations
    # Traffic Aggregation
    agg_clicks = df_clicks.groupby(['tag', 'Perujuk']).size().reset_index(name='clicks')
    
    # Conversion Aggregation
    agg_comm = df_target_comm.groupby(['tag', 'Platform']).agg(
        orders=('ID Pemesanan', 'nunique'),
        total_sales=('Nilai Pembelian(Rp)', 'sum'),
        total_comm=('Komisi Bersih Affiliate (Rp)', 'sum')
    ).reset_index()
    
    # 5. Matching
    # Note: 'Platform' in Shopee report (Facebook, Instagram, etc) 
    # and 'Perujuk' in Click report (Facebook, Instagram, etc)
    # We'll merge on tag and generic platform names if possible.
    
    # Let's see unique tags and platforms
    print("\nSummary by Tag (Conversions):")
    summary_tag = agg_comm.groupby('tag').agg({'orders': 'sum', 'total_sales': 'sum', 'total_comm': 'sum'}).sort_values('total_comm', ascending=False)
    print(summary_tag)
    
    print("\nSummary by Platform (Conversions):")
    summary_plt = agg_comm.groupby('Platform').agg({'orders': 'sum', 'total_comm': 'sum'}).sort_values('total_comm', ascending=False)
    print(summary_plt)

    # 6. Best Patterns?
    # Match clicks to conversions
    # Map 'Perujuk' to 'Platform'
    df_clicks['plt_mapped'] = df_clicks['Perujuk']
    # Mapping for consistency
    # (Just in case)
    
    agg_clicks_tag = df_clicks.groupby('tag').size().reset_index(name='total_clicks')
    matched = pd.merge(summary_tag, agg_clicks_tag, on='tag', how='left')
    matched['CR%'] = (matched['orders'] / matched['total_clicks'] * 100).fillna(0)
    matched['EPC'] = (matched['total_comm'] / matched['total_clicks']).fillna(0)
    
    print("\nMatched Analysis (Tag Performance):")
    print(matched[['tag', 'total_clicks', 'orders', 'CR%', 'total_comm', 'EPC']].sort_values('total_comm', ascending=False))

    # Display Top Products
    print("\nTop Products (by Commission):")
    top_prods = df_target_comm.groupby('Nama Barange').agg(
        orders=('ID Pemesanan', 'nunique'),
        total_comm=('Komisi Bersih Affiliate (Rp)', 'sum')
    ).sort_values('total_comm', ascending=False).head(10)
    print(top_prods)

    # Output to file for persistence
    matched.to_csv('matching_result.csv', index=False)

if __name__ == "__main__":
    analyze()
