#!/usr/bin/env python3
"""
🍪 daily_shopee_meta_cookie_engine.py — Cookie-Aware Shopee Affiliate Engine

Vilona Autonomous Media Buyer — Cookie Farming Edition

Core Philosophy:
  "Lo bukan jualan produk — lo jualan traffic ke Shopee."
  
  Meta ngasih traffic, konten nentuin siapa yang klik, 
  cookie Shopee 7-hari nentuin lo dibayar buat apa yang mereka beli.

Rules (Cookie-Adjusted):
  ✅ ROAS = Total Komisi / Total Spend (per akun, bukan per campaign)
  ✅ Winner: CTR > 4%, CPC < Rp150, ada order, komisi/spend > 1.0x
  ✅ Kandidat: Metrik bagus tapi komisi < spend → pantau 1 hari lagi
  ✅ Monitor: < 7 hari atau < 5 klik → belum bisa dinilai
  ✅ False Positive Filter: min 5 klik + 1 order sebelum di-flag

Usage:
  python3 daily_shopee_meta_cookie_engine.py              # Full report
  python3 daily_shopee_meta_cookie_engine.py --json       # JSON output
  python3 daily_shopee_meta_cookie_engine.py --winners-only  # Winners only
  python3 daily_shopee_meta_cookie_engine.py --send-telegram  # Send to Telegram
"""

import sys, os, json, csv, re, argparse
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
import requests
import time

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data" / "shopee"
WORKSPACE_DATA_DIR = Path.home() / ".openclaw" / "workspace" / "data" / "shopee"
LOGS_DIR = PROJECT_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)

FB_API = "https://graph.facebook.com/v22.0"
VERCEL_API = "https://shopee-dashboard-rust.vercel.app"

# ─── Token Loading ───
def load_token() -> str:
    """Load FB token from multiple sources."""
    # 1. Env
    token = os.environ.get("META_ACCESS_TOKEN", "")
    if token:
        return token
    # 2. Config file
    cfg_path = Path.home() / ".openclaw" / "workspace" / "config" / "meta_token.json"
    if cfg_path.exists():
        with open(cfg_path) as f:
            return json.load(f).get("access_token", "")
    # 3. ads-config.ts in shopee-dashboard
    ads_config = PROJECT_DIR.parent / "shopee-dashboard" / "src" / "lib" / "ads-config.ts"
    if ads_config.exists():
        content = ads_config.read_text()
        match = re.search(r'FB_TOKEN\s*=\s*"([^"]+)"', content)
        if match:
            return match.group(1)
    return ""

FB_TOKEN = load_token()

# ─── Account Config ───
# Map Meta ad account IDs to Shopee account names and data files
ACCOUNT_MAP = {
    "act_380721031313330": {
        "name": "Nyamiresep Dapur (1041)",
        "shopee_tag": "nyamiresep",
        "data_prefix": "nyamiresep",
        "timezone": "Asia/Jakarta",
    },
    "act_1773760133153789": {
        "name": "Selow ID (1134)",
        "shopee_tag": "selow1134",
        "data_prefix": "selow1134",
        "timezone": "Asia/Jakarta",
    },
    "act_1181078009580337": {
        "name": "Selow ID (1340)",
        "shopee_tag": "selow1340",
        "data_prefix": "selow1340",
        "timezone": "Asia/Jakarta",
    },
    "act_1439536310038458": {
        "name": "Herbalisme (1208)",
        "shopee_tag": "herbalisme",
        "data_prefix": "herbalisme",
        "timezone": "Asia/Jakarta",
    },
    "act_435670549443081": {
        "name": "JENDRALBOT (0858)",
        "shopee_tag": "jendralbot",
        "data_prefix": "jendralbot",
        "timezone": "Asia/Jakarta",
    },
}

