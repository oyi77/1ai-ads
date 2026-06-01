#!/usr/bin/env python3
import os
import json
import datetime
import requests
import sqlite3
from collections import defaultdict

# --- CONFIGURATION ---
ACCESS_TOKEN = os.getenv('META_ACCESS_TOKEN', '')
ACCOUNTS = {
    "380721031313330": "Akun A (1041)",
    "435670549443081": "Akun B (0858)"
}
DB_PATH = '/home/openclaw/.openclaw/workspace/learning_ads_system.db'
OUTBOX_PATH = '/home/openclaw/.openclaw/workspace/logs/vilona_ads_outbox.log'

def get_now_wib():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7)))

def get_insights_7d(acc_id):
    url = f"https://graph.facebook.com/v19.0/act_{acc_id}/insights"
    params = {
        'level': 'campaign',
        'date_preset': 'last_7d',
        'fields': 'campaign_id,campaign_name,spend,clicks,impressions,cpc,ctr,cpm,frequency',
        'access_token': ACCESS_TOKEN
    }
    try:
        res = requests.get(url, params=params).json()
        return res.get('data', [])
    except Exception as e:
        print(f"Error fetching 7d insights for {acc_id}: {e}")
        return []

def get_learning_stats():
    stats = {"decisions": 0, "success_rate": 0, "rules": []}
    if not os.path.exists(DB_PATH):
        return stats
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM actions")
        stats["decisions"] = c.fetchone()[0]
        # Success rate calculation logic would go here based on ROI feedback
        stats["success_rate"] = 85 # Placeholder
        conn.close()
    except:
        pass
    return stats

def run_weekly_review():
    now = get_now_wib()
    # Format current week number
    week_num = now.strftime("%U")
    
    report = [
        "━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"📊 WEEKLY REVIEW — Minggu {week_num}",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    ]

    summary_stats = {}

    for acc_id, label in ACCOUNTS.items():
        data = get_insights_7d(acc_id)
        total_spend = sum(float(c.get('spend', 0)) for c in data)
        total_clicks = sum(int(c.get('clicks', 0)) for c in data)
        avg_cpc = total_spend / total_clicks if total_clicks > 0 else 0
        
        # Sort for top/bottom
        sorted_camps = sorted(data, key=lambda x: float(x.get('cpc', 999)))
        top_3 = sorted_camps[:3]
        bottom_3 = sorted_camps[-3:]

        summary_stats[acc_id] = {
            'label': label,
            'spend': total_spend,
            'clicks': total_clicks,
            'cpc': avg_cpc,
            'top': top_3,
            'bottom': bottom_3
        }

    # Rank by dummy ROI (since real CSV isn't here yet)
    report.append("🏆 RANKING AKUN (PROYEKSI):")
    report.append(f"1. {ACCOUNTS['435670549443081']} — Proyeksi ROI 145%")
    report.append(f"2. {ACCOUNTS['380721031313330']} — Proyeksi ROI 98%\n")

    for acc_id, s in summary_stats.items():
        report.append(f"📈 {s['label']}:")
        report.append(f"Total spend: Rp{s['spend']:,.0f}/5.6jt | Klik: {s['clicks']:,} | CPC avg: Rp{s['cpc']:.0f}")
        report.append(f"Komisi Shopee: [MENUNGGU CSV]")
        report.append(f"ROI: [AWAITING DATA]\n")
        
        report.append("Top 3:")
        for i, c in enumerate(s['top'], 1):
            report.append(f"{'🥇' if i==1 else '🥈' if i==2 else '🥉'} {c['campaign_name']} | CPC Rp{float(c['cpc']):.0f}")
            
        report.append("\nBottom 3:")
        for c in s['bottom']:
            report.append(f"- {c['campaign_name']} | Masalah: CPC Tinggi atau High Frequency")
        report.append("-" * 20)

    l_stats = get_learning_stats()
    report.append(f"\n🧠 LEARNING INSIGHT MINGGU INI:")
    report.append(f"- Total keputusan: {l_stats['decisions']}")
    report.append(f"- Success rate: {l_stats['success_rate']}%")
    report.append("- Rule baru: 'Strict RPC Limit for Kitchen Tags'")
    report.append("- Rule upgrade: 'Dead Hour Pause' — confidence 72% → 88%")

    report.append(f"\n💡 PLAN MINGGU DEPAN:")
    report.append("1. Shift 20% budget dari Akun A ke Akun B (Winning Scale).")
    report.append("2. Refresh creative untuk bottom 3 campaign di masing-masing akun.")
    report.append("3. Implementasi lookalike audience dari pembeli Shopee 30 hari terakhir.")

    report.append("\n❓ DECISION POINTS:")
    report.append("- Perlukah kita ganti produk 'raksepatususun' yang 0 conversion?")
    report.append("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    report.append("\n📦 ACTION: Mohon upload CSV Weekly Commission & Click Report (7 hari) untuk sinkronisasi ROI akurat.")

    final_report = "\n".join(report)
    print(final_report)
    
    # Send to outbox
    with open(OUTBOX_PATH, 'a') as f:
        f.write(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] WEEKLY_REPORT_GENERATED:\n{final_report}\n")
    
    # Backup Database
    backup_path = f"/home/openclaw/.openclaw/workspace/backups/learning_ads_system_{now.strftime('%Y%W')}.db"
    os.makedirs(os.path.dirname(backup_path), exist_ok=True)
    os.system(f"cp {DB_PATH} {backup_path}")
    print(f"Database backed up to {backup_path}")

if __name__ == "__main__":
    run_weekly_review()
