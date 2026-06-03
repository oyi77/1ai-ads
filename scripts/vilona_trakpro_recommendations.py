#!/usr/bin/env python3
"""
🔥 VILONA TRAKPRO — Advanced Recommendation Engine
===================================================
Features:
  1. Rekomendasi Aksi Harian — Daily SOP from Shopee + Meta data
  2. Early Winner Detector — New campaign profit signals within 24h
  3. Decision Center — Score + prioritize campaigns
  4. Creative Fatigue Detector — CTR/CPC trend analysis
  5. Scale Ladder Planner — Graduated budget increase plan
  6. Telegram Alert Generator — Formatted /winner, /boncos, /scale, /rekomendasi

Output: ~/projects/1ai-ads/data/vilona_trakpro_recommendations.json
"""

import json, os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

WIB = timezone(timedelta(hours=7))
WORKSPACE = Path(__file__).parent.parent
OUTPUT_FILE = WORKSPACE / "data" / "vilona_trakpro_recommendations.json"
HISTORY_FILE = WORKSPACE / "data" / "vilona_trakpro_history.json"

def score_campaign(camp_data, shopee_data, tag_commission):
    """
    Score campaign 0-100 based on multiple signals.
    - ROAS: 40 points
    - CPC efficiency: 25 points  
    - CTR quality: 15 points
    - Link clicks: 10 points
    - LP views ratio: 10 points
    """
    score = 0
    spend = camp_data.get("spend", 0)
    link_clicks = camp_data.get("link_clicks", 0)
    cpc = camp_data.get("cpc", 0)
    ctr = camp_data.get("ctr", 0)
    lp_views = camp_data.get("lp_views", 0)
    
    if spend < 100:
        return 0, "Minimal delivery"
    
    # ROAS (40 pts) - estimate from tag commission share
    roas = tag_commission / max(spend, 1) if tag_commission else 0
    if roas > 10: score += 40
    elif roas > 5: score += 35
    elif roas > 3: score += 25
    elif roas > 1: score += 15
    elif roas > 0.3: score += 5
    
    # CPC efficiency (25 pts)
    if cpc < 80: score += 25
    elif cpc < 120: score += 20
    elif cpc < 160: score += 10
    elif cpc < 200: score += 5
    
    # CTR quality (15 pts)
    if ctr > 6: score += 15
    elif ctr > 4: score += 12
    elif ctr > 3: score += 8
    elif ctr > 2: score += 4
    
    # Link clicks (10 pts)
    if link_clicks > 20: score += 10
    elif link_clicks > 10: score += 7
    elif link_clicks > 5: score += 4
    elif link_clicks > 0: score += 2
    
    # LP view ratio (10 pts)
    lpr = lp_views / max(link_clicks, 1) * 100
    if lpr > 60: score += 10
    elif lpr > 40: score += 7
    elif lpr > 20: score += 4
    
    return score, f"ROAS:{roas:.1f}x CPC:{cpc:.0f} CTR:{ctr:.1f}% LC:{link_clicks}"


def detect_early_winners(campaigns, history):
    """
    Detect campaigns showing early winner signals.
    Criteria: New campaign (<48h old) with ROAS signal within first Rp50K spend.
    """
    early_winners = []
    prev_campaigns = history.get("campaigns", {})
    
    for cid, cdata in campaigns.items():
        name = cdata.get("name", "")
        spend = cdata.get("spend", 0)
        link_clicks = cdata.get("link_clicks", 0)
        cpc = cdata.get("cpc", 0)
        ctr = cdata.get("ctr", 0)
        
        # New campaign detection (wasn't in previous state)
        is_new = cid not in prev_campaigns
        prev_spend = prev_campaigns.get(cid, {}).get("spend", 0) if cid in prev_campaigns else 0
        
        # Early winner signals within Rp50K
        if 1000 < spend < 50000 and link_clicks >= 5 and cpc < 150 and ctr > 2:
            early_winners.append({
                "name": name,
                "spend": spend,
                "link_clicks": link_clicks,
                "cpc": cpc,
                "ctr": ctr,
                "signal": "EARLY_WINNER" if is_new or prev_spend == 0 else "WINNER",
                "new_campaign": is_new,
                "recommendation": "Scale test: naikkan budget 50% untuk validasi sinyal" if spend < 20000 
                                 else "Winner signal confirmed — pantau 24 jam lagi untuk scale penuh"
            })
    
    return early_winners


