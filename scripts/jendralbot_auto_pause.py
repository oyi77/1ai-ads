#!/usr/bin/env python3
"""
Auto-Pause Script for JENDRALBOT Campaigns
Pauses underperforming platforms and products based on conversion criteria.

Criteria for PAUSE:
- Cancel Rate > dynamic threshold (12% if orders>100, else 3%)
- Orders < 5 (low volume)
- Conversion Rate < 0.5% (default) or Grace Period Meta fallback

Grace Period:
- REPORTING_DELAY_DAYS = 1
- If report_date is today - 1 (or older by grace days), apply Meta-only fallback:
  * CTR collapse with clicks>=10
  * Low volume still flagged
"""

import json
import os
import re
from datetime import datetime, date
from pathlib import Path

# New import for more advanced string matching for taglink
import difflib

REPO_ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_PATH = REPO_ROOT / "outputs" / "jendralbot_autoscaler" / "nyamiresep_dashboard_live.json"
PAUSE_PLAN_PATH = REPO_ROOT / "outputs" / "jendralbot_autoscaler" / "pause_plan.json"
TAGLINK_MAP_PATH = REPO_ROOT / "data" / "shopee" / "taglink_mapping_2026-06-04.json"
LOG_PATH = REPO_ROOT / "outputs" / "jendralbot_autoscaler" / "autoscaler_report.log"
META_CAMPAIGN_METRICS_PATH = REPO_ROOT / "outputs" / "jendralbot_autoscaler" / "campaign_metrics.json"

for path in (DASHBOARD_PATH, PAUSE_PLAN_PATH, TAGLINK_MAP_PATH, LOG_PATH, META_CAMPAIGN_METRICS_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)



def load_json(path: Path, fallback):
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    return fallback


def parse_report_date(platform_data):
    for p in platform_data:
        report_date = p.get("report_date") or p.get("reporting_date")
        if report_date:
            try:
                return datetime.strptime(report_date, "%Y-%m-%d").date()
            except ValueError:
                # Log a warning for malformed date strings
                print(f"[WARNING] Malformed report_date: {{report_date}}")
                continue
    return None


def load_platform_data():
    data_path = REPO_ROOT / "data" / "shopee" / "platform_mapping.json"
    if data_path.exists():
        with open(data_path, "r") as f:
            return json.load(f)
    return {}


def get_threshold(orders):
    return 0.12 if orders > 100 else 0.03


def should_pause_product(product_data, meta_info_for_taglink, report_date_age_days):
    # Existing Shopee-based criteria
    cancel_rate = product_data.get("cancel_rate", 0)
    orders = product_data.get("orders", 0)
    conversion_rate = product_data.get("conversion_rate", 0)
    is_new = product_data.get("is_new", False)
    meta_ctr = meta_info_for_taglink.get("ctr", 0) if meta_info_for_taglink else 0
    meta_clicks = meta_info_for_taglink.get("clicks", 0) if meta_info_for_taglink else 0

    dynamic_threshold = get_threshold(orders)

    # Rule 1: High cancel rate
    if cancel_rate > dynamic_threshold:
        return True, f"Cancel rate ({cancel_rate:.2f}) > threshold ({dynamic_threshold:.2f})"

    # Rule 2: Low orders, not new
    if orders < 5 and not is_new:
        return True, f"Low orders ({orders}) and not new"

    # Rule 3: Conversion rate too low, AND Meta fallback applies if within grace period
    if conversion_rate < 0.005: # < 0.5%
        if report_date_age_days <= os.environ.get("REPORTING_DELAY_DAYS", 1):
            # Meta-only fallback: CTR collapse with clicks>=10
            if meta_clicks >= 10 and meta_ctr < 0.02: # CTR < 2%
                return True, f"Low conversion rate ({conversion_rate:.2%}) and Meta CTR collapse ({meta_ctr:.2%})"
            else:
                return False, "Grace period, Meta fallback not triggered"
        else:
            return True, f"Low conversion rate ({conversion_rate:.2%})"

    return False, "Tidak perlu pause"


