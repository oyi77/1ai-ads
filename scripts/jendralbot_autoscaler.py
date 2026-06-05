#!/usr/bin/env python3
"""
JENDRALBOT Campaign Autoscaler
Auto-optimizes affiliate campaigns based on real-time performance data.

Architecture:
- Reads latest reports from repo data paths
- Uses dynamic cancel threshold: 12% if orders>100, else 3%
- Aligns with taglink mapping for campaign/adset context
- Outputs to repo outputs directory
"""

import pandas as pd
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict
import warnings

warnings.filterwarnings("ignore")

# ============ CONFIG ============
REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "outputs" / "jendralbot_autoscaler"
REPORTS_LOG = OUTPUT_DIR / "autoscaler_report.log"
LEGACY_MEDIA = REPO_ROOT / "media" / "inbound"
DATA_DIR_COMPAT = os.environ.get("AIBIC_MEDIA_DIR") or REPO_ROOT / "data" / "shopee"
REPORTS_LOG = OUTPUT_DIR / "autoscaler_report.log"
TAGLINK_MAP_PATH = DATA_DIR / "taglink_mapping_2026-06-04.json"

for path in (DATA_DIR, OUTPUT_DIR):
    path.mkdir(parents=True, exist_ok=True)


def log(msg: str) -> None:
    ts = datetime.now().isoformat()
    line = f"{ts} | {msg}"
    print(line)
    with open(REPORTS_LOG, "a") as f:
        f.write(line + "\n")

DYNAMIC_CANCEL_THRESHOLD_HIGH = 12.0
DYNAMIC_CANCEL_THRESHOLD_LOW = 3.0
TOP_PERFORMER_MIN_ORDERS = 3

# ============ LOADERS ============
def find_latest(pattern):
    files = sorted(DATA_DIR.glob(pattern), key=lambda x: x.stat().st_mtime, reverse=True)
    return files[0] if files else None


def read_csv_safe(path):
    if not path:
        raise FileNotFoundError("No report file found")
    for enc in ("utf-8-sig", "utf-8", "latin1"):
        for sep in (",", ";", "\t", "|"):
            try:
                df = pd.read_csv(path, encoding=enc, sep=sep, on_bad_lines="skip")
                if df.shape[1] > 1 and df.shape[0] > 0:
                    return df
            except Exception:
                continue
    raise ValueError(f"Could not parse CSV: {path}")


def load_taglink_map():
    if TAGLINK_MAP_PATH.exists():
        with open(TAGLINK_MAP_PATH) as f:
            return json.load(f).get("tags", [])
    return []


