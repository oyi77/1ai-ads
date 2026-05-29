import os
import csv
import json
from collections import defaultdict

click_file = os.path.join(os.path.expanduser('~'), '.openclaw', 'media', 'inbound', 'WebsiteClickReport202605132000---7849ff4b-b00b-4c2d-8df8-ce8cbe0755c8.csv')
comm_file = os.path.join(os.path.expanduser('~'), '.openclaw', 'media', 'inbound', 'AffiliateCommissionReport202605132000---a9f17d60-d46a-40bb-b8fe-417cbe5bb1f8.csv')

def analyze():
    # 1. Process Click Report (Data summary group by tag)
    clicks = defaultdict(int)
    with open(click_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tag = row['Tag_link'].replace('----', '').strip()
            clicks[tag] += 1
            
    # 2. Process Commission Report
    orders = defaultdict(set) # Set of order IDs to avoid duplicate counts per tag
    finished_orders = defaultdict(int) 
    total_comm = defaultdict(float)
    
    with open(comm_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            oid = row['ID Pemesanan']
            status = row['Status Pesanan']
            tag = row['Tag_link1'].strip()
            comm = float(row['Komisi Bersih Affiliate (Rp)'].replace(',', ''))
            
            if tag:
                orders[tag].add(oid)
                total_comm[tag] += comm
                if status == 'Selesai':
                    finished_orders[tag] += 1

    # Format the results
    result = {}
    all_tags = set(clicks.keys()).union(set(orders.keys()))
    for tag in all_tags:
        c = clicks[tag]
        o_count = len(orders[tag])
        cvr = (o_count / c * 100) if c > 0 else 0
        result[tag] = {
            'clicks': c,
            'orders': o_count,
            'finished': finished_orders[tag],
            'commission': total_comm[tag],
            'cvr': round(cvr, 2)
        }
    return result

if __name__ == "__main__":
    print(json.dumps(analyze(), indent=2))
