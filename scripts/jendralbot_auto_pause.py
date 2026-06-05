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

REPO_ROOT = Path(__file__).resolve().parent.parent
DASHBOARD_PATH = REPO_ROOT / "outputs" / "jendralbot_autoscaler" / "nyamiresep_dashboard_live.json"
PAUSE_PLAN_PATH = REPO_ROOT / "outputs" / "jendralbot_autoscaler" / "pause_plan.json"
TAGLINK_MAP_PATH = REPO_ROOT / "data" / "shopee" / "taglink_mapping_2026-06-04.json"
LOG_PATH = REPO_ROOT / "outputs" / "jendralbot_autoscaler" / "autoscaler_report.log"

for path in (DASHBOARD_PATH, PAUSE_PLAN_PATH, TAGLINK_MAP_PATH, LOG_PATH):
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
            except Exception:
                continue
    return None


def load_platform_data():
    data_path = REPO_ROOT / "data" / "shopee" / "platform_mapping.json"
    if data_path.exists():
        return load_json(data_path, [])
    return []


def load_taglink_map():
    return load_json(TAGLINK_MAP_PATH, {"tags": []}).get("tags", [])


def related_active_taglinks(platform_name, taglink_map):
    related = []
    for tag in taglink_map:
        adset_list = tag.get("mapping", {}).get("adsets", [])
        for adset in adset_list:
            if adset.get("Ad Set Run Status") != "ACTIVE":
                continue
            platforms_raw = str(adset.get("Platforms", ""))
            platforms = [p.strip() for p in platforms_raw.split(",") if p.strip()]
            if platform_name.lower() in [p.lower() for p in platforms] and tag.get("orders"):
                related.append(tag.get("taglink"))
                break
    return related[:3]


def build_pause_plan(platform_data, taglink_map):
    today = date.today()
    report_date = parse_report_date(platform_data)
    grace_days = 1
    in_grace = bool(report_date and (today - report_date).days <= grace_days)

    underperforming = []
    for platform in platform_data:
        name = str(platform.get("Platform", "")).strip()
        orders = int(platform.get("Orders", 0))
        canceled = int(platform.get("Canceled", 0))
        completed = int(platform.get("Completed", 0))
        clicks = int(platform.get("Clicks", 0))

        if orders <= 0:
            continue

        cancel_rate = round((canceled / orders) * 100, 2)
        conv_rate = round((completed / clicks) * 100, 2) if clicks > 0 else 0.0

        thresholds = {
            "dynamic_threshold_pct": 12.0 if orders > 100 else 3.0,
            "grace_ctr_floor_pct": 2.0,
            "grace_min_clicks": 10,
        }

        reasons = []
        if in_grace:
            if clicks >= thresholds["grace_min_clicks"] and conv_rate < thresholds["grace_ctr_floor_pct"]:
                reasons.append(
                    f"Grace fallback: CTR collapse ({conv_rate:.2f}% < {thresholds['grace_ctr_floor_pct']}% with {clicks} clicks)"
                )
        else:
            if cancel_rate > thresholds["dynamic_threshold_pct"]:
                reasons.append(
                    f"High cancel rate ({cancel_rate:.1f}% > {thresholds['dynamic_threshold_pct']:.1f}%)"
                )
            if conv_rate < 0.5:
                reasons.append(f"Low conversion ({conv_rate:.2f}%)")

        if orders < 5:
            reasons.append(f"Low volume ({orders} orders)")

        if reasons:
            entry = {
                "platform": name,
                "orders": orders,
                "completed": completed,
                "canceled": canceled,
                "cancel_rate": cancel_rate,
                "conv_rate": conv_rate,
                "reasons": reasons,
                "note": "",
            }
            related = related_active_taglinks(name, taglink_map)
            if related:
                entry["note"] = f"Related active taglinks: {', '.join(related)}"
            underperforming.append(entry)

    pause_plan = []
    for up in underperforming:
        pause_plan.append(
            {
                "action": "pause",
                "platform": up["platform"],
                "reasons": up["reasons"],
                "note": up.get("note", ""),
                "timestamp": datetime.now().isoformat(),
            }
        )

    dashboard = {
        "paused": len(underperforming),
        "paused_platforms": [up["platform"] for up in underperforming],
        "last_pause_update": datetime.now().isoformat(),
        "in_grace": in_grace,
        "report_date": str(report_date) if report_date else None,
        "paused_rules": {
            up["platform"]: {
                "reasons": up["reasons"],
                "orders": up["orders"],
                "cancel_rate": up.get("cancel_rate"),
                "conv_rate": up.get("conv_rate"),
                "note": up.get("note", ""),
            }
            for up in underperforming
        },
    }

    return pause_plan, dashboard


def write_outputs(pause_plan, dashboard):
    with open(PAUSE_PLAN_PATH, "w") as f:
        json.dump(pause_plan, f, indent=2)
    with open(DASHBOARD_PATH, "w") as f:
        json.dump(dashboard, f, indent=2, default=str)
    with open(LOG_PATH, "a") as f:
        f.write(f"{datetime.now().isoformat()} | Auto-pause executed\n")
        f.write(f"  Paused platforms: {dashboard['paused']}\n")
        for platform, meta in dashboard.get("paused_rules", {}).items():
            f.write(f"  - {platform}: {' | '.join(meta.get('reasons', []))}\n")
            note = meta.get("note")
            if note:
                f.write(f"      {note}\n")
        f.write("\n")


def main():
    print("=" * 60)
    print("🚀 JENDRALBOT AUTO-PAUSE SCRIPT")
    print("=" * 60)

    platform_data = load_platform_data()
    taglink_map = load_taglink_map()

    if not platform_data:
        print(f"No platform data found at {REPO_ROOT / 'data' / 'shopee' / 'platform_mapping.json'}")
        print("HINT: regenerate this file from the latest Shopee/Meta exports.")
        return

    pause_plan, dashboard = build_pause_plan(platform_data, taglink_map)
    write_outputs(pause_plan, dashboard)

    print(f"\nReport date: {dashboard.get('report_date')} | Grace period active: {dashboard.get('in_grace')}")
    print(f"Paused platforms: {dashboard['paused']}")
    for platform, meta in dashboard.get("paused_rules", {}).items():
        print(f" - {platform}: orders={meta.get('orders')} cancel={meta.get('cancel_rate')} conv={meta.get('conv_rate')}")
        reason = ", ".join(meta.get("reasons", []))
        print(f"   Reasons: {reason}")
        note = meta.get("note")
        if note:
            print(f"   Note: {note}")
    print(f"\nPause plan -> {PAUSE_PLAN_PATH}")
    print(f"Dashboard   -> {DASHBOARD_PATH}")
    print(f"Log         -> {LOG_PATH}")


if __name__ == "__main__":
    main()