# ============ CORE ============
class CampaignAutoscaler:
    def __init__(self):
        self.clicks_df = None
        self.orders_df = None
        self.analysis = {}
        self.optimized_products = []
        self.taglink_map = load_taglink_map()

    def load_data(self):
        print("\n[1/6] Loading latest campaign reports...")
        latest_click = find_latest("WebsiteClickReport*.csv")
        latest_order = find_latest("AffiliateCommissionReport*.csv")

        if not latest_click or not latest_order:
            raise FileNotFoundError("Cannot find latest campaign reports")

        print(f"  Click report: {latest_click.name}")
        print(f"  Order report: {latest_order.name}")

        self.clicks_df = read_csv_safe(latest_click)
        self.orders_df = read_csv_safe(latest_order)

        # Normalize datetime columns
        time_cols_click = [c for c in self.clicks_df.columns if "waktu" in c.lower() or "time" in c.lower()]
        time_cols_order = [c for c in self.orders_df.columns if "waktu" in c.lower() or "time" in c.lower()]
        for c in time_cols_click:
            self.clicks_df[c] = pd.to_datetime(self.clicks_df[c], errors="coerce")
        for c in time_cols_order:
            self.orders_df[c] = pd.to_datetime(self.orders_df[c], errors="coerce")

        # Normalize status values
        self.orders_df["Status Pesanan"] = (
            self.orders_df["Status Pesanan"].fillna("UNKNOWN").astype(str).str.strip().str.title()
        )

        print(f"  Loaded {len(self.clicks_df):,} clicks")
        print(f"  Loaded {len(self.orders_df):,} orders")
        return self

    def calculate_metrics(self):
        print("\n[2/6] Calculating performance metrics...")

        # Click metrics
        total_clicks = len(self.clicks_df)
        unique_tags = self.clicks_df["Tag_link"].nunique() if "Tag_link" in self.clicks_df.columns else 0
        indonesia_clicks = len(
            self.clicks_df[self.clicks_df["Wilayah Klik"].astype(str).str.contains("Indonesia", na=False)]
        )

        clicks_by_platform = self.clicks_df["Perujuk"].value_counts().to_dict() if "Perujuk" in self.clicks_df.columns else {}

        # Order metrics
        total_orders = len(self.orders_df)
        status_counts = self.orders_df["Status Pesanan"].value_counts().to_dict()

        completed = self.orders_df[self.orders_df["Status Pesanan"] == "Tertunda"]
        pending = self.orders_df[self.orders_df["Status Pesanan"] == "Tertunda"]
        canceled = self.orders_df[self.orders_df["Status Pesanan"] == "Dibatalkan"]

        completed_rev = completed["Total Komisi per Pesanan(Rp)"].sum()
        pending_rev = pending["Total Komisi per Pesanan(Rp)"].sum()
        canceled_rev = canceled["Total Komisi per Pesanan(Rp)"].sum()

        orders_by_platform = self.orders_df["Platform"].value_counts().to_dict() if "Platform" in self.orders_df.columns else {}

        # Product-level via Tag_link1 fallback to Nama Barange
        group_col = "Tag_link1" if "Tag_link1" in self.orders_df.columns else "Nama Barange"
        product_name_col = "Nama Barange" if "Nama Barange" in self.orders_df.columns else group_col

        product_metrics = (
            self.orders_df.groupby(group_col)
            .agg(
                {
                    "ID Pemesanan": "count",
                    "Total Komisi per Pesanan(Rp)": "sum",
                    "Status Pesanan": lambda x: int((x == "Dibatalkan").sum()),
                    product_name_col: "first",
                }
            )
            .rename(
                columns={
                    "ID Pemesanan": "Order Count",
                    "Total Komisi per Pesanan(Rp)": "Total Commission",
                    "Status Pesanan": "Cancel Count",
                    product_name_col: "Product Name",
                }
            )
            .reset_index()
        )

        product_metrics["Cancel Rate"] = (
            product_metrics["Cancel Count"] / product_metrics["Order Count"] * 100
        )

        top_products = product_metrics.nlargest(10, "Total Commission")

        click_order_rate = (total_orders / total_clicks * 100) if total_clicks > 0 else 0.0

        self.analysis = {
            "total_clicks": total_clicks,
            "indonesia_clicks": indonesia_clicks,
            "clicks_by_platform": clicks_by_platform,
            "total_orders": total_orders,
            "completed_orders": len(completed),
            "pending_orders": len(pending),
            "canceled_orders": len(canceled),
            "completed_revenue": float(completed_rev),
            "pending_revenue": float(pending_rev),
            "canceled_revenue": float(canceled_rev),
            "orders_by_platform": orders_by_platform,
            "product_metrics": product_metrics,
            "top_products": top_products.to_dict("records"),
            "platform_performance": [],
            "click_order_rate": click_order_rate,
            "unique_tags": unique_tags,
        }

        return self

    def identify_opportunities(self):
        print("\n[3/6] Identifying optimization opportunities...")
        opportunities = []
        df = self.analysis["product_metrics"]

        orders_total = df["Order Count"].sum() if len(df) else 0
        threshold = DYNAMIC_CANCEL_THRESHOLD_HIGH if orders_total > 100 else DYNAMIC_CANCEL_THRESHOLD_LOW

        high_cancel = df[df["Cancel Rate"] > threshold]
        if len(high_cancel) > 0:
            opportunities.append(
                {
                    "type": "CANCEL_RISK",
                    "count": len(high_cancel),
                    "message": f"⚠️ {len(high_cancel)} products have >{threshold:.0f}% cancellation rate",
                }
            )
            print(f"  Found {len(high_cancel)} products with high cancellation risk")
            for _, row in high_cancel.head(5).iterrows():
                print(
                    f"    - {row['Product Name'][:40]}: {row['Cancel Rate']:.1f}% cancel rate"
                )

        top_performers = df[
            (df["Cancel Rate"] < threshold)
            & (df["Order Count"] >= TOP_PERFORMER_MIN_ORDERS)
        ].nlargest(10, "Total Commission")

        if len(top_performers) > 0:
            opportunities.append(
                {
                    "type": "TOP_PERFORMERS",
                    "count": len(top_performers),
                    "products": top_performers["Product Name"].tolist(),
                }
            )
            print(f"  Found {len(top_performers)} top performers to scale")

        platform_rev = self.analysis["orders_by_platform"]
        if platform_rev:
            max_platform = max(platform_rev.items(), key=lambda x: x[1])
            print(
                f"  Best performing platform: {max_platform[0]} ({max_platform[1]:,} orders)"
            )

        self.optimization_opportunities = opportunities
        return self

    def generate_optimization_plan(self):
        print("\n[4/6] Generating optimization plan...")
        df = self.analysis["product_metrics"]
        orders_total = df["Order Count"].sum() if len(df) else 0
        threshold = DYNAMIC_CANCEL_THRESHOLD_HIGH if orders_total > 100 else DYNAMIC_CANCEL_THRESHOLD_LOW

        plan = {"scale_up": [], "pause": [], "monitor": [], "budget_recommendation": {}}

        for product in self.analysis["top_products"][:5]:
            cancel_count = product.get("Cancel Count", 0)
            order_count = product.get("Order Count", 1)
            if cancel_count / max(order_count, 1) < 0.03:
                plan["scale_up"].append(
                    {
                        "product": product.get("Product Name", product.get("Tag_link1", "Unknown"))[:50],
                        "commission": int(product.get("Total Commission", 0)),
                        "orders": order_count,
                        "recommendation": "SCALE UP - High volume, low cancellation",
                    }
                )

        low_volume = df[
            (df["Cancel Rate"] < threshold)
            & (df["Order Count"] < 3)
            & (df["Order Count"] > 0)
        ]

        for _, row in low_volume.head(5).iterrows():
            plan["monitor"].append(
                {
                    "product": row["Product Name"][:50],
                    "cancel_rate": f"{row['Cancel Rate']:.1f}%",
                    "recommendation": "MONITOR - Need more data",
                }
            )

        high_cancel = df[df["Cancel Rate"] > threshold]
        for _, row in high_cancel.iterrows():
            plan["pause"].append(
                {
                    "product": row["Product Name"][:50],
                    "cancel_rate": f"{row['Cancel Rate']:.1f}%",
                    "orders": row["Order Count"],
                    "recommendation": f"PAUSE - >{threshold:.0f}% cancellation rate",
                }
            )

        total_commission = sum(p.get("Total Commission", 0) for p in self.analysis["top_products"][:10])
        plan["budget_recommendation"] = {
            "top_5_products": int(total_commission * 0.6),
            "top_10_products": int(total_commission * 0.85),
            "test_budget": int(total_commission * 0.15),
            "total_recommended": int(total_commission),
        }

        self.optimization_plan = plan
        return self

    def save_analysis(self):
        print("\n[5/6] Saving analysis and plan...")
        metrics_file = OUTPUT_DIR / "campaign_metrics.json"
        with open(metrics_file, "w") as f:
            json.dump(
                {
                    "timestamp": datetime.now().isoformat(),
                    "total_clicks": self.analysis["total_clicks"],
                    "total_orders": self.analysis["total_orders"],
                    "completed_orders": self.analysis["completed_orders"],
                    "pending_orders": self.analysis["pending_orders"],
                    "canceled_orders": self.analysis["canceled_orders"],
                    "completed_revenue": int(self.analysis["completed_revenue"]),
                    "pending_revenue": int(self.analysis["pending_revenue"]),
                    "canceled_revenue": int(self.analysis["canceled_revenue"]),
                    "click_order_rate": round(self.analysis["click_order_rate"], 4),
                    "top_platforms": dict(list(self.analysis["orders_by_platform"].items())[:5]),
                },
                f,
                indent=2,
            )
        print(f"  Saved: {metrics_file}")

        plan_file = OUTPUT_DIR / "optimization_plan.json"
        with open(plan_file, "w") as f:
            json.dump(self.optimization_plan, f, indent=2)
        print(f"  Saved: {plan_file}")

        if self.analysis.get("top_products"):
            top_products_file = OUTPUT_DIR / "top_products.csv"
            pd.DataFrame(self.analysis["top_products"][:10]).to_csv(top_products_file, index=False)
            print(f"  Saved: {top_products_file}")

        return self

    def generate_report(self):
        print("\n[6/6] Generating Telegram report...")
        today = datetime.now().strftime("%d %B %Y")

        orders_total = self.analysis.get("total_orders", 0)
        clicks_total = self.analysis.get("total_clicks", 0)
        conv_rate = (orders_total / clicks_total * 100) if clicks_total else 0.0

        report = f"""\U0001f525 JENDRALBOT AUTOSCALER REPORT - {today}
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501

\U0001f4ca CAMPAIGN METRICS
\U0001f4ca Website Clicks: {clicks_total:,}
\U0001f4c8 Click-to-Order Rate: {conv_rate:.2f}%

\U0001f4b0 SALES SUMMARY
Total Orders: {orders_total}
Pending: {self.analysis.get('pending_orders', 0)} (IDR {int(self.analysis.get('pending_revenue', 0)):,})

Platform Performance:
"""
        for platform, count in sorted(
            self.analysis["orders_by_platform"].items(), key=lambda x: x[1], reverse=True
        )[:5]:
            report += f"  \u2022 {platform}: {count:,} orders\n"

        report += "\n\U0001f680 OPTIMIZATION PLAN\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"

        if self.optimization_plan.get("scale_up"):
            report += "\u2705 SCALE UP:\n"
            for item in self.optimization_plan["scale_up"][:5]:
                report += f"  \u2022 {item['product'][:35]}... (orders {item['orders']})\n"

        if self.optimization_plan.get("monitor"):
            report += "\n\u26a0\ufe0f MONITOR:\n"
            for item in self.optimization_plan["monitor"][:3]:
                report += f"  \u2022 {item['product'][:30]}... ({item['cancel_rate']} cancel)\n"

        if self.optimization_plan.get("pause"):
            report += "\n\u1f6d1 PAUSE:\n"
            for item in self.optimization_plan["pause"][:5]:
                report += f"  \u2022 {item['product'][:30]}... ({item['cancel_rate']} cancel)\n"

        total_rec = self.optimization_plan.get("budget_recommendation", {}).get("total_recommended", 0)
        report += f"\n\u1f4b0 BUDGET RECOMMENDATION\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\nTotal recommended: {total_rec:,} IDR\n"

        report += (
            "\n\U0001f4a1 NEXT ACTIONS:\n"
            "1. Scale winners from SCALE UP\n"
            "2. Pause high-cancel products\n"
            "3. Keep monitoring low volume\n"
            "4. Re-run after next report\n\n"
            "\U0001f4c5 Next analysis: 24 hours\n"
        )

        report_file = OUTPUT_DIR / "latest_report.txt"
        with open(report_file, "w") as f:
            f.write(report)

        with open(REPORTS_LOG, "a") as f:
            f.write(f"{datetime.now().isoformat()} | Report generated\n")

        print(f"  Saved: {report_file}")
        print(f"  Logged: {REPORTS_LOG}")
        self.report_text = report
        return self

    def run_full_pipeline(self):
        print("\n" + "=" * 60)
        print("JENDRALBOT AUTOSCALER - Full Pipeline")
        print("=" * 60)

        try:
            (
                self.load_data()
                .calculate_metrics()
                .identify_opportunities()
                .generate_optimization_plan()
                .save_analysis()
                .generate_report()
            )
            print("\n" + "=" * 60)
            print("AUTOSCALER COMPLETE")
            print("=" * 60)
            return True
        except Exception as e:
            print(f"\nERROR: {str(e)}")
            return False


if __name__ == "__main__":
    autoscaler = CampaignAutoscaler()
    success = autoscaler.run_full_pipeline()
    if success:
        print("\nFull report preview:\n")
        print(autoscaler.report_text)
