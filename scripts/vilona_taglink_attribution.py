#!/usr/bin/env python3
"""
vilona_taglink_attribution.py — Shopee Taglink Generator + Meta Campaign Attribution
Version 2.0

Generates tagged Shopee affiliate links with embedded campaign/adset/ad IDs.
When the CSV reports come back, we can map sales back to specific Meta campaigns.

Usage:
  python3 scripts/vilona_taglink_attribution.py generate --campaign "VILONA_Rakdapur3" --url "https://shopee.co.id/..."
  python3 scripts/vilona_taglink_attribution.py batch --file campaign_list.txt
  python3 scripts/vilona_taglink_attribution.py report   # Show attribution summary
"""
import sys
import json
import re
import sqlite3
import os
from datetime import datetime
from pathlib import Path
from collections import defaultdict

# === CONFIG ===
MASTER_DB = "/home/openclaw/.openclaw/workspace/adforge/db/adforge.db"
USER_DB_DIR = Path("/home/openclaw/.openclaw/workspace/adforge/db/users")
REPORTS_DIR = Path("/home/openclaw/.openclaw/workspace/reports")

os.makedirs(str(REPORTS_DIR), exist_ok=True)

# === TAGLINK GENERATION ===

def sanitize_tag(name):
    """Clean a name for use as a Shopee tag parameter."""
    # Shopee tags: max 20 chars, alphanumeric + underscore
    clean = re.sub(r'[^a-zA-Z0-9_]', '_', name)
    clean = re.sub(r'_+', '_', clean)
    return clean[:20].strip('_')

def generate_taglink(base_url, campaign_name, adset_name="", ad_name="", account_id="0858"):
    """
    Generate a Shopee affiliate link with attribution tags.
    
    Tag Structure:
      Tag_link1 = Campaign name (e.g., VILONA_Rakdapur3)
      Tag_link2 = Ad set name
      Tag_link3 = Ad name / Post ID
      
    Shopee tracks these in Tag_link1 through Tag_link5 columns in the CSV report.
    """
    tag1 = sanitize_tag(campaign_name)
    tag2 = sanitize_tag(adset_name) if adset_name else ""
    tag3 = sanitize_tag(ad_name) if ad_name else ""
    
    # Clean URL
    base = base_url.split('?')[0]  # Remove existing params
    
    # For Shopee Affiliate: use the universal link format
    # The actual shortlink will depend on Shopee's system, but we tag with sub_id
    params = f"smtt=0.0.9"
    if tag1:
        params += f"&sub_id1={tag1}"
    if tag2:
        params += f"&sub_id2={tag2}"
    if tag3:
        params += f"&sub_id3={tag3}"
    
    tagged_url = f"{base}?{params}"
    
    result = {
        "campaign_tag": tag1,
        "adset_tag": tag2,
        "ad_tag": tag3,
        "tagged_url": tagged_url,
        "account_id": account_id,
        "generated_at": datetime.now().isoformat()
    }
    
    return result

def batch_generate(campaigns_file):
    """Generate taglinks for multiple campaigns from a file."""
    with open(campaigns_file, 'r') as f:
        lines = f.readlines()
    
    results = []
    for line in lines:
        parts = line.strip().split(',')
        if len(parts) >= 2:
            url = parts[0].strip()
            campaign = parts[1].strip()
            adset = parts[2].strip() if len(parts) > 2 else ""
            ad = parts[3].strip() if len(parts) > 3 else ""
            acc = parts[4].strip() if len(parts) > 4 else "0858"
            
            result = generate_taglink(url, campaign, adset, ad, acc)
            results.append(result)
    
    return results

# === ATTRIBUTION ANALYSIS ===

def get_csv_files():
    """Find all processed CSV files for attribution."""
    processed_dir = Path("/home/openclaw/.openclaw/media/processed")
    if not processed_dir.exists():
        return []
    return sorted(processed_dir.glob("*.csv"), key=os.path.getmtime, reverse=True)[:10]