# ─── Cookie-Aware Thresholds ───
THRESHOLDS = {
    "ctr_winner": 4.0,         # CTR > 4% (diturunin dari 5%)
    "cpc_max": 150,            # CPC < Rp150
    "min_clicks": 5,           # Minimal 5 klik sebelum di-flag
    "min_orders": 1,           # 1 order cukup
    "roas_min": 1.0,           # Komisi/spend > 1.0x
    "roas_kandidat": 1.0,      # Di bawah ini = kandidat (pantau)
    "min_days": 7,             # < 7 hari = monitor
    "max_cpc_kandidat": 200,   # CPC < Rp200 masih acceptable
}

# ──────────────────────────────────────────────
# DATA FETCHING
# ──────────────────────────────────────────────

def fetch_active_accounts() -> List[Dict]:
    """Get active Meta ad accounts with Shopee mapping."""
    if not FB_TOKEN:
        print("❌ FB_TOKEN not found. Set META_ACCESS_TOKEN env var.", file=sys.stderr)
        return []
    
    resp = requests.get(f"{FB_API}/me/adaccounts", params={
        "fields": "name,account_id,account_status,currency",
        "limit": 20,
        "access_token": FB_TOKEN,
    }, timeout=15)
    
    if resp.status_code != 200:
        print(f"❌ FB API error: {resp.status_code} {resp.text[:200]}", file=sys.stderr)
        return []
    
    data = resp.json()
    accounts = []
    for acc in data.get("data", []):
        act_id = f"act_{acc['account_id']}"
        if act_id in ACCOUNT_MAP and acc.get("account_status") == 1:
            accounts.append({
                "act_id": act_id,
                "fb_name": acc.get("name", ""),
                **ACCOUNT_MAP[act_id],
            })
    return accounts


def fetch_campaign_insights(act_id: str, since: str, until: str) -> List[Dict]:
    """Fetch Meta campaign-level insights for a date range."""
    params = {
        "fields": "campaign_name,campaign_id,spend,impressions,clicks,cpc,ctr,inline_link_clicks,actions",
        "time_range": json.dumps({"since": since, "until": until}),
        "time_increment": 1,
        "level": "campaign",
        "limit": 200,
        "access_token": FB_TOKEN,
    }
    
    resp = requests.get(f"{FB_API}/{act_id}/insights", params=params, timeout=20)
    if resp.status_code != 200:
        print(f"  ⚠️ {act_id}: API error {resp.status_code}", file=sys.stderr)
        return []
    
    data = resp.json()
    campaigns = []
    for row in data.get("data", []):
        # Extract outbound clicks from actions
        actions = row.get("actions", [])
        link_clicks = 0
        for a in actions:
            if a.get("action_type") in ("link_click", "outbound_click"):
                link_clicks += int(a.get("value", 0))
        
        campaigns.append({
            "campaign_id": row.get("campaign_id"),
            "campaign_name": row.get("campaign_name"),
            "spend": float(row.get("spend", 0)),
            "impressions": int(row.get("impressions", 0)),
            "clicks": int(row.get("clicks", 0)),
            "cpc": float(row.get("cpc", 0)),
            "ctr": float(row.get("ctr", 0)),
            "link_clicks": link_clicks,
            "date_start": row.get("date_start", since),
            "date_stop": row.get("date_stop", until),
        })
    
    return campaigns


def fetch_all_campaign_metadata(act_id: str) -> Dict[str, str]:
    """Fetch created_time for ALL campaigns in an account (single API call)."""
    params = {
        "fields": "id,name,created_time,status",
        "limit": 200,
        "access_token": FB_TOKEN,
    }
    resp = requests.get(f"{FB_API}/{act_id}/campaigns", params=params, timeout=15)
    if resp.status_code != 200:
        return {}
    data = resp.json()
    meta = {}
    for camp in data.get("data", []):
        ct = camp.get("created_time", "")
        if ct:
            meta[camp["id"]] = ct[:10]  # YYYY-MM-DD
    return meta


