import os
import csv
import json
from collections import defaultdict

click_file = os.path.join(os.path.expanduser('~'), '.openclaw', 'media', 'inbound', 'WebsiteClickReport202605132000---7849ff4b-b00b-4c2d-8df8-ce8cbe0755c8.csv')
comm_file = os.path.join(os.path.expanduser('~'), '.openclaw', 'media', 'inbound', 'AffiliateCommissionReport202605132000---a9f17d60-d46a-40bb-b8fe-417cbe5bb1f8.csv')

def clean_tag(t):
    return t.replace('----', '').strip() if t else ''

def analyze():
    # 1. Process Click Report
    clicks = defaultdict(int)
    with open(click_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            tag = clean_tag(row.get('Tag_link'))
            if tag:
                clicks[tag] += 1
            
    # 2. Process Commission Report
    orders = defaultdict(set)
    finished_orders = defaultdict(int) 
    total_comm = defaultdict(float)
    
    with open(comm_file, 'r', encoding='utf-8') as f:
        # Some CSVs may have slight encoding/BOM issues, using utf-8-sig
        reader = csv.DictReader(f)
        for row in reader:
            oid = row.get('ID Pemesanan')
            if not oid: continue
            
            status = row.get('Status Pesanan')
            tag = clean_tag(row.get('Tag_link1'))
            comm_raw = row.get('Komisi Bersih Affiliate (Rp)', '0').replace(',', '')
            
            try:
                comm = float(comm_raw)
            except Exception:
                comm = 0.0
            
            if tag:
                orders[tag].add(oid)
                total_comm[tag] += comm
                if status == 'Selesai':
                    finished_orders[tag] += 1

    # Format the results
    result = {}
    all_tags = set(clicks.keys()).union(set(orders.keys()))
    for tag in all_tags:
        c = clicks.get(tag, 0)
        o_count = len(orders.get(tag, set()))
        cvr = (o_count / c * 100) if c > 0 else 0
        result[tag] = {
            'clicks': c,
            'orders': o_count,
            'finished': finished_orders.get(tag, 0),
            'commission': total_comm.get(tag, 0.0),
            'cvr': round(cvr, 2)
        }
    return result

if __name__ == "__main__":
    data = analyze()
    print(json.dumps(data, indent=2))