def detect_fatigue(campaigns, history, days=3):
    """
    Detect creative fatigue: CTR declining + CPC rising over time.
    Compares current vs historical averages.
    """
    fatigued = []
    prev_data = history.get("campaigns", {})
    
    for cid, cdata in campaigns.items():
        name = cdata.get("name", "")
        ctr = cdata.get("ctr", 0)
        cpc = cdata.get("cpc", 0)
        impressions = cdata.get("impressions", 0)
        
        if impressions < 2000:
            continue
        
        prev = prev_data.get(cid, {})
        prev_ctr = prev.get("ctr", ctr)
        prev_cpc = prev.get("cpc", cpc)
        
        ctr_drop = (prev_ctr - ctr) / max(prev_ctr, 0.1) * 100
        cpc_rise = (cpc - prev_cpc) / max(prev_cpc, 1) * 100
        
        if ctr_drop > 30 and cpc_rise > 30:
            fatigued.append({
                "name": name,
                "ctr_before": prev_ctr,
                "ctr_now": ctr,
                "ctr_drop_pct": round(ctr_drop, 1),
                "cpc_before": prev_cpc,
                "cpc_now": cpc,
                "cpc_rise_pct": round(cpc_rise, 1),
                "severity": "HIGH" if ctr_drop > 50 else "MEDIUM",
                "recommendation": "Rotate creative & refresh audience. Jangan scale sebelum CTR recover."
            })
    
    return fatigued


def plan_scale_ladder(winners, max_budget=500000, max_daily_increase_pct=30):
    """
    Generate graduated scaling plan for winners.
    Increases budget 20-30% per step, max 3 steps to budget cap.
    """
    ladders = []
    
    for w in winners:
        current = w.get("current_budget", 0) or 100000
        steps = []
        step_budget = current
        
        for i in range(3):
            step_budget = min(
                int(step_budget * 1.25),
                max_budget
            )
            steps.append({
                "step": i + 1,
                "budget": step_budget,
                "increase_pct": round((step_budget - current) / max(current, 1) * 100),
                "trigger": "ROAS tetap >3x selama 48 jam" if i == 0 
                          else "ROAS tetap >3x + order confirmed" if i == 1
                          else "ROAS tetap >2x + 10+ orders terkonfirmasi"
            })
            if step_budget >= max_budget:
                break
        
        ladders.append({
            "campaign": w["name"],
            "current_budget": current,
            "target_budget": max_budget,
            "steps": steps
        })
    
    return ladders