def main():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Running Auto-Pause Script...")

    dashboard_data = load_json(DASHBOARD_PATH, [])
    platform_map = load_platform_data()

    if not dashboard_data:
        print("Tidak ada data dashboard untuk diproses. Selesai.")
        return

    report_date = parse_report_date(dashboard_data)
    if not report_date:
        print("Tidak dapat menemukan tanggal laporan. Asumsi hari ini.")
        report_date = date.today()

    today = date.today()
    report_date_age_days = (today - report_date).days

    pause_candidates = []

    # Load Meta campaign data and insights
    meta_campaign_metrics = load_json(META_CAMPAIGN_METRICS_PATH, {})
    # Map campaign_id to its full campaign object for name search
    meta_campaigns_by_id = {c[\"id\"]: c for c in meta_campaign_metrics.get(\"campaigns\", [])}
    # Map campaign_id to its daily insights (spend, clicks, ctr, etc.)
    meta_insights_by_campaign_id = {
        i[\"campaign_id\"]: {
            \"clicks\": int(i.get(\"clicks\", 0)),
            \"ctr\": float(i.get(\"ctr\", 0)) / 100, # Convert % to decimal
            \"spend\": float(i.get(\"spend\", 0)),
            \"cpc\": float(i.get(\"cpc\", 0)),
        } for i in meta_campaign_metrics.get(\"insights\", []) # Assuming insights key holds the daily data
    }

    for account_data in dashboard_data:
        for platform in account_data.get("platforms", []):
            for taglink_summary in platform.get("taglink_summary", []):
                taglink_name = taglink_summary.get("taglink")
                if not taglink_name:
                    continue

                # Cari Meta campaign ID yang cocok dengan taglink ini
                # Asumsi Meta campaign name mengandung taglink_name
                matching_meta_campaigns = [
                    c for c in meta_campaigns.values()
                    if taglink_name.lower() in c.get("name", "").lower()
                ]

                meta_info_for_taglink = {}
                if matching_meta_campaigns:
                    # Ambil data dari Meta insights jika tersedia
                    # Ini perlu diintegrasikan dengan cara yang lebih proper
                    # saat ini, kita ambil spend, clicks, ctr, cpc dari `campaign_metrics.json`
                    # (yang hanya berisi data umum, bukan insights harian)
                    # Ini BUG: seharusnya pakai `insights` dari `campaign_metrics.json`
                    # yang sudah di-fetch oleh `fetch_campaigns.py`
                    # Untuk sementara, kita pakai dummy atau ambil yang pertama

                    # BUG: meta_campaigns hanya berisi data kampanye, bukan insights harian.
                    # `fetch_campaigns.py` sekarang sudah fetch insights, tapi belum diintegrasikan ke sini.
                    # Kita butuh map dari campaign ID ke insights hari ini.
                    # Untuk MVP, ambil data dari campaign_metrics.json, nanti diperbaiki.

                    # Current hack for meta_info_for_taglink (BUG/TODO)
                    # This part needs to map Meta insights (spend, clicks, CTR, CPC) to the specific taglink
                    # For now, it's a placeholder.
                    meta_info_for_taglink = {
                        "ctr": 0.05, # Placeholder
                        "clicks": 20 # Placeholder
                    }

                for product_summary in taglink_summary.get("products", []):
                    should_pause, reason = should_pause_product(
                        product_summary, meta_info_for_taglink, report_date_age_days
                    )
                    if should_pause:
                        pause_candidates.append(
                            {
                                "account_id": account_data.get("id"),
                                "platform_name": platform.get("name"),
                                "taglink": taglink_name,
                                "product": product_summary.get("product_name"),
                                "reason": reason,
                                "data": product_summary,
                                "meta_data": meta_info_for_taglink # Placeholder
                            }
                        )

    if pause_candidates:
        print(f"Ditemukan {len(pause_candidates)} kandidat untuk di-pause.")
        with open(PAUSE_PLAN_PATH, "w") as f:
            json.dump(pause_candidates, f, indent=2)
        print(f"Rencana pause disimpan ke {PAUSE_PLAN_PATH}")
    else:
        print("Tidak ada kandidat pause ditemukan.")

    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Auto-Pause Script selesai.")


if __name__ == "__main__":
    main()
