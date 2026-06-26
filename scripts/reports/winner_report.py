#!/usr/bin/env python3
"""
🏆 WINNER REPORT — Campaign Profit & ROAS Attribution
Combines Meta Ads spend + Shopee affiliate commission via tag matching.

Usage:
  python3 scripts/winner_report.py                          # Default: 3 days, account 1041
  python3 scripts/winner_report.py --days 7                 # Last 7 days
  python3 scripts/winner_report.py --account 0858           # Different account
  python3 scripts/winner_report.py --min-profit 5000        # Filter min profit
"""
import sys, os, json, csv, re, argparse
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
import requests

# === CONFIG ===
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / 'data' / 'shopee'
ENV_FILE = PROJECT_DIR / '.env'

# Account configs
ACCOUNTS = {
    '1041': {'id': 'act_380721031313330', 'label': 'Nyamiresep (1041)'},
    '0858': {'id': 'act_435670549443081', 'label': 'Selow ID 0858'},
    '1208': {'id': 'act_1439536310038458', 'label': 'Herbal (1208)'},
    '1134': {'id': 'act_1773760133153789', 'label': 'Selow ID 1134'},
}

def get_token():
    with open(ENV_FILE) as f:
        for line in f:
            if line.startswith('META_ACCESS_TOKEN='):
                return line.split('=', 1)[1].strip()
    return None

def api_get(path, params=None):
    url = f"https://graph.facebook.com/v19.0/{path}"
    p = {"access_token": TOKEN, "limit": 200}
    if params:
        p.update(params)
    try:
        r = requests.get(url, params=p, timeout=15)
        return r.json()
    except Exception as e:
        return {"error": str(e)}

def load_shopee_data(account_label, days=3):
    """Load Shopee CSV data for the given date range"""
    today = datetime.now()
    all_orders = []
    
    for i in range(days):
        date = today - timedelta(days=i+1)
        date_str = date.strftime('%Y-%m-%d')
        
        # Try different filename patterns
        patterns = [
            DATA_DIR / f'{account_label}_{date_str}.csv',
            DATA_DIR / f'nyamiresep_{date_str}.csv',
            DATA_DIR / f'selow0858_{date_str}.csv',
        ]
        
        for csv_path in patterns:
            if csv_path.exists():
                try:
                    with open(csv_path, 'r', encoding='utf-8-sig') as f:
                        reader = csv.DictReader(f)
                        for row in reader:
                            all_orders.append({
                                'date': date_str,
                                'tag': row.get('Tag_link1', '').strip(),
                                'commission': float(row.get('Komisi Bersih Affiliate (Rp)', '0').replace(',', '') or 0),
                                'order_id': row.get('ID Pemesanan', ''),
                                'status': row.get('Status Pesanan', ''),
                                'product': row.get('Nama Barange', ''),
                                'purchase_value': float(row.get('Nilai Pembelian(Rp)', '0').replace(',', '') or 0),
                            })
                except Exception as e:
                    print(f"  ⚠️ Error reading {csv_path}: {e}")
                break  # Found file for this date
    
    return all_orders

def extract_tag_from_campaign(campaign_name):
    """Extract the most likely Shopee tag from a campaign name.
    
    Campaign names often contain the tag as a keyword.
    E.g., 'BIDCAP_Nyamiresep_Test_Atayasetelankaosanak 07' → 'Atayasetelankaosanak'
          'BC_Nyamiresep_Rakdapur3_Drama movies' → 'rakdapur3'
          'BC_Nyamiresep_Fashion_Rakdapur' → 'rakdapur3'
    """
    name_lower = campaign_name.lower()
    
    # Known tag patterns (ordered by specificity)
    known_tags = [
        'atayasetelankaosanak',
        'rakdapur3',
        'rakdapur',
        'wallpaperdindingvinyl',
        'benihsayuran',
        'dressanakperempuan',
        'setanakfernando',
        'stikerkeramik',
        'fashion',
    ]
    
    for tag in known_tags:
        if tag in name_lower:
            return tag
    
    # Fallback: extract last meaningful word group
    # Remove common prefixes
    cleaned = re.sub(r'^(bidcap|bc|tc|off_|scale_|nyamiresep_|test_|winner_?)+', '', name_lower, flags=re.I)
    cleaned = re.sub(r'\s*\d+$', '', cleaned)  # Remove trailing numbers
    cleaned = cleaned.strip('_ ')
    
    if cleaned:
        return cleaned
    
    return name_lower

def build_tag_mapping(campaigns):
    """Build a mapping: tag → list of campaign_ids"""
    tag_map = defaultdict(list)
    campaign_tags = {}
    
    for camp in campaigns:
        cid = camp['id']
        cname = camp.get('name', '')
        tag = extract_tag_from_campaign(cname)
        tag_map[tag].append(cid)
        campaign_tags[cid] = tag
    
    return tag_map, campaign_tags