def generate_recommendations(campaign_insights, shopee_data, account_config, state):
    """
    Generate full recommendation report.
    """
    now = datetime.now(WIB)
    recommendations = {
        "generated_at": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "account": account_config["name"],
        "sections": []
    }
    
    # Load history
    history = {}
    if HISTORY_FILE.exists():
        try:
            history = json.loads(HISTORY_FILE.read_text())
        except:
            pass
    
    # 1. Campaign Scoring & Ranking
    scores = []
    tag_commission = 0
    for tag in account_config["tags"]:
        if tag in shopee_data:
            tag_commission += shopee_data[tag]["total_commission"]
    
    for cid, cdata in campaign_insights.items():
        if cdata.get("spend", 0) < 50:
            continue
        score, note = score_campaign(cdata, shopee_data, tag_commission)
        scores.append({
            "name": cdata["name"],
            "score": score,
            "note": note,
            "spend": cdata["spend"],
            "link_clicks": cdata["link_clicks"],
            "cpc": cdata["cpc"],
            "ctr": cdata["ctr"],
        })
    
    scores.sort(key=lambda x: x["score"], reverse=True)
    
    # Score tiers
    top = [s for s in scores if s["score"] >= 60]
    mid = [s for s in scores if 30 <= s["score"] < 60]
    low = [s for s in scores if s["score"] < 30]
    
    recommendations["sections"].append({
        "title": "📊 Decision Center — Campaign Scores",
        "type": "scores",
        "top_performers": top[:5],
        "mid_performers": mid[:5],
        "low_performers": low[:5],
        "summary": f"{len(top)} TOP | {len(mid)} MID | {len(low)} LOW"
    })
    
    # 2. Early Winner Detection
    early = detect_early_winners(campaign_insights, history)
    if early:
        recommendations["sections"].append({
            "title": f"🏆 Early Winner Detector — {len(early)} sinyal",
            "type": "early_winners",
            "winners": early,
            "action": "Gas: scale test budget +50% untuk validasi"
        })
    
    # 3. Fatigue Detection
    fatigued = detect_fatigue(campaign_insights, history)
    if fatigued:
        recommendations["sections"].append({
            "title": f"🔄 Creative Fatigue — {len(fatigued)} campaign butuh rotasi",
            "type": "fatigue",
            "fatigued": fatigued,
            "action": "Rotate creative + refresh audience targeting"
        })
    
    # 4. Scale Ladder for top campaigns
    top_winners = [
        {
            "name": s["name"],
            "current_budget": s.get("current_budget", 500000)
        }
        for s in top[:3]
        if s["score"] >= 60
    ]
    if top_winners:
        ladders = plan_scale_ladder(top_winners)
        recommendations["sections"].append({
            "title": "📈 Scale Ladder Planner",
            "type": "scale_ladder",
            "ladders": ladders
        })
    
    # 5. Daily SOP Actions
    sop_actions = []
    
    if scores:
        best = scores[0]
        sop_actions.append({
            "priority": 1,
            "icon": "🏆",
            "title": f"Scale pemenang: {best['name'][:40]}",
            "detail": f"Score {best['score']}/100, {best['note']}",
            "action": "Naikkan budget 20% atau duplikasi ke audience baru"
        })
    
    for s in low[:3]:
        if s["spend"] > 5000:
            sop_actions.append({
                "priority": 2,
                "icon": "💀",
                "title": f"Evaluasi: {s['name'][:40]}",
                "detail": f"Score {s['score']}/100, {s['note']}",
                "action": "Pause jika tidak ada improvement dalam 24 jam"
            })
    
    if fatigued:
        sop_actions.append({
            "priority": 3,
            "icon": "🔄",
            "title": f"Rotasi creative {len(fatigued)} campaign fatigue",
            "detail": f"CTR turun signifikan di {len(fatigued)} campaign",
            "action": "Upload creative baru dalam 24 jam"
        })
    
    shopee_summary = []
    for tag in account_config["tags"]:
        if tag in shopee_data:
            d = shopee_data[tag]
            shopee_summary.append(
                f"{tag}: {d['orders']} orders, Rp{d['total_commission']:,.0f} est. komisi"
            )
    
    if shopee_summary:
        sop_actions.append({
            "priority": 0,
            "icon": "📋",
            "title": "Upload laporan Shopee terbaru",
            "detail": " | ".join(shopee_summary),
            "action": "Upload CSV ke Telegram untuk cek detail"
        })
    
    recommendations["sections"].append({
        "title": "📋 SOP — Rekomendasi Aksi Hari Ini",
        "type": "sop",
        "actions": sorted(sop_actions, key=lambda x: x["priority"])
    })
    
    # Save
    recommendations["sections"].append({
        "title": "⏰ Siklus berikutnya",
        "type": "info",
        "message": f"30 menit dari sekarang. Engine: ACTIVE"
    })
    
    OUTPUT_FILE.write_text(json.dumps(recommendations, indent=2, ensure_ascii=False))
    
    return recommendations


def format_telegram(recs):
    """Format recommendations for Telegram."""
    lines = []
    
    for section in recs["sections"]:
        title = section["title"]
        lines.append(title)
        
        if section["type"] == "scores":
            lines.append(f"  {section['summary']}")
            if section.get("top_performers"):
                lines.append("  🔥 Top:")
                for s in section["top_performers"][:3]:
                    lines.append(f"    {s['score']}/100 {s['name'][:35]} — {s['note']}")
            if section.get("low_performers"):
                lines.append("  ⚠️ Perlu perhatian:")
                for s in section["low_performers"][:2]:
                    lines.append(f"    {s['score']}/100 {s['name'][:35]}")
        
        elif section["type"] == "early_winners":
            for w in section.get("winners", [])[:3]:
                lines.append(f"  🆕 {w['name'][:35]}")
                lines.append(f"    {w['recommendation'][:80]}")
        
        elif section["type"] == "fatigue":
            for f in section.get("fatigued", [])[:3]:
                lines.append(f"  🔄 {f['name'][:35]}")
                lines.append(f"    CTR {f['ctr_before']:.1f}%→{f['ctr_now']:.1f}% [{f['severity']}]")
        
        elif section["type"] == "scale_ladder":
            for l in section.get("ladders", [])[:2]:
                lines.append(f"  {l['campaign'][:35]}")
                for step in l["steps"]:
                    lines.append(f"    Step {step['step']}: Rp{step['budget']:,} ({step['increase_pct']}%)")
        
        elif section["type"] == "sop":
            for a in section.get("actions", [])[:5]:
                lines.append(f"  {a['icon']} {a['title'][:50]}")
        
        lines.append("")
    
    return "\n".join(lines)


if __name__ == "__main__":
    # Test run
    recs = {
        "generated_at": datetime.now(WIB).isoformat(),
        "date": datetime.now(WIB).strftime("%Y-%m-%d"),
        "account": "Kakriput",
        "sections": [{"title": "Test", "type": "info", "message": "Engine running"}]
    }
    print(format_telegram(recs))
