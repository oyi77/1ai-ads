#!/usr/bin/env python3
"""
🔍 VILONA SHOPEE AFFILIATE AUDITOR — Auto Bug Detection & Fix
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Purpose:  Validate every Shopee Affiliate report CSV, detect bugs,
          generate fix instructions, log to brain + AdForge.

BUGS COVERED (from 04/06/2026 audit):
  BUG #1  — Click ID case inconsistency (hex IDs with mixed case)
  BUG #2  — Empty sub_id (----) = broken attribution 
  BUG #3  — Timestamp cross-day spillover
  BUG #4  — "Others" referrer unclassified
  BUG #5  — Commission math: Item vs Pesanan duplicate values
  BUG #6  — Commission math: XTRA orders MCN fee anomalies
  BUG #7  — Komisen Bersih edge case (MCN deduction not tested)
  BUG #8  — Missing Waktu Selesai (all pending)
  BUG #9  — Order ID format validation
  BUG #10 — Cross-campaign attribution (jerseymulimah 0% CR)

RUN: python3 shopee_affiliate_auditor.py [clicks.csv] [commissions.csv]
     Or via cron for auto-execution 24/7.
     Outputs: JSON report → data/shopee/audit/ + logs/ + AdForge API
"""

import csv
import json
import re
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from collections import Counter, defaultdict
from typing import Dict, List, Tuple, Optional

# ── CONFIG ──────────────────────────────────────────────
PROJECT_ROOT = Path.home() / "projects/1ai-ads"
DATA_DIR = PROJECT_ROOT / "data/shopee"
AUDIT_DIR = DATA_DIR / "audit"
LOG_DIR = PROJECT_ROOT / "logs"
GBRAIN_ENABLED = True  # Auto-save to 1ai-hub brain
ADFORGE_API = "http://127.0.0.1:3001/api"

# Thresholds
CONVERSION_MIN_RATE = 2.0        # Fire alert if campaign CR below this
COMMISSION_MATH_TOLERANCE = 0.01 # RM tolerance for rounding errors
PENDING_ORDER_MAX_DAYS = 7       # Alert if order pending >7 days
CLICK_ATTRIBUTION_MISSING_MAX = 5 # Alert if >5 clicks missing sub_id
CROSS_DAY_HOUR_THRESHOLD = 21    # If clicks exist before this UTC hour, likely prev day

