#!/usr/bin/env python3
"""
ads_update_handler.py — Update dashboard data from Telegram messages.
Veris kirim data via chat → script ini update report files → dashboard auto-refresh.

Usage (called internally by Vilona):
  python3 scripts/ads_update_handler.py revenue --source "Shopee" --amount 150000
  python3 scripts/ads_update_handler.py note --campaign "Rak Piring" --note "Scale test berjalan baik, CTR 2.1%"
  python3 scripts/ads_update_handler.py status --account "0858" --message "Bid cap sudah direset ke 130"
"""
import json, os, sys
from datetime import datetime

REPORTS_DIR = 'reports'
MANUAL_DATA_FILE = os.path.join(REPORTS_DIR, 'manual_ads_data.json')
os.makedirs(REPORTS_DIR, exist_ok=True)

def load_manual_data():
    if os.path.exists(MANUAL_DATA_FILE):
        try:
            return json.load(open(MANUAL_DATA_FILE))
        except Exception:
            pass
    return {'revenue_entries': [], 'notes': [], 'status_updates': []}

def save_manual_data(data):
    with open(MANUAL_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2, default=str)

def add_revenue(source, amount, note=''):
    data = load_manual_data()
    entry = {
        'timestamp': datetime.now().isoformat(),
        'source': source,
        'amount': amount,
        'note': note,
    }
    data['revenue_entries'].append(entry)
    save_manual_data(data)
    
    # Also write to a simple text report for quick reading
    report_path = os.path.join(REPORTS_DIR, 'manual_revenue_log.txt')
    with open(report_path, 'a') as f:
        f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M')}] {source}: Rp{amount:,} - {note}\n")
    
    return entry

def add_note(campaign, note):
    data = load_manual_data()
    entry = {
        'timestamp': datetime.now().isoformat(),
        'campaign': campaign,
        'note': note,
    }
    data['notes'].append(entry)
    save_manual_data(data)
    
    # Also update notes file for dashboard consumption
    notes_path = os.path.join(REPORTS_DIR, 'campaign_notes.json')
    try:
        notes = json.load(open(notes_path))
    except Exception:
        notes = {}
    if campaign not in notes:
        notes[campaign] = []
    notes[campaign].append({'time': datetime.now().strftime('%Y-%m-%d %H:%M'), 'note': note})
    with open(notes_path, 'w') as f:
        json.dump(notes, f, indent=2)
    
    return entry

def add_status_update(account, message):
    data = load_manual_data()
    entry = {
        'timestamp': datetime.now().isoformat(),
        'account': account,
        'message': message,
    }
    data['status_updates'].append(entry)
    save_manual_data(data)
    
    # Update a simple status file
    status_path = os.path.join(REPORTS_DIR, 'account_status_updates.json')
    try:
        statuses = json.load(open(status_path))
    except Exception:
        statuses = {}
    if account not in statuses:
        statuses[account] = []
    statuses[account].append({'time': datetime.now().strftime('%Y-%m-%d %H:%M'), 'message': message})
    with open(status_path, 'w') as f:
        json.dump(statuses, f, indent=2)
    
    return entry

def generate_combined_report():
    """Generate a combined report JSON that the dashboard can read."""
    data = load_manual_data()
    
    total_revenue = sum(e['amount'] for e in data['revenue_entries'])
    
    report = {
        'last_updated': datetime.now().isoformat(),
        'total_manual_revenue': total_revenue,
        'revenue_entries_count': len(data['revenue_entries']),
        'notes_count': len(data['notes']),
        'status_updates_count': len(data['status_updates']),
        'recent_revenue': data['revenue_entries'][-5:] if data['revenue_entries'] else [],
        'recent_notes': data['notes'][-5:] if data['notes'] else [],
        'recent_status': data['status_updates'][-5:] if data['status_updates'] else [],
    }
    
    report_path = os.path.join(REPORTS_DIR, 'manual_data_summary.json')
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    return report

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 scripts/ads_update_handler.py revenue --source NAME --amount AMOUNT [--note NOTE]")
        print("  python3 scripts/ads_update_handler.py note --campaign NAME --note NOTE")
        print("  python3 scripts/ads_update_handler.py status --account NAME --message MSG")
        print("  python3 scripts/ads_update_handler.py report  # generate combined report")
        return
    
    cmd = sys.argv[1]
    
    if cmd == 'revenue':
        source = None
        amount = None
        note = ''
        for i, arg in enumerate(sys.argv):
            if arg == '--source' and i+1 < len(sys.argv): source = sys.argv[i+1]
            elif arg == '--amount' and i+1 < len(sys.argv): amount = int(sys.argv[i+1])
            elif arg == '--note' and i+1 < len(sys.argv): note = sys.argv[i+1]
        if source and amount:
            entry = add_revenue(source, amount, note)
            print(f'✅ Revenue added: {source} Rp{amount:,}')
        else:
            print('❌ Need --source and --amount')
    
    elif cmd == 'note':
        campaign = None
        note = ''
        for i, arg in enumerate(sys.argv):
            if arg == '--campaign' and i+1 < len(sys.argv): campaign = sys.argv[i+1]
            elif arg == '--note' and i+1 < len(sys.argv): note = sys.argv[i+1]
        if campaign and note:
            add_note(campaign, note)
            print(f'✅ Note added for {campaign}')
        else:
            print('❌ Need --campaign and --note')
    
    elif cmd == 'status':
        account = None
        message = ''
        for i, arg in enumerate(sys.argv):
            if arg == '--account' and i+1 < len(sys.argv): account = sys.argv[i+1]
            elif arg == '--message' and i+1 < len(sys.argv): message = sys.argv[i+1]
        if account and message:
            add_status_update(account, message)
            print(f'✅ Status update for {account}')
        else:
            print('❌ Need --account and --message')
    
    elif cmd == 'report':
        report = generate_combined_report()
        print(f'✅ Combined report generated')
        print(f'   Total revenue: Rp{report["total_manual_revenue"]:,}')
        print(f'   Notes: {report["notes_count"]}')
        print(f'   Status updates: {report["status_updates_count"]}')

if __name__ == '__main__':
    main()