def analyze_attribution():
    """
    Analyze Taglink data from commission CSVs and match against stored campaigns.
    This shows which Meta campaigns actually generated Shopee sales.
    """
    import csv
    import os
    from pathlib import Path
    
    processed_dir = Path("/home/openclaw/.openclaw/media/processed")
    commissions = []
    
    # Find latest commission files
    for f in sorted(processed_dir.glob("*commission*"), key=os.path.getmtime, reverse=True)[:5]:
        try:
            with open(f, 'r', encoding='utf-8-sig') as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    tag = row.get('Tag_link1', '').strip()
                    if tag:
                        commissions.append({
                            'tag': tag,
                            'revenue': float(row.get('Komisi Bersih Affiliate (Rp)', '0').replace(',', '')),
                            'status': row.get('Status Pesanan', ''),
                            'order_id': row.get('ID Pemesanan', ''),
                            'date': row.get('Waktu Pemesanan', ''),
                        })
        except:
            continue
    
    # Aggregate by tag
    attribution = defaultdict(lambda: {'revenue': 0.0, 'orders': 0, 'completed': 0, 'statuses': defaultdict(int)})
    
    for c in commissions:
        tag = c['tag']
        attribution[tag]['revenue'] += c['revenue']
        attribution[tag]['orders'] += 1
        attribution[tag]['statuses'][c['status']] += 1
        if c['status'] == 'Selesai':
            attribution[tag]['completed'] += 1
    
    return dict(attribution)

def print_attribution_report():
    """Print formatted attribution report."""
    print("=" * 60)
    print("📊 SHOPEE → META ATTRIBUTION REPORT")
    print("=" * 60)
    
    data = analyze_attribution()
    
    if not data:
        print("No attribution data found. Upload commission CSVs first.")
        return
    
    total_revenue = 0
    total_orders = 0
    
    # Sort by revenue descending
    sorted_tags = sorted(data.items(), key=lambda x: -x[1]['revenue'])
    
    for tag, info in sorted_tags:
        print(f"\n🔗 Tag: {tag}")
        print(f"   💰 Revenue: Rp{info['revenue']:,.0f}")
        print(f"   📦 Orders: {info['orders']} (Completed: {info['completed']})")
        print(f"   📊 Statuses: {dict(info['statuses'])}")
        total_revenue += info['revenue']
        total_orders += info['orders']
    
    print("\n" + "-" * 40)
    print(f"🏆 TOTAL: Rp{total_revenue:,.0f} dari {total_orders} orders")
    print(f"📊 Source: Commission CSV files in processed/")

# === MAIN ===

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  generate  --campaign NAME --url URL [--adset NAME] [--ad NAME] [--account ID]")
        print("  batch     --file FILE")
        print("  report")
        return
    
    cmd = sys.argv[1]
    
    if cmd == "generate":
        campaign = ""
        url = ""
        adset = ""
        ad_name = ""
        account = "0858"
        
        for i, arg in enumerate(sys.argv):
            if arg == "--campaign" and i+1 < len(sys.argv): campaign = sys.argv[i+1]
            elif arg == "--url" and i+1 < len(sys.argv): url = sys.argv[i+1]
            elif arg == "--adset" and i+1 < len(sys.argv): adset = sys.argv[i+1]
            elif arg == "--ad" and i+1 < len(sys.argv): ad_name = sys.argv[i+1]
            elif arg == "--account" and i+1 < len(sys.argv): account = sys.argv[i+1]
        
        if not campaign or not url:
            print("❌ Need --campaign and --url")
            return
        
        result = generate_taglink(url, campaign, adset, ad_name, account)
        print(json.dumps(result, indent=2))
        
        # Store in local DB
        try:
            conn = sqlite3.connect(str(USER_DB_DIR / "adforge_user_899de8e4.db"))
            c = conn.cursor()
            c.execute("""
                INSERT OR REPLACE INTO campaigns 
                (id, platform, campaign_id, name, status, created_at)
                VALUES (?, 'shopee_taglink', ?, ?, 'ACTIVE', CURRENT_TIMESTAMP)
            """, (
                f"tglink_{result['campaign_tag']}_{datetime.now().strftime('%Y%m%d')}",
                result['campaign_tag'],
                f"Taglink: {result['campaign_tag']}"
            ))
            conn.commit()
            conn.close()
        except:
            pass
    
    elif cmd == "batch":
        filepath = ""
        for i, arg in enumerate(sys.argv):
            if arg == "--file" and i+1 < len(sys.argv): filepath = sys.argv[i+1]
        
        if not filepath:
            print("❌ Need --file")
            return
        
        results = batch_generate(filepath)
        print(json.dumps(results, indent=2))
        
        # Save to file
        output = REPORTS_DIR / f"taglinks_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
        with open(output, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n📁 Saved to: {output}")
    
    elif cmd == "report":
        if "--json" in sys.argv:
            data = analyze_attribution()
            print(json.dumps(data, indent=2))
        else:
            print_attribution_report()

if __name__ == "__main__":
    import os
    main()