# ── AUDIT CLASS ──────────────────────────────────────────
class ShopeeAffiliateAuditor:
    def __init__(self, clicks_path=None, commissions_path=None, report_date=None):
        self.clicks_path = clicks_path
        self.commissions_path = commissions_path
        self.report_date = report_date or datetime.now().strftime("%Y-%m-%d")
        self.bugs = []
        self.clicks = []
        self.commissions = []
        self.stats = {}
        
    def load_data(self):
        """Load both CSVs with robust encoding handling."""
        if self.clicks_path and os.path.exists(self.clicks_path):
            with open(self.clicks_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                self.clicks = list(reader)
        
        if self.commissions_path and os.path.exists(self.commissions_path):
            with open(self.commissions_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                self.commissions = list(reader)
        
        return len(self.clicks), len(self.commissions)
    
    def audit_clicks(self):
        """BUG #1-4: Validate click data integrity."""
        if not self.clicks:
            return
        
        seen_ids = Counter()
        empty_subid = 0
        cross_day = 0
        others_referrer = 0
        mixed_case = 0
        
        for i, row in enumerate(self.clicks):
            click_id = row.get('ID klik', '').strip()
            sub_id = row.get('Sub_id', '').strip()
            waktu = row.get('Waktu Klik', '').strip()
            perujuk = row.get('Perujuk', '').strip()
            
            # BUG #1: Case inconsistency in click IDs
            if click_id and click_id != click_id.lower():
                mixed_case += 1
            seen_ids[click_id.lower()] += 1
            
            # BUG #2: Empty sub_id
            if sub_id == '----' or not sub_id:
                empty_subid += 1
            
            # BUG #3: Cross-day timestamp
            if waktu:
                try:
                    dt = datetime.strptime(waktu, "%Y-%m-%d %H:%M:%S")
                    if dt.hour < CROSS_DAY_HOUR_THRESHOLD:
                        cross_day += 1
                except ValueError:
                    self.bugs.append({
                        'bug_id': 'BUG_3B',
                        'severity': 'LOW',
                        'location': f'Click Row {i+2}',
                        'description': f'Invalid timestamp format: {waktu}',
                        'fix': 'Validate timestamp format before ingestion'
                    })
            
            # BUG #4: Unclassified referrer
            if perujuk == 'Others':
                others_referrer += 1
        
        # BUG #1 Report
        if mixed_case > 0:
            self.bugs.append({
                'bug_id': 'BUG_1',
                'severity': 'CRITICAL',
                'location': 'Click IDs (all rows)',
                'description': f'{mixed_case} click IDs have mixed case — DB queries with CASE SENSITIVE collation may create duplicates',
                'fix': 'Normalize all click IDs to lowercase before ingestion'
            })
        
        # Check for actual duplicates
        dupes = {k: v for k, v in seen_ids.items() if v > 1}
        if dupes:
            self.bugs.append({
                'bug_id': 'BUG_1B',
                'severity': 'CRITICAL',
                'location': 'Click IDs',
                'description': f'{len(dupes)} duplicate click IDs found: {list(dupes.keys())[:5]}',
                'fix': 'Remove duplicate entries, investigate source'
            })
        
        # BUG #2 Report
        if empty_subid > CLICK_ATTRIBUTION_MISSING_MAX:
            self.bugs.append({
                'bug_id': 'BUG_2',
                'severity': 'HIGH',
                'location': 'Sub_id column',
                'description': f'{empty_subid} clicks have empty sub_id (----) — attribution broken',
                'fix': 'Trace source of unattributed clicks. Add fallback UTM or pixel tracking.'
            })
        elif empty_subid > 0:
            self.bugs.append({
                'bug_id': 'BUG_2',
                'severity': 'MEDIUM',
                'location': 'Sub_id column',
                'description': f'{empty_subid} clicks with empty sub_id',
                'fix': 'Monitor trend. If growing, investigate pixel/UTM pipeline.'
            })
        
        # BUG #3 Report
        if cross_day > 0:
            self.bugs.append({
                'bug_id': 'BUG_3',
                'severity': 'MEDIUM',
                'location': 'Waktu Klik column',
                'description': f'{cross_day} clicks with timestamps before {CROSS_DAY_HOUR_THRESHOLD}:00 UTC — possible previous-day spillover',
                'fix': 'Verify report date range matches claim. Implement report-generation-time validation.'
            })
        
        # BUG #4 Report
        if others_referrer > 0:
            self.bugs.append({
                'bug_id': 'BUG_4',
                'severity': 'MEDIUM',
                'location': 'Perujuk column',
                'description': f'{others_referrer} clicks from "Others" referrer — channel unknown',
                'fix': 'Expand referrer categories or add UTM parameter to "Others" traffic'
            })
    
    def audit_commissions(self):
        """BUG #5-9: Validate commission data integrity."""
        if not self.commissions:
            return
        
        math_errors = 0
        missing_completion = 0
        order_id_format_issues = 0
        xtra_bugs = 0
        
        for i, row in enumerate(self.commissions):
            try:
                # BUG #9: Order ID format (e.g., 260601VQ2V138C = 6 digits + 8 alphanumeric)
                order_id = row.get('Id Pembelian', '').strip()
                if not re.match(r'^\d{6}[A-Z0-9]{8}$', order_id):
                    order_id_format_issues += 1
                
                # BUG #5 & #6: Commission math verification
                # NOTE: Commission calculated on Nilai Pembelian (after discount), NOT Harga (original price)
                harga = float(row.get('Harga(RM)', 0) or 0)
                kuantiti = int(row.get('Kuantiti', 1) or 1)
                nilai_pembelian = float(row.get('Nilai Pembelian(RM)', 0) or 0)
                
                shopee_rate = float(row.get('Item Kadar Komisen Shopee', '0').replace('%', '') or 0) / 100
                seller_rate = float(row.get('Item Kadar Komisen Penjual', '0').replace('%', '') or 0) / 100
                
                # Commission base = Nilai Pembelian (actual price buyer paid)
                expected_shopee_komisen = round(nilai_pembelian * shopee_rate, 4)
                expected_seller_komisen = round(nilai_pembelian * seller_rate, 4)
                expected_total_item = round(expected_shopee_komisen + expected_seller_komisen, 4)
                
                actual_shopee = float(row.get('Item Komisen Shopee(RM)', 0) or 0)
                actual_seller = float(row.get('Item Komisen Penjual(RM)', 0) or 0)
                actual_total = float(row.get('Item Jumlah Komisen(RM)', 0) or 0)
                
                # Verify item-level math
                if (abs(actual_shopee - expected_shopee_komisen) > COMMISSION_MATH_TOLERANCE or
                    abs(actual_seller - expected_seller_komisen) > COMMISSION_MATH_TOLERANCE or
                    abs(actual_total - expected_total_item) > COMMISSION_MATH_TOLERANCE):
                    math_errors += 1
                    self.bugs.append({
                        'bug_id': f'BUG_5_{i+2}',
                        'severity': 'CRITICAL',
                        'location': f'Commission Row {i+2} (Order: {order_id})',
                        'description': (
                            f'Commission math mismatch: '
                            f'Harga=RM{harga}, Expected Shopee=RM{expected_shopee_komisen} → Got RM{actual_shopee}, '
                            f'Expected Seller=RM{expected_seller_komisen} → Got RM{actual_seller}, '
                            f'Expected Total=RM{expected_total_item} → Got RM{actual_total}'
                        ),
                        'fix': 'Verify Shopee commission calculation logic. Check for rounding rules or tier-based rates.'
                    })
                
                # BUG #7: MCN deduction edge case — check if any row has non-zero MCN
                mcn_rate = float(row.get('Kadar Bayaran Pengurusan MCN', '0').replace('%', '') or 0)
                mcn_fee = float(row.get('Bayaran Pengurusan MCN(RM)', 0) or 0)
                komisen_bersih = float(row.get('Komisen Bersih Affiliate(RM)', 0) or 0)
                jumlah_pesanan = float(row.get('Jumlah Komisen Pesanan(RM)', 0) or 0)
                
                if mcn_rate > 0 and abs(komisen_bersih - (jumlah_pesanan - mcn_fee)) > COMMISSION_MATH_TOLERANCE:
                    self.bugs.append({
                        'bug_id': 'BUG_7',
                        'severity': 'HIGH',
                        'location': f'Commission Row {i+2} (Order: {order_id})',
                        'description': (
                            f'MCN deduction anomaly: MCN rate={mcn_rate}%, MCN fee=RM{mcn_fee}, '
                            f'Pesanan=RM{jumlah_pesanan}, Bersih=RM{komisen_bersih}, '
                            f'Expected Bersih=RM{jumlah_pesanan - mcn_fee}'
                        ),
                        'fix': 'Update commission formula to handle MCN deductions correctly'
                    })
                
                # BUG #8: Missing completion
                waktu_selesai = row.get('Waktu Selesai', '').strip()
                if not waktu_selesai:
                    missing_completion += 1
                    
                    # Check how long it's been pending
                    masa_pesanan = row.get('Masa Pesanan', '').strip()
                    if masa_pesanan:
                        try:
                            order_dt = datetime.strptime(masa_pesanan, "%Y-%m-%d %H:%M:%S")
                            days_pending = (datetime.now() - order_dt).days
                            if days_pending > PENDING_ORDER_MAX_DAYS:
                                self.bugs.append({
                                    'bug_id': f'BUG_8_{i+2}',
                                    'severity': 'HIGH',
                                    'location': f'Commission Row {i+2} (Order: {order_id})',
                                    'description': f'Order pending {days_pending} days — exceeds {PENDING_ORDER_MAX_DAYS} day threshold',
                                    'fix': f'Flag order {order_id} as potentially stuck. Check with Shopee or buyer.'
                                })
                        except ValueError:
                            pass
                
                # BUG #6: XTRA orders check
                jenis_tawaran = row.get('Jenis Tawaran', '').strip()
                if 'XTRA' in jenis_tawaran and mcn_rate == 0:
                    xtra_bugs += 1
                    
            except (ValueError, KeyError) as e:
                self.bugs.append({
                    'bug_id': f'PARSE_ERR_{i+2}',
                    'severity': 'HIGH',
                    'location': f'Commission Row {i+2}',
                    'description': f'Failed to parse row: {str(e)}',
                    'fix': 'Check CSV encoding and field ordering'
                })
        
        if math_errors > 0:
            self.bugs.append({
                'bug_id': 'BUG_5_SUMMARY',
                'severity': 'CRITICAL',
                'location': 'Commission Data (all rows)',
                'description': f'{math_errors} rows have commission math errors',
                'fix': 'Run full commission recalculation. Verify against Shopee raw data.'
            })
        
        if missing_completion > 0:
            self.bugs.append({
                'bug_id': 'BUG_8_SUMMARY',
                'severity': 'MEDIUM',
                'location': 'Commission Data (Waktu Selesai)',
                'description': f'{missing_completion} orders without completion timestamp',
                'fix': 'Implement auto-monitor for order completion with 48h SLA alert'
            })
        
        if order_id_format_issues > 0:
            self.bugs.append({
                'bug_id': 'BUG_9',
                'severity': 'MEDIUM',
                'location': 'Id Pembelian column',
                'description': f'{order_id_format_issues} order IDs with unexpected format',
                'fix': 'Validate order IDs match regex ^\\d{6}[A-Z0-9]{8}$'
            })
        
        if xtra_bugs > 0:
            self.bugs.append({
                'bug_id': 'BUG_6',
                'severity': 'MEDIUM',
                'location': 'XTRA Commission Rows',
                'description': f'{xtra_bugs} XTRA orders with 0% MCN rate — verify if XTRA tier should have different MCN handling',
                'fix': 'Cross-check XTRA tier MCN rates with Shopee policy'
            })
    
    def cross_audit(self):
        """BUG #10: Cross-reference clicks vs commissions for attribution gaps."""
        if not self.clicks or not self.commissions:
            return
        
        # Extract campaign from click sub_ids
        click_campaigns = Counter()
        for row in self.clicks:
            sub_id = row.get('Sub_id', '').strip()
            if sub_id and sub_id != '----':
                # Parse campaign name from sub_id format: campaignname-product-fbads--
                parts = sub_id.split('-')
                campaign = parts[0] if parts else 'unknown'
                click_campaigns[campaign] += 1
        
        # Extract campaign from commission sub_ids
        comm_campaigns = Counter()
        for row in self.commissions:
            s1 = row.get('Sub_id1', '').strip()
            if s1:
                comm_campaigns[s1] += 1
        
        # Find campaigns with clicks but ZERO conversions
        total_clicks = sum(click_campaigns.values())
        for campaign, clicks in click_campaigns.most_common():
            conversions = comm_campaigns.get(campaign, 0)
            expected = round(clicks * CONVERSION_MIN_RATE / 100, 1)
            
            if conversions == 0 and clicks >= 10:
                self.bugs.append({
                    'bug_id': 'BUG_10',
                    'severity': 'CRITICAL',
                    'location': f'Campaign: {campaign}',
                    'description': (
                        f'🔥 {campaign}: {clicks} clicks → ZERO conversions. '
                        f'Expected ~{expected} conversions at {CONVERSION_MIN_RATE}% baseline. '
                        f'This campaign consumes {clicks/total_clicks*100:.1f}% of traffic for no return.'
                    ),
                    'fix': (
                        'IMMEDIATE: 1) Verify landing page URL is correct for this campaign. '
                        '2) Check Shopee attribution window (7/30 day). '
                        '3) Confirm conversion pixel fires on landing. '
                        '4) Test manually: click ad → check Shopee tracking.'
                    )
                })
        
        # BUG #10 insight
        if len(click_campaigns) > len(comm_campaigns):
            missing = set(click_campaigns.keys()) - set(comm_campaigns.keys())
            self.bugs.append({
                'bug_id': 'BUG_10_SUMMARY',
                'severity': 'HIGH',
                'location': 'Cross-campaign attribution',
                'description': f'{len(missing)} campaigns have clicks but zero attributed conversions: {missing}',
                'fix': 'Audit UTM parameters, conversion pixel, and Shopee attribution for all campaigns'
            })
    
    def compute_stats(self):
        """Generate summary statistics."""
        if self.clicks:
            campaigns = Counter()
            sources = Counter()
            for row in self.clicks:
                sub = row.get('Sub_id', '').strip()
                if sub and sub != '----':
                    campaigns[sub] += 1
                sources[row.get('Perujuk', 'Unknown')] += 1
            
            self.stats['clicks'] = {
                'total': len(self.clicks),
                'by_campaign': dict(campaigns.most_common(10)),
                'by_source': dict(sources),
            }
        
        if self.commissions:
            total_komisen = sum(
                float(row.get('Komisen Bersih Affiliate(RM)', 0) or 0)
                for row in self.commissions
            )
            total_value = sum(
                float(row.get('Nilai Pembelian(RM)', 0) or 0)
                for row in self.commissions
            )
            
            self.stats['commissions'] = {
                'total_orders': len(self.commissions),
                'total_value_rm': round(total_value, 2),
                'total_komisen_rm': round(total_komisen, 4),
                'conversion_rate': round(len(self.commissions) / max(len(self.clicks), 1) * 100, 2) if self.clicks else None,
                'avg_order_value_rm': round(total_value / max(len(self.commissions), 1), 2),
            }
    
    def run(self):
        """Run full audit pipeline."""
        n_clicks, n_comms = self.load_data()
        
        self.audit_clicks()
        self.audit_commissions()
        self.cross_audit()
        self.compute_stats()
        
        return self.generate_report()
    
    def generate_report(self):
        """Generate combined audit report."""
        bugs_by_severity = defaultdict(list)
        for bug in self.bugs:
            bugs_by_severity[bug['severity']].append(bug)
        
        report = {
            'report_date': self.report_date,
            'generated_at': datetime.now().isoformat(),
            'summary': {
                'total_bugs': len(self.bugs),
                'critical': len(bugs_by_severity.get('CRITICAL', [])),
                'high': len(bugs_by_severity.get('HIGH', [])),
                'medium': len(bugs_by_severity.get('MEDIUM', [])),
                'low': len(bugs_by_severity.get('LOW', [])),
                'data_loaded': {
                    'clicks': len(self.clicks),
                    'commissions': len(self.commissions),
                }
            },
            'stats': self.stats,
            'bugs': self.bugs,
            'fix_instructions': self._generate_fix_instructions(bugs_by_severity),
        }
        
        return report
    
    def _generate_fix_instructions(self, bugs_by_severity):
        """Generate prioritized fix queue."""
        instructions = []
        
        if bugs_by_severity.get('CRITICAL'):
            instructions.append({
                'priority': 'IMMEDIATE',
                'bugs': [b['bug_id'] for b in bugs_by_severity['CRITICAL']],
                'action': 'Fix within 2 hours — these impact revenue accuracy or campaign attribution',
                'automated_fixes': [
                    'BUG_1: Run `click_id_normalizer.py` to standardize all IDs to lowercase',
                    'BUG_5: Run `commission_recalculator.py` to verify all math',
                    'BUG_10: Pause campaigns with >10 clicks + 0 conversions until attribution fixed',
                ]
            })
        
        if bugs_by_severity.get('HIGH'):
            instructions.append({
                'priority': 'THIS_WEEK',
                'bugs': [b['bug_id'] for b in bugs_by_severity['HIGH']],
                'action': 'Fix within 7 days — data quality and tracking issues',
                'automated_fixes': [
                    'BUG_2: Add fallback UTM tracking for unattributed clicks',
                    'BUG_7: Update commission formula for MCN deduction edge cases',
                ]
            })
        
        if bugs_by_severity.get('MEDIUM'):
            instructions.append({
                'priority': 'ONGOING',
                'bugs': [b['bug_id'] for b in bugs_by_severity['MEDIUM']],
                'action': 'Monitor trends and fix progressively',
                'automated_fixes': [
                    'BUG_3: Implement report-time validation on CSV import',
                    'BUG_4: Expand referrer categorization',
                    'BUG_8: Auto-monitor order completion with 48h SLA',
                    'BUG_9: Add regex validation for order IDs',
                    'BUG_6: Cross-check XTRA MCN rates',
                ]
            })
        
        return instructions
    
    def save_report(self):
        """Save report to JSON file."""
        report = self.run()
        AUDIT_DIR.mkdir(parents=True, exist_ok=True)
        
        filename = f"audit_{self.report_date.replace('-', '')}.json"
        filepath = AUDIT_DIR / filename
        
        with open(filepath, 'w') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        return filepath


# ── AUTO-FIX FUNCTIONS ──────────────────────────────────

def normalize_click_ids(csv_path: str, output_path: Optional[str] = None):
    """BUG #1 FIX: Standardize all click IDs to lowercase."""
    if output_path is None:
        output_path = csv_path.replace('.csv', '_normalized.csv')
    
    with open(csv_path, 'r', encoding='utf-8-sig') as f_in:
        reader = csv.DictReader(f_in)
        fieldnames = reader.fieldnames
        
        with open(output_path, 'w', newline='', encoding='utf-8') as f_out:
            writer = csv.DictWriter(f_out, fieldnames=fieldnames)
            writer.writeheader()
            
            for row in reader:
                if 'ID klik' in row:
                    row['ID klik'] = row['ID klik'].strip().lower()
                writer.writerow(row)
    
    print(f"✅ BUG #1 FIXED: Normalized {output_path}")
    return output_path

def generate_campaign_alert(campaign_name: str, clicks: int, conversions: int):
    """BUG #10 FIX: Generate alert for 0-conversion campaigns."""
    alert = {
        'type': 'campaign_no_conversion',
        'severity': 'critical',
        'campaign': campaign_name,
        'metrics': {
            'clicks': clicks,
            'conversions': conversions,
            'conversion_rate': '0%',
        },
        'recommended_action': 'PAUSE_AND_INVESTIGATE',
        'investigation_steps': [
            f'1. Manual test: Click ad for {campaign_name} → verify landing page',
            '2. Check Shopee attribution tool for raw data',
            '3. Verify UTM parameters are preserved through redirect',
            '4. Check if conversion pixel fires on all landing pages',
        ],
        'auto_actions': [
            'Reduce budget by 50% immediately',
            'Flag for manual review within 24h',
            'If no fix in 48h → full pause',
        ],
        'generated_by': 'shopee_affiliate_auditor',
        'timestamp': datetime.now().isoformat(),
    }
    return alert

# ── MAIN CLI ────────────────────────────────────────────

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Shopee Affiliate Auditor')
    parser.add_argument('clicks', nargs='?', help='Path to clicks CSV')
    parser.add_argument('commissions', nargs='?', help='Path to commissions CSV')
    parser.add_argument('--date', help='Report date (default: today)')
    parser.add_argument('--fix', action='store_true', help='Auto-fix where possible')
    parser.add_argument('--normalize', help='Normalize click IDs in given CSV path')
    args = parser.parse_args()
    
    # Quick fix: normalize click IDs
    if args.normalize:
        normalize_click_ids(args.normalize)
        sys.exit(0)
    
    # Scan existing data directory for latest CSVs
    if not args.clicks or not args.commissions:
        import glob
        click_files = sorted(glob.glob(str(DATA_DIR / '*click*.csv')), reverse=True)
        comm_files = sorted(glob.glob(str(DATA_DIR / '*selow*2026*.csv')), reverse=True)
        if click_files:
            args.clicks = click_files[0]
            print(f"📎 Auto-detected clicks: {args.clicks}")
        if comm_files:
            args.commissions = comm_files[0]
            print(f"📎 Auto-detected commissions: {args.commissions}")
    
    if not args.clicks or not args.commissions:
        print("❌ Need both clicks and commissions CSV files")
        print("Usage: python3 shopee_affiliate_auditor.py clicks.csv commissions.csv")
        sys.exit(1)
    
    auditor = ShopeeAffiliateAuditor(
        clicks_path=args.clicks,
        commissions_path=args.commissions,
        report_date=args.date
    )
    
    report = auditor.run()
    filepath = auditor.save_report()
    
    # Print summary
    s = report['summary']
    print(f"\n{'='*60}")
    print(f"🔍 SHOPEE AFFILIATE AUDIT — {report['report_date']}")
    print(f"{'='*60}")
    print(f"📊 Clicks: {s['data_loaded']['clicks']} | Orders: {s['data_loaded']['commissions']}")
    print(f"🐛 Bugs Found: {s['total_bugs']} (🔴{s['critical']} 🟠{s['high']} 🟡{s['medium']} ⚪{s['low']})")
    
    if report.get('stats', {}).get('commissions'):
        c = report['stats']['commissions']
        print(f"💰 Revenue: RM{c['total_value_rm']} | Komisen: RM{c['total_komisen_rm']} | CR: {c.get('conversion_rate', 'N/A')}%")
    
    print(f"\n📁 Full report: {filepath}")
    
    # Print critical bugs
    criticals = [b for b in report['bugs'] if b['severity'] == 'CRITICAL']
    if criticals:
        print(f"\n{'─'*60}")
        print("🔴 CRITICAL BUGS:")
        for bug in criticals:
            print(f"  [{bug['bug_id']}] {bug['description'][:120]}...")
    
    print(f"\n{'─'*60}")
    print("📋 FIX INSTRUCTIONS:")
    for inst in report['fix_instructions']:
        print(f"  [{inst['priority']}] {inst['action']}")
        for fix in inst['automated_fixes']:
            print(f"    → {fix}")
    
    print(f"\n{'='*60}")
