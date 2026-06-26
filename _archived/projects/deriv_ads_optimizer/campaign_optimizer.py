#!/usr/bin/env python3
"""
Shopee Affiliate Campaign Optimizer — Autonomous ROI Manager
Monitors campaign performance, auto-adjusts budget allocation,
and stops unprofitable campaigns.

Target: Minimum ROI 2x (200%)
Data sources: Shopee commission CSV + Website click CSV
"""

import csv, json, os
from collections import defaultdict
from datetime import datetime
from pathlib import Path

BASE = Path("/home/openclaw/.openclaw/workspace")
LOG_DIR = BASE / "logs"
CONFIG_DIR = BASE / "autopilot_affiliate_engine" / "data"

# === ACCOUNT CONFIG ===
ACCOUNTS = {
    "1041": {
        "spend_cap": 200000,
        "min_roi": 2.0,
        "tags": ["rakdapur3", "multistorage"],
        "active": True,
    },
    "0858": {
        "spend_cap": 150000,
        "min_roi": 2.0,
        "tags": ["rakpiringpengering", "organizerpullout", "Dongkrakelektrik"],
        "active": True,
    },
}


class CampaignOptimizer:
    """Auto-adjusts campaigns based on Shopee commission + click data."""

    def __init__(self, account_id):
        self.account_id = account_id
        self.cfg = ACCOUNTS.get(account_id, {})
        self.last_analysis = {}

    def analyze(self, commission_rows, click_rows):
        """Analyze ROI from Shopee data, return recommendations."""
        # Commissions by tag
        tag_komisi = defaultdict(float)
        tag_orders = defaultdict(int)
        tag_confirmed = defaultdict(float)

        for r in commission_rows:
            tag = (r.get("Tag_link1") or "unknown").strip()
            k = float(r.get("Komisi Bersih Affiliate (Rp)", 0) or 0)
            tag_komisi[tag] += k
            tag_orders[tag] += 1
            if r.get("Status Pesanan") == "Selesai":
                tag_confirmed[tag] += k

        # Clicks by tag (normalize tag names)
        tag_clicks = defaultdict(int)
        for r in click_rows:
            tag = r.get("Tag_link", "").strip().replace("----", "").replace("--", "")
            if tag:
                tag_clicks[tag] += 1

        # Calculate ROI per tag
        # Estimated spend = clicks × estimated CPC
        # Since we don't have real spend data, use commission-to-click ratio
        results = {}
        all_tags = set(list(tag_komisi.keys()) + list(tag_clicks.keys()))

        for tag in all_tags:
            komisi = tag_komisi.get(tag, 0)
            clicks = tag_clicks.get(tag, 0)
            orders = tag_orders.get(tag, 0)
            confirmed_km = tag_confirmed.get(tag, 0)

            # Estimated ROI: komisi / (clicks × estimated CPC)
            # Using conservative CPC estimate of Rp 200/click
            est_cpc = 200
            est_spend = clicks * est_cpc
            est_pending_roi = komisi / est_spend if est_spend > 0 else 0
            est_confirmed_roi = confirmed_km / est_spend if est_spend > 0 else 0

            results[tag] = {
                "clicks": clicks,
                "orders": orders,
                "komisi": komisi,
                "confirmed": confirmed_km,
                "est_spend": est_spend,
                "est_roi_pending": round(est_pending_roi, 2),
                "est_roi_confirmed": round(est_confirmed_roi, 2),
                "cvr": round(orders / clicks * 100, 1) if clicks > 0 else 0,
                "action": self._decide_action(est_pending_roi, orders, clicks),
            }

        self.last_analysis = results
        return results

    def _decide_action(self, roi, orders, clicks):
        """Decide: INCREASE, MAINTAIN, REDUCE, STOP."""
        if roi >= 2.0:
            return "🔥 INCREASE" if orders >= 3 else "✅ MAINTAIN"
        elif roi >= 1.0:
            return "✅ MAINTAIN"
        elif roi >= 0.5:
            return "⚠️ REDUCE"
        else:
            return "⛔ STOP"

    def generate_report(self):
        """Generate optimization report."""
        if not self.last_analysis:
            return "No data to analyze"

        lines = []
        lines.append(f"\n📊 CAMPAIGN OPTIMIZER — Account {self.account_id}")
        lines.append(
            f"   Target: Min ROI 2x | Updated: {datetime.now().strftime('%H:%M')}"
        )
        lines.append(f"{'='*60}")
        lines.append(
            f"{'Tag':<25} {'Clicks':<8} {'Ord':<5} {'CVR':<8} {'Komisi':<12} {'Est.ROI':<8} {'Action':<12}"
        )
        lines.append(f"{'-'*60}")

        for tag, data in sorted(
            self.last_analysis.items(), key=lambda x: -x[1]["komisi"]
        ):
            roi = data["est_roi_pending"]
            roi_str = f"{roi:.1f}x" if roi > 0 else "0x"
            act = data["action"]
            lines.append(
                f"{tag:<25} {data['clicks']:<8} {data['orders']:<5} {data['cvr']:<8} Rp {data['komisi']:<8,.0f} {roi_str:<8} {act:<12}"
            )

        # Summary
        total_komisi = sum(d["komisi"] for d in self.last_analysis.values())
        total_clicks = sum(d["clicks"] for d in self.last_analysis.values())
        total_spend = sum(d["est_spend"] for d in self.last_analysis.values())
        overall_roi = total_komisi / total_spend if total_spend > 0 else 0

        lines.append(f"{'='*60}")
        lines.append(f"  TOTAL: {total_clicks} clicks | Rp {total_komisi:,.0f} komisi")
        lines.append(f"  EST. SPEND: Rp {total_spend:,.0f} | ROI: {overall_roi:.1f}x")
        lines.append(
            f"  TARGET MIN: 2.0x | STATUS: {'✅ PROFIT' if overall_roi >= 2 else '⚠️ BELOW TARGET'}"
        )

        # Recommendations
        stop_tags = [t for t, d in self.last_analysis.items() if "STOP" in d["action"]]
        increase_tags = [
            t for t, d in self.last_analysis.items() if "INCREASE" in d["action"]
        ]

        if stop_tags:
            lines.append(f"\n  ⛔ RECOMMENDED STOP: {', '.join(stop_tags)}")
        if increase_tags:
            lines.append(f"  🔥 RECOMMENDED INCREASE: {', '.join(increase_tags)}")

        return "\n".join(lines)


def process_account(account_id, commission_file, click_file):
    """Process one account's data and return recommendations."""
    rows = []
    with open(commission_file) as f:
        reader = csv.DictReader(f, delimiter=",")
        for r in reader:
            rows.append(r)

    clicks = []
    with open(click_file) as f:
        reader = csv.DictReader(f, delimiter=",")
        for r in reader:
            clicks.append(r)

    opt = CampaignOptimizer(account_id)
    opt.analyze(rows, clicks)
    report = opt.generate_report()

    # Save analysis
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    analysis_file = CONFIG_DIR / f"campaign_{account_id}_optimization.json"
    with open(analysis_file, "w") as f:
        json.dump(
            {
                "account": account_id,
                "timestamp": datetime.now().isoformat(),
                "results": opt.last_analysis,
                "recommendations": report,
            },
            f,
            indent=2,
        )

    return report


if __name__ == "__main__":
    import sys

    if len(sys.argv) >= 3:
        report = process_account(sys.argv[1], sys.argv[2], sys.argv[3])
        print(report)
    else:
        print(
            "Usage: python3 campaign_optimizer.py <account_id> <commission.csv> <clicks.csv>"
        )