def get_campaign_spend(account_id, date_since, date_until):
    """Get per-campaign spend from Meta API using insights endpoint"""
    # Get campaign-level insights directly
    insights = api_get(f'{account_id}/insights', {
        'level': 'campaign',
        'fields': 'campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr',
        'time_range': json.dumps({'since': date_since, 'until': date_until}),
        'limit': 500,
    })
    
    if 'error' in insights:
        print(f"  ❌ API Error: {insights['error'].get('message', 'unknown')[:100]}")
        return []
    
    all_insights = []
    for ins in insights.get('data', []):
        try:
            all_insights.append({
                'id': ins.get('campaign_id', ''),
                'name': ins.get('campaign_name', 'Unknown'),
                'spend': float(ins.get('spend', 0)),
                'clicks': int(ins.get('clicks', 0)),
                'cpc': float(ins.get('cpc', 0)),
                'ctr': float(ins.get('ctr', 0)),
                'impressions': int(ins.get('impressions', 0)),
            })
        except:
            pass
    
    return all_insights

def main():
    parser = argparse.ArgumentParser(description='🏆 Winner Report — Campaign Profit & ROAS')
    parser.add_argument('--days', type=int, default=3, help='Number of days to analyze (default: 3)')
    parser.add_argument('--account', type=str, default='1041', help='Account key: 1041, 0858, 1208, 1134')
    parser.add_argument('--min-profit', type=int, default=0, help='Minimum profit to show (default: 0)')
    parser.add_argument('--min-spend', type=int, default=0, help='Minimum spend to include (default: 0)')
    parser.add_argument('--csv', action='store_true', help='Output as CSV')
    args = parser.parse_args()
    
    global TOKEN
    TOKEN = get_token()
    if not TOKEN:
        print("❌ No META_ACCESS_TOKEN found in .env")
        sys.exit(1)
    
    account = ACCOUNTS.get(args.account)
    if not account:
        print(f"❌ Unknown account: {args.account}. Options: {list(ACCOUNTS.keys())}")
        sys.exit(1)
    
    today = datetime.now()
    date_since = (today - timedelta(days=args.days)).strftime('%Y-%m-%d')
    date_until = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    
    # Account label for Shopee data lookup
    label_map = {'1041': 'nyamiresep', '0858': 'selow0858', '1208': 'herbal', '1134': 'selow1134'}
    account_label = label_map.get(args.account, 'nyamiresep')
    
    print(f"🏆 WINNER REPORT — {account['label']}")
    print(f"📅 Periode: {date_since} – {date_until} ({args.days} hari)")
    print()
    
    # 1. Get Meta spend data
    print("📊 Fetching Meta Ads spend...")
    campaigns = get_campaign_spend(account['id'], date_since, date_until)
    
    # Filter: only campaigns with spend, skip OFF_ prefix
    active_campaigns = [c for c in campaigns if c['spend'] > args.min_spend and not c['name'].startswith('OFF_') and 'OFF_' not in c['name'][:10]]
    
    if not active_campaigns:
        print("  No campaigns with spend in this period.")
        return
    
    total_spend = sum(c['spend'] for c in active_campaigns)
    print(f"  ✅ {len(active_campaigns)} campaigns | Total spend: Rp {total_spend:,.0f}")
    print()
    
    # 2. Load Shopee data
    print("🛒 Loading Shopee affiliate data...")
    shopee_orders = load_shopee_data(account_label, args.days)
    
    if not shopee_orders:
        print("  ⚠️ No Shopee data found for this period.")
        print("  Showing Meta spend only (no profit data):")
        print()
        for c in sorted(active_campaigns, key=lambda x: x['spend'], reverse=True):
            if c['spend'] == 0:
                continue
            print(f"  {c['name'][:50]:<50} | Spend Rp {c['spend']:>10,.0f} | CPC Rp {c['cpc']:>6,.0f} | CTR {c['ctr']:>5.1f}%")
        return
    
    # Aggregate commission by tag (lowercase for case-insensitive matching)
    tag_commission = defaultdict(float)
    tag_orders = defaultdict(set)
    tag_purchase_value = defaultdict(float)
    # Keep original case for display
    tag_original_case = {}
    
    for order in shopee_orders:
        tag = order['tag']
        if not tag:
            continue
        tag_lower = tag.lower()
        tag_commission[tag_lower] += order['commission']
        tag_purchase_value[tag_lower] += order['purchase_value']
        tag_orders[tag_lower].add(order['order_id'])
        tag_original_case[tag_lower] = tag
    
    unique_tags = set(tag_commission.keys())
    total_commission = sum(tag_commission.values())
    total_shopee_orders = sum(len(orders) for orders in tag_orders.values())
    
    print(f"  ✅ {len(unique_tags)} tags | {total_shopee_orders} orders | Commission: Rp {total_commission:,.0f}")
    print()
    
    # 3. Build tag-to-campaign mapping
    tag_map, campaign_tags = build_tag_mapping(active_campaigns)
    
    # 4. Match and calculate profit
    print("🔗 Attributing commission to campaigns...")
    
    # Fuzzy tag matching: if exact match fails, try partial match for similar tags
    def resolve_tag(campaign_tag, available_tags):
        """Resolve campaign tag to Shopee tag, with fuzzy matching"""
        if campaign_tag in available_tags:
            return campaign_tag
        # Try: campaign_tag as substring of shopee tag, or shopee tag as substring
        for shopee_tag in available_tags:
            if campaign_tag in shopee_tag or shopee_tag in campaign_tag:
                return shopee_tag
        return None
    
    results = []
    unmatched_commission = 0
    matched_tags = set()
    
    for camp in active_campaigns:
        cid = camp['id']
        cname = camp['name']
        spend = camp['spend']
        tag = campaign_tags.get(cid, '')
        
        if spend == 0:
            continue
        
        # Find campaigns sharing this tag
        shared_cids = tag_map.get(tag, [cid])
        
        # Resolve to actual Shopee tag (case-insensitive + fuzzy match)
        actual_shopee_tag = resolve_tag(tag, set(tag_commission.keys()))
        
        if not actual_shopee_tag:
            continue
        
        # Calculate spend share for proportional split
        shared_spend = sum(
            c['spend'] for c in active_campaigns 
            if c['id'] in shared_cids and campaign_tags.get(c['id']) == tag
        )
        
        if shared_spend == 0:
            continue
        
        spend_share = spend / shared_spend
        
        # Get commission for this tag (proportional to spend)
        total_tag_commission = tag_commission.get(actual_shopee_tag, 0)
        total_tag_purchase = tag_purchase_value.get(actual_shopee_tag, 0)
        tag_order_count = len(tag_orders.get(actual_shopee_tag, set()))
        
        attributed_commission = total_tag_commission * spend_share
        attributed_purchase = total_tag_purchase * spend_share
        attributed_orders = round(tag_order_count * spend_share)
        
        profit = attributed_commission - spend
        roas = attributed_commission / spend if spend > 0 else 0
        
        matched_tags.add(actual_shopee_tag)
        
        results.append({
            'name': cname,
            'spend': spend,
            'commission': attributed_commission,
            'profit': profit,
            'roas': roas,
            'orders': attributed_orders,
            'tag': tag,
            'clicks': camp['clicks'],
            'cpc': camp['cpc'],
            'ctr': camp['ctr'],
            'impressions': camp['impressions'],
        })
    
    # 5. Sort by profit and display
    results.sort(key=lambda x: x['profit'], reverse=True)
    
    # Filter: min profit, and min spend to filter noise
    filtered = [r for r in results if r['profit'] >= args.min_profit and r['spend'] >= args.min_spend]
    
    # Also show top losers if no winners found
    if not filtered and results:
        filtered = [r for r in results if r['spend'] >= args.min_spend][:5]
    
    if args.csv:
        print("Campaign,Spend,Commission,Profit,ROAS,Orders,Tag,CPC,CTR,Clicks")
        for r in filtered:
            print(f"\"{r['name']}\",{r['spend']:.0f},{r['commission']:.0f},{r['profit']:.0f},{r['roas']:.2f},{r['orders']},{r['tag']},{r['cpc']:.0f},{r['ctr']:.1f},{r['clicks']}")
    else:
        total_profit = sum(r['profit'] for r in filtered)
        total_commission = sum(r['commission'] for r in filtered)
        total_spend = sum(r['spend'] for r in filtered)
        total_orders = sum(r['orders'] for r in filtered)
        
        print(f"💰 Profit: Rp {total_profit:,.0f} | Spend: Rp {total_spend:,.0f} | Commission: Rp {total_commission:,.0f}")
        print()
        
        for i, r in enumerate(filtered, 1):
            roas_str = f"{r['roas']:.2f}x"
            print(f"{i}. {r['name'][:45]:<45} | Profit Rp {r['profit']:>8,.0f} | ROAS {roas_str:>6} | Order {r['orders']:>4}")
        
        if filtered:
            print()
            print(f"📊 Detail per campaign:")
            print(f"{'Campaign':<45} {'Spend':>10} {'Comm':>10} {'Profit':>10} {'ROAS':>7} {'Orders':>6}")
            print("-" * 95)
            for r in filtered:
                print(f"{r['name'][:44]:<45} Rp {r['spend']:>7,.0f} Rp {r['commission']:>7,.0f} Rp {r['profit']:>7,.0f} {r['roas']:>5.2f}x {r['orders']:>5}")
        
        # Show unmatched tags
        unmatched = set(tag_commission.keys()) - matched_tags
        if unmatched:
            print()
            print(f"⚠️ Unmatched Shopee tags (no Meta campaign):")
            for tag in sorted(unmatched):
                display_name = tag_original_case.get(tag, tag)
                print(f"  {display_name}: Rp {tag_commission[tag]:,.0f} ({len(tag_orders[tag])} orders)")


if __name__ == '__main__':
    main()