def load_shopee_data(data_prefix: str, date_str: str) -> List[Dict]:
    """Load Shopee commission data from CSV for a specific account and date."""
    orders = []
    
    # Try project data dir first, then workspace
    search_dirs = [DATA_DIR, WORKSPACE_DATA_DIR]
    
    for base_dir in search_dirs:
        csv_path = base_dir / f"{data_prefix}_{date_str}.csv"
        if not csv_path.exists():
            continue
        
        try:
            with open(csv_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Handle different column naming (ID vs MY)
                    commission_str = row.get("Total Komisi per Pesanan(Rp)", 
                                              row.get("Jumlah Komisen Pesanan(RM)", "0"))
                    try:
                        commission = float(commission_str) if commission_str else 0
                    except ValueError:
                        commission = 0
                    
                    order_id = row.get("ID Pemesanan", row.get("Id Pembelian", ""))
                    status = row.get("Status Pesanan", row.get("Status Pesanan", ""))
                    order_time = row.get("Waktu Pemesanan", row.get("Masa Pesanan", ""))
                    product_name = row.get("Nama Barange", row.get("nama item", ""))
                    shop_name = row.get("Nama Toko", row.get("Nama Kedai", ""))
                    click_time = row.get("Waktu Klik", "")
                    platform = row.get("Platform", row.get("Saluran", ""))
                    
                    # Tag links (for campaign matching)
                    tags = []
                    for i in range(1, 6):
                        tag = row.get(f"Tag_link{i}", row.get(f"Sub_id{i}", ""))
                        if tag and tag.strip():
                            tags.append(tag.strip())
                    
                    orders.append({
                        "order_id": order_id,
                        "status": status,
                        "commission": commission,
                        "order_time": order_time,
                        "click_time": click_time,
                        "product_name": product_name,
                        "shop_name": shop_name,
                        "platform": platform,
                        "tags": tags,
                    })
        except Exception as e:
            print(f"  ⚠️ Error reading {csv_path}: {e}", file=sys.stderr)
    
    return orders


# ──────────────────────────────────────────────
# ANALYSIS
# ──────────────────────────────────────────────

def match_orders_to_campaigns(orders: List[Dict], campaigns: List[Dict]) -> Dict[str, List[Dict]]:
    """Match Shopee orders to Meta campaigns via tag links."""
    matched = defaultdict(list)
    
    # Build campaign name lookup
    camp_names = {c["campaign_id"]: c["campaign_name"].lower() for c in campaigns}
    camp_by_tag = {}
    
    for c in campaigns:
        name = c["campaign_name"]
        # Extract tag parts from campaign names like "BIDCAP_Nyamiresep_Test_Atayasetelankaosanak 01"
        parts = name.lower().replace("_", " ").split()
        for part in parts:
            if len(part) > 5 and not part.isdigit():
                camp_by_tag[part] = c["campaign_id"]
    
    for order in orders:
        matched_to = None
        for tag in order["tags"]:
            tag_lower = tag.lower()
            # Direct match with campaign name
            for cid, cname in camp_names.items():
                if tag_lower in cname:
                    matched_to = cid
                    break
            if matched_to:
                break
            # Partial match
            if tag_lower in camp_by_tag:
                matched_to = camp_by_tag[tag_lower]
                break
        
        if matched_to:
            matched[matched_to].append(order)
        else:
            matched["_unmatched_"].append(order)
    
    return matched


def classify_campaigns(account: Dict, campaigns: List[Dict], 
                       orders: List[Dict], matched: Dict,
                       campaign_meta: Dict[str, str] = None) -> Dict:
    """Cookie-aware campaign classification."""
    today = datetime.now()
    if campaign_meta is None:
        campaign_meta = {}
    
    results = {
        "account": account["name"],
        "act_id": account["act_id"],
        "date": today.strftime("%Y-%m-%d"),
        "total_spend": sum(c["spend"] for c in campaigns),
        "total_clicks": sum(c["clicks"] for c in campaigns),
        "total_impressions": sum(c["impressions"] for c in campaigns),
        "total_orders": len(orders),
        "total_commission": sum(o["commission"] for o in orders),
        "avg_cpc": 0,
        "avg_ctr": 0,
        "campaigns": [],
        "unmatched_orders": len(matched.get("_unmatched_", [])),
        "summary": {"winner": 0, "kandidat": 0, "monitor": 0, "belum": 0},
    }
    
    if results["total_clicks"] > 0:
        results["avg_cpc"] = results["total_spend"] / results["total_clicks"]
    if results["total_impressions"] > 0:
        results["avg_ctr"] = (results["total_clicks"] / results["total_impressions"]) * 100
    
    # Calculate account-level ROAS (cookie-aware: ALL commission / ALL spend)
    results["roas"] = results["total_commission"] / results["total_spend"] if results["total_spend"] > 0 else 0
    
    for camp in campaigns:
        cid = camp["campaign_id"]
        
        # Skip OFF_ campaigns (deliberately paused by Veris)
        if camp["campaign_name"].startswith("OFF_"):
            continue
        
        camp_orders = matched.get(cid, [])
        camp_commission = sum(o["commission"] for o in camp_orders)
        camp_order_count = len(camp_orders)
        
        # Calculate campaign-specific ROAS
        camp_roas = camp_commission / camp["spend"] if camp["spend"] > 0 else 0
        
        # Get REAL campaign age from metadata (created_time)
        created_str = campaign_meta.get(cid, "")
        if created_str:
            try:
                camp_age = (today - datetime.strptime(created_str, "%Y-%m-%d")).days
            except:
                camp_age = 0
        else:
            # Fallback: use insight date_start (will be query date, treated as day 1)
            start_date = camp.get("date_start", today.strftime("%Y-%m-%d"))
            try:
                camp_age = (today - datetime.strptime(start_date, "%Y-%m-%d")).days
            except:
                camp_age = 0
        
        # Extract tag from campaign name
        name = camp["campaign_name"]
        
        # ─── CLASSIFY ───
        verdict = ""
        reasons = []
        
        ctr = camp["ctr"]
        cpc = camp["cpc"]
        clicks = camp["clicks"]
        spend = camp["spend"]
        
        # False positive filter: need min clicks
        if clicks < THRESHOLDS["min_clicks"]:
            verdict = "monitor"
            reasons.append(f"klik rendah ({clicks})")
        elif camp_age < THRESHOLDS["min_days"]:
            verdict = "monitor"
            reasons.append(f"hari ke-{camp_age+1}: monitor, belum bisa dinilai")
        elif ctr > THRESHOLDS["ctr_winner"] and cpc < THRESHOLDS["cpc_max"]:
            if camp_commission > spend and camp_order_count >= THRESHOLDS["min_orders"]:
                verdict = "winner"
                reasons.append(f"WINNER! {clicks} klik, {camp_order_count} order, CTR {ctr:.1f}%, CPC Rp{cpc:.0f}. GAS +30-50%!")
            elif ctr > THRESHOLDS["ctr_winner"] and camp_order_count >= THRESHOLDS["min_orders"]:
                verdict = "kandidat"
                reasons.append(f"KANDIDAT: metrik bagus, komisi < spend. Pantau 1 hari lagi.")
            else:
                verdict = "kandidat"
                reasons.append(f"KANDIDAT: {clicks} klik, {camp_order_count} order, CTR {ctr:.1f}%, CPC Rp{cpc:.0f}")
        elif clicks >= THRESHOLDS["min_clicks"] and camp_order_count == 0 and spend > 0:
            # No orders but has clicks - check if underperforming
            if cpc > THRESHOLDS["max_cpc_kandidat"]:
                verdict = "belum"
                reasons.append(f"CPC terlalu tinggi (Rp{cpc:.0f})")
            elif ctr < 2.0:
                verdict = "belum"
                reasons.append(f"CTR rendah ({ctr:.1f}%)")
            else:
                verdict = "kandidat"
                reasons.append(f"KANDIDAT: {clicks} klik, {camp_order_count} order, CTR {ctr:.1f}%, CPC Rp{cpc:.0f}")
        else:
            issues = []
            if ctr < 2.0:
                issues.append(f"CTR rendah ({ctr:.1f}%)")
            if cpc > THRESHOLDS["max_cpc_kandidat"]:
                issues.append(f"CPC tinggi (Rp{cpc:.0f})")
            if camp_order_count == 0:
                issues.append("belum ada order")
            verdict = "belum"
            reasons.append(f"BELUM: {'; '.join(issues)}" if issues else "BELUM: data tidak cukup")
        
        results["campaigns"].append({
            "id": cid,
            "name": name,
            "spend": spend,
            "clicks": clicks,
            "impressions": camp["impressions"],
            "ctr": ctr,
            "cpc": cpc,
            "link_clicks": camp["link_clicks"],
            "orders": camp_order_count,
            "commission": camp_commission,
            "roas": camp_roas,
            "age_days": camp_age + 1,
            "verdict": verdict,
            "reasons": reasons,
        })
        
        results["summary"][verdict] = results["summary"].get(verdict, 0) + 1
    
    return results


# ──────────────────────────────────────────────
# OUTPUT / REPORTING
# ──────────────────────────────────────────────

def format_report(all_results: List[Dict]) -> str:
    """Format analysis results as readable report."""
    lines = []
    lines.append("🍪 SHOPEE AFFILIATE COOKIE ENGINE — Daily Report")
    lines.append(f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M WIB')}")
    lines.append("=" * 50)
    
    for r in all_results:
        lines.append(f"\n🏪 {r['account']} | {r['act_id']}")
        lines.append(f"   Spend: Rp{r['total_spend']:,.0f} | Klik: {r['total_clicks']} | CPC: Rp{r['avg_cpc']:.0f}")
        lines.append(f"   Orders: {r['total_orders']} | Komisi: Rp{r['total_commission']:,.0f}")
        lines.append(f"   ROAS: {r['roas']:.2f}x | Unmatched: {r['unmatched_orders']} orders")
        lines.append(f"   🏆 Winner: {r['summary']['winner']} | 🔍 Kandidat: {r['summary']['kandidat']} | 👀 Monitor: {r['summary']['monitor']} | ❌ Belum: {r['summary']['belum']}")
        
        # Show winners first
        winners = [c for c in r["campaigns"] if c["verdict"] == "winner"]
        if winners:
            lines.append(f"\n   🏆 WINNERS:")
            for c in winners:
                lines.append(f"      ✅ {c['name']}")
                for reason in c["reasons"]:
                    lines.append(f"         {reason}")
        
        # Show kandidats
        kandidats = [c for c in r["campaigns"] if c["verdict"] == "kandidat"]
        if kandidats:
            lines.append(f"\n   🔍 KANDIDAT (Pantau):")
            for c in kandidats[:5]:
                lines.append(f"      ⏳ {c['name']}: {c['clicks']} klik, {c['orders']} order, CTR {c['ctr']:.1f}%, CPC Rp{c['cpc']:.0f}, ROAS {c['roas']:.2f}x")
            if len(kandidats) > 5:
                lines.append(f"      ... and {len(kandidats) - 5} more")
        
        # Show belums (problematic)
        belums = [c for c in r["campaigns"] if c["verdict"] == "belum" and c["spend"] > 0]
        if belums:
            lines.append(f"\n   ❌ PERLU REVIEW:")
            for c in belums[:3]:
                lines.append(f"      ⚠️ {c['name']}: {c['reasons'][0]}")
    
    # Overall summary
    lines.append(f"\n{'=' * 50}")
    total_spend = sum(r["total_spend"] for r in all_results)
    total_commission = sum(r["total_commission"] for r in all_results)
    total_orders = sum(r["total_orders"] for r in all_results)
    total_roas = total_commission / total_spend if total_spend > 0 else 0
    total_winners = sum(r["summary"]["winner"] for r in all_results)
    
    lines.append(f"💰 TOTAL: Spend Rp{total_spend:,.0f} | Komisi Rp{total_commission:,.0f} | ROAS {total_roas:.2f}x")
    lines.append(f"📦 Total Orders: {total_orders} | 🏆 Total Winners: {total_winners}")
    
    # Cookie-aware insight
    lines.append(f"\n🍪 COOKIE INSIGHT:")
    lines.append(f"   Cookie 7-hari last click = komisi dari SEMUA produk yang dibeli setelah klik")
    lines.append(f"   Target: Rp1jt/hari/akun dengan ROAS 2x")
    if total_roas < 0.5:
        lines.append(f"   ⚠️ ROAS rendah — cek CTR konten & audience targeting")
    elif total_roas < 1.0:
        lines.append(f"   📊 ROAS masih dibawah 1x — optimasi konten untuk CTR > 4%")
    elif total_roas < 2.0:
        lines.append(f"   ✅ ROAS positif — naikkan budget winners, optimasi kandidat")
    else:
        lines.append(f"   🔥 ROAS {total_roas:.1f}x — GAS! Scale winners!")
    
    return "\n".join(lines)


def format_telegram_summary(all_results: List[Dict]) -> str:
    """Compact Telegram-friendly summary."""
    lines = ["🍪 *Shopee Cookie Engine — Daily Report*", f"📅 {datetime.now().strftime('%Y-%m-%d %H:%M WIB')}", ""]
    
    for r in all_results:
        roas_emoji = "🔥" if r["roas"] >= 2.0 else "✅" if r["roas"] >= 1.0 else "⚠️" if r["roas"] >= 0.5 else "🔴"
        lines.append(f"*{r['account']}* {roas_emoji}")
        lines.append(f"Spend Rp{r['total_spend']:,.0f} | Orders {r['total_orders']} | Komisi Rp{r['total_commission']:,.0f} | ROAS {r['roas']:.2f}x")
        
        winners = [c for c in r["campaigns"] if c["verdict"] == "winner"]
        if winners:
            lines.append(f"🏆 Winners ({len(winners)}):")
            for c in winners[:3]:
                lines.append(f"  • {c['name'][:50]}: {c['clicks']} klik, {c['orders']} order, CTR {c['ctr']:.1f}%")
        else:
            kandidats = [c for c in r["campaigns"] if c["verdict"] == "kandidat"]
            if kandidats:
                lines.append(f"🔍 Top Kandidat: {kandidats[0]['name'][:50]} ({kandidats[0]['clicks']} klik, CTR {kandidats[0]['ctr']:.1f}%)")
        lines.append("")
    
    total_spend = sum(r["total_spend"] for r in all_results)
    total_commission = sum(r["total_commission"] for r in all_results)
    total_roas = total_commission / total_spend if total_spend > 0 else 0
    
    lines.append(f"💰 *Total:* Spend Rp{total_spend:,.0f} | Komisi Rp{total_commission:,.0f} | ROAS {total_roas:.2f}x")
    
    if total_roas < 1.0:
        lines.append("\n⚠️ ROAS < 1x — fokus naikkan CTR konten!")
    elif total_roas < 2.0:
        lines.append("\n✅ ROAS positif — optimasi lanjut!")
    else:
        lines.append("\n🔥 ROAS > 2x — SCALE WINNERS!")
    
    return "\n".join(lines)


def send_to_telegram(message: str):
    """Send report via Telegram using OpenClaw message tool or webhook."""
    # Write to file for n8n/bot pickup
    report_path = PROJECT_DIR / "reports" / "cookie_engine_latest.txt"
    report_path.parent.mkdir(exist_ok=True)
    report_path.write_text(message)
    print(f"📤 Report saved to {report_path}")
    
    # Try Vercel push
    try:
        resp = requests.post(f"{VERCEL_API}/api/reports/cookie-engine", json={
            "timestamp": datetime.now().isoformat(),
            "report": message,
        }, timeout=10)
        if resp.status_code == 200:
            print("📤 Report pushed to Vercel")
        else:
            print(f"⚠️ Vercel push: {resp.status_code}")
    except Exception as e:
        print(f"⚠️ Vercel push failed: {e}")


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="🍪 Cookie-Aware Shopee Affiliate Engine")
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--winners-only", action="store_true", help="Show winners only")
    parser.add_argument("--send-telegram", action="store_true", help="Send to Telegram")
    parser.add_argument("--date", help="Date to analyze (YYYY-MM-DD), default: yesterday")
    parser.add_argument("--days", type=int, default=1, help="Number of days to fetch (default: 1)")
    parser.add_argument("--accounts", help="Comma-separated act_ids to analyze (default: all)")
    args = parser.parse_args()
    
    # Determine date range
    if args.date:
        end_date = datetime.strptime(args.date, "%Y-%m-%d")
    else:
        end_date = datetime.now() - timedelta(days=1)
    
    start_date = end_date - timedelta(days=args.days - 1)
    date_str = end_date.strftime("%Y-%m-%d")
    since = start_date.strftime("%Y-%m-%d")
    until = end_date.strftime("%Y-%m-%d")
    
    print(f"🍪 Cookie Engine — Analyzing {since} to {until}")
    print(f"   Thresholds: CTR>{THRESHOLDS['ctr_winner']}%, CPC<Rp{THRESHOLDS['cpc_max']}, "
          f"Orders≥{THRESHOLDS['min_orders']}, Clicks≥{THRESHOLDS['min_clicks']}")
    print()
    
    # Fetch accounts
    accounts = fetch_active_accounts()
    if args.accounts:
        requested = set(args.accounts.split(","))
        accounts = [a for a in accounts if a["act_id"] in requested]
    
    if not accounts:
        print("❌ No active Shopee-mapped ad accounts found.")
        sys.exit(1)
    
    print(f"📊 Active accounts: {len(accounts)}")
    for a in accounts:
        print(f"   {a['act_id']}: {a['name']}")
    print()
    
    # Process each account
    all_results = []
    
    for acc in accounts:
        act_id = acc["act_id"]
        print(f"🔄 {acc['name']} ({act_id})")
        
        # Fetch Meta campaign data
        campaigns = fetch_campaign_insights(act_id, since, until)
        total_spend = sum(c["spend"] for c in campaigns)
        total_clicks = sum(c["clicks"] for c in campaigns)
        print(f"   Meta: {len(campaigns)} campaigns, Rp{total_spend:,.0f} spend, {total_clicks} clicks")
        
        # Load Shopee data
        orders = load_shopee_data(acc["data_prefix"], date_str)
        total_commission = sum(o["commission"] for o in orders)
        print(f"   Shopee: {len(orders)} orders, Rp{total_commission:,.0f} commission")
        
        # Fetch campaign creation dates (single API call)
        campaign_meta = fetch_all_campaign_metadata(act_id)
        print(f"   Campaign meta: {len(campaign_meta)} campaigns with creation dates")
        
        # Match orders to campaigns
        matched = match_orders_to_campaigns(orders, campaigns)
        matched_count = sum(len(v) for k, v in matched.items() if k != "_unmatched_")
        unmatched = len(matched.get("_unmatched_", []))
        print(f"   Matched: {matched_count} orders → campaigns, {unmatched} unmatched")
        
        # Classify (with real campaign ages)
        result = classify_campaigns(acc, campaigns, orders, matched, campaign_meta)
        print(f"   {result['summary']}")
        
        all_results.append(result)
        print()
    
    # Output
    if args.json:
        print(json.dumps(all_results, indent=2, ensure_ascii=False, default=str))
    elif args.winners_only:
        for r in all_results:
            winners = [c for c in r["campaigns"] if c["verdict"] == "winner"]
            if winners:
                print(f"\n🏆 {r['account']}:")
                for c in winners:
                    print(f"   {c['name']}: {c['clicks']} klik, {c['orders']} order, CTR {c['ctr']:.1f}%, CPC Rp{c['cpc']:.0f}")
    else:
        report = format_report(all_results)
        print(report)
        
        # Save JSON backup
        json_path = PROJECT_DIR / "reports" / f"cookie_engine_{date_str}.json"
        json_path.parent.mkdir(exist_ok=True)
        with open(json_path, "w") as f:
            json.dump(all_results, f, indent=2, ensure_ascii=False, default=str)
        print(f"\n💾 JSON saved: {json_path}")
    
    if args.send_telegram:
        tg_msg = format_telegram_summary(all_results)
        send_to_telegram(tg_msg)


if __name__ == "__main__":
    main()
