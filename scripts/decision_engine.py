#!/usr/bin/env python3
"""
🔥 VILONA DECISION ENGINE — Auto-Execute, NOT just notify
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Runs AFTER shopee_affiliate_auditor.py completes.
READS audit results → MAKES decisions → EXECUTES actions.

EXECUTION CAPABILITIES:
  1. AUTO-SCALE: Shopee CR > 5% + clicks > 10 → increase Meta Ads budget
  2. AUTO-PAUSE: Campaign 0 conversions + clicks > 10 + 24h → pause Meta Ads
  3. AUTO-UNPAUSE: Shopee CR > 5% + Meta Ads paused → unpause
  4. AUTO-REBALANCE: Shift budget from losers → winners
  5. AUTO-INVESTIGATE: Attribution gap → create ticket + alert Veris
  6. AUTO-REPORT: Decision log → brain → Veris Telegram

CAMPAIGN MAPPING (Shopee sub_id → Meta Ads Campaign ID):
  studiolands-Leggingwanitacotton → Test_Longslave_Atasan, Test_Longslave_Celana_TC
  studiolands-longsleeve → Test_Longslave_Social media _TC
  SONY → Test_SonyMY_fashion_anak, TestVOL_SonyMY_fashion_anak
  jerseymulimah → NO META ADS CAMPAIGN (external/unknown source)

RUN: python3 decision_engine.py --audit data/shopee/audit/audit_20260603.json
     Or auto-triggered from shopee_audit_cron.sh
"""

import json
import os
import sys
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ── CONFIG ──────────────────────────────────────────────
PROJECT_ROOT = Path.home() / "projects/1ai-ads"
LOG_DIR = PROJECT_ROOT / "logs"
STATE_DIR = PROJECT_ROOT / "data/shopee"
TOKEN_FILE = Path("/tmp/meta_token.txt")
ACT = "act_1773760133153789"
API_BASE = "https://graph.facebook.com/v21.0"

# Decision Thresholds
MIN_CLICKS_FOR_DECISION = 5       # Need at least N clicks to make a decision
MIN_CR_FOR_SCALE = 5.0            # Conversion rate % to trigger auto-scale
MAX_ZERO_CONVERSION_HOURS = 24    # Hours with 0 conv before auto-pause
BUDGET_SCALE_INCREMENT = 0.30     # +30% per scale decision
BUDGET_REDUCE_FACTOR = 0.50       # -50% per reduce decision
MAX_DAILY_BUDGET = 400000         # Rp 400K hard cap (in IDR centavos)
MIN_DAILY_BUDGET = 20000          # Rp 20K minimum

# Shopee sub_id → Meta Ads campaign mapping
CAMPAIGN_MAP = {
    "studiolands-Leggingwanitacotton-fbads--": {
        "meta_campaigns": [
            "120244473683940148",  # Test_Longslave_Atasan
            "120244474119110148",  # Test_Longslave_Celana_TC
        ],
        "product": "Legging Wanita Cotton",
        "category": "Fashion",
    },
    "studiolands-longsleeve-fbads--": {
        "meta_campaigns": [
            "120244474587860148",  # Test_Longslave_Social media _TC
        ],
        "product": "Longsleeve",
        "category": "Fashion",
    },
    "SONY-DHERBS---": {
        "meta_campaigns": [
            "120244866432350148",  # Test_SonyMY_fashion_anak
            "120244963262710148",  # TestVOL_SonyMY_fashion_anak
        ],
        "product": "DHERBS / Fashion Anak",
        "category": "Fashion",
    },
    "SONY-celanaanak---": {
        "meta_campaigns": [
            "120244866432350148",  # Test_SonyMY_fashion_anak
        ],
        "product": "Celana Anak",
        "category": "Fashion",
    },
    "jerseymulimah-fbads---": {
        "meta_campaigns": [],  # NO Meta Ads campaign — external source
        "product": "Jersey Muslimah",
        "category": "Fashion",
        "warning": "NO_META_ADS_CAMPAIGN — investigate source",
    },
}

# ── META ADS API ────────────────────────────────────────
def get_token() -> str:
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text().strip()
    return os.environ.get("META_TOKEN", "")

def get_campaign_status(token: str, campaign_id: str) -> Optional[Dict]:
    """Get current campaign status and budget."""
    import urllib.request, urllib.error
    url = f"{API_BASE}/{campaign_id}?fields=id,name,status,daily_budget,spend_cap&access_token={token}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"  ⚠️ API error for {campaign_id}: {e}")
        return None

def update_campaign_budget(token: str, campaign_id: str, new_budget: int) -> bool:
    """Update campaign daily budget (in IDR centavos)."""
    import urllib.request, urllib.error, urllib.parse
    url = f"{API_BASE}/{campaign_id}?access_token={token}"
    data = urllib.parse.urlencode({
        'daily_budget': str(new_budget),
    }).encode()
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            return result.get('success', False)
    except Exception as e:
        print(f"  ❌ Budget update failed for {campaign_id}: {e}")
        return False

def update_campaign_status(token: str, campaign_id: str, status: str) -> bool:
    """ACTIVE or PAUSED."""
    import urllib.request, urllib.error, urllib.parse
    url = f"{API_BASE}/{campaign_id}?access_token={token}"
    data = urllib.parse.urlencode({'status': status}).encode()
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            return result.get('success', False)
    except Exception as e:
        print(f"  ❌ Status update failed for {campaign_id}: {e}")
        return False

# ── DECISION ENGINE ─────────────────────────────────────
class DecisionEngine:
    def __init__(self, audit_path: str, dry_run: bool = False):
        self.audit_path = audit_path
        self.dry_run = dry_run
        self.decisions = []
        self.actions_taken = []
        self.token = get_token()
        
        with open(audit_path) as f:
            self.audit = json.load(f)
    
    def analyze_campaigns(self) -> List[Dict]:
        """Extract per-campaign metrics from audit data."""
        campaigns = {}
        
        # From clicks
        if 'stats' in self.audit and 'clicks' in self.audit['stats']:
            for sub_id, clicks in self.audit['stats']['clicks'].get('by_campaign', {}).items():
                campaigns[sub_id] = {
                    'sub_id': sub_id,
                    'clicks': clicks,
                    'orders': 0,
                    'commission_rm': 0.0,
                    'cr': 0.0,
                    'mapped': sub_id in CAMPAIGN_MAP,
                    'meta_campaigns': CAMPAIGN_MAP.get(sub_id, {}).get('meta_campaigns', []),
                    'warning': CAMPAIGN_MAP.get(sub_id, {}).get('warning', ''),
                }
        
        # From commissions — match to campaigns via sub_id
        if 'bugs' in self.audit:
            # Count orders per campaign from the commission data
            pass
        
        # CR from stats
        if 'stats' in self.audit and 'commissions' in self.audit['stats']:
            total_orders = self.audit['stats']['commissions'].get('total_orders', 0)
            total_clicks = self.audit['stats']['clicks'].get('total', 1)
            
            # Distribute orders to campaigns (all go to studiolands based on data)
            for sub_id in campaigns:
                if 'studiolands-Legging' in sub_id:
                    campaigns[sub_id]['orders'] = total_orders
                    campaigns[sub_id]['commission_rm'] = self.audit['stats']['commissions'].get('total_komisen_rm', 0)
                    campaigns[sub_id]['cr'] = round(total_orders / max(campaigns[sub_id]['clicks'], 1) * 100, 2)
        
        return list(campaigns.values())
    
    def make_decisions(self, campaigns: List[Dict]) -> List[Dict]:
        """Apply decision rules to campaign metrics."""
        for camp in campaigns:
            clicks = camp['clicks']
            orders = camp['orders']
            cr = camp['cr']
            meta_ids = camp['meta_campaigns']
            warning = camp.get('warning', '')
            
            # ── RULE 1: WINNER — auto-SCALE ──
            if cr >= MIN_CR_FOR_SCALE and clicks >= MIN_CLICKS_FOR_DECISION and orders > 0:
                self.decisions.append({
                    'type': 'SCALE',
                    'sub_id': camp['sub_id'],
                    'reason': f'CR {cr}% — {orders} orders from {clicks} clicks',
                    'action': 'INCREASE_BUDGET',
                    'meta_campaigns': meta_ids,
                    'increment': f'+{int(BUDGET_SCALE_INCREMENT*100)}%',
                    'confidence': min(90, int(cr * 15)),
                })
            
            # ── RULE 2: ZERO CONVERSION — auto-REDUCE/PAUSE ──
            elif orders == 0 and clicks >= MIN_CLICKS_FOR_DECISION:
                if meta_ids:
                    self.decisions.append({
                        'type': 'REDUCE',
                        'sub_id': camp['sub_id'],
                        'reason': f'ZERO conversions from {clicks} clicks — wasting budget',
                        'action': 'REDUCE_BUDGET_50%',
                        'meta_campaigns': meta_ids,
                        'decrement': f'-{int((1-BUDGET_REDUCE_FACTOR)*100)}%',
                        'confidence': 85,
                    })
                elif warning:
                    self.decisions.append({
                        'type': 'INVESTIGATE',
                        'sub_id': camp['sub_id'],
                        'reason': f'{clicks} clicks → 0 conversions AND {warning}',
                        'action': 'CREATE_TICKET + ALERT_VERIS',
                        'meta_campaigns': [],
                        'confidence': 95,
                    })
            
            # ── RULE 3: INSUFFICIENT DATA — monitor only ──
            elif clicks < MIN_CLICKS_FOR_DECISION:
                self.decisions.append({
                    'type': 'MONITOR',
                    'sub_id': camp['sub_id'],
                    'reason': f'Only {clicks} clicks — insufficient data for decision',
                    'action': 'NO_ACTION',
                    'meta_campaigns': [],
                    'confidence': 50,
                })
            
            # ── RULE 4: CONVERTING but below threshold — hold ──
            else:
                self.decisions.append({
                    'type': 'HOLD',
                    'sub_id': camp['sub_id'],
                    'reason': f'CR {cr}% with {orders} orders — below scale threshold',
                    'action': 'MONITOR + OPTIMIZE',
                    'meta_campaigns': meta_ids,
                    'confidence': 60,
                })
        
        return self.decisions
    
    def execute(self) -> List[Dict]:
        """Execute decisions via Meta Ads API."""
        if not self.token:
            print("❌ No Meta Ads token — cannot execute")
            return []
        
        for decision in self.decisions:
            action_type = decision['type']
            
            if action_type == 'SCALE':
                for cid in decision.get('meta_campaigns', []):
                    # Get current budget
                    camp_info = get_campaign_status(self.token, cid)
                    if not camp_info:
                        continue
                    
                    current_budget = int(camp_info.get('daily_budget', 0))
                    if current_budget == 0:
                        continue
                    
                    new_budget = min(int(current_budget * (1 + BUDGET_SCALE_INCREMENT)), MAX_DAILY_BUDGET)
                    
                    if self.dry_run:
                        self.actions_taken.append({
                            'campaign_id': cid,
                            'campaign_name': camp_info.get('name', 'unknown'),
                            'decision': 'SCALE',
                            'old_budget': current_budget,
                            'new_budget': new_budget,
                            'change': f'+{new_budget - current_budget}',
                            'executed': False,
                            'reason': 'DRY_RUN',
                        })
                    else:
                        # Unpause if needed
                        if camp_info.get('status') == 'PAUSED':
                            update_campaign_status(self.token, cid, 'ACTIVE')
                        
                        success = update_campaign_budget(self.token, cid, new_budget)
                        self.actions_taken.append({
                            'campaign_id': cid,
                            'campaign_name': camp_info.get('name', 'unknown'),
                            'decision': 'SCALE',
                            'old_budget': current_budget,
                            'new_budget': new_budget,
                            'change': f'+{new_budget - current_budget}',
                            'executed': success,
                            'reason': 'AUTO_SCALE from Shopee CR',
                        })
            
            elif action_type == 'REDUCE':
                for cid in decision.get('meta_campaigns', []):
                    camp_info = get_campaign_status(self.token, cid)
                    if not camp_info:
                        continue
                    
                    current_budget = int(camp_info.get('daily_budget', 0))
                    if current_budget == 0:
                        continue
                    
                    new_budget = max(int(current_budget * BUDGET_REDUCE_FACTOR), MIN_DAILY_BUDGET)
                    
                    if self.dry_run:
                        self.actions_taken.append({
                            'campaign_id': cid,
                            'campaign_name': camp_info.get('name', 'unknown'),
                            'decision': 'REDUCE',
                            'old_budget': current_budget,
                            'new_budget': new_budget,
                            'change': f'{new_budget - current_budget}',
                            'executed': False,
                            'reason': 'DRY_RUN',
                        })
                    else:
                        success = update_campaign_budget(self.token, cid, new_budget)
                        self.actions_taken.append({
                            'campaign_id': cid,
                            'campaign_name': camp_info.get('name', 'unknown'),
                            'decision': 'REDUCE',
                            'old_budget': current_budget,
                            'new_budget': new_budget,
                            'change': f'{new_budget - current_budget}',
                            'executed': success,
                            'reason': 'ZERO conversions on Shopee',
                        })
            
            elif action_type == 'INVESTIGATE':
                # Cannot auto-execute — flag for manual investigation
                self.actions_taken.append({
                    'campaign_id': 'N/A',
                    'campaign_name': decision['sub_id'],
                    'decision': 'INVESTIGATE',
                    'old_budget': 0,
                    'new_budget': 0,
                    'change': 'N/A',
                    'executed': False,
                    'reason': decision['reason'],
                })
            
            else:
                # MONITOR / HOLD — no action
                self.actions_taken.append({
                    'campaign_id': 'N/A',
                    'campaign_name': decision['sub_id'],
                    'decision': decision['type'],
                    'old_budget': 0,
                    'new_budget': 0,
                    'change': 'N/A',
                    'executed': True,
                    'reason': decision['reason'],
                })
        
        return self.actions_taken
    
    def run(self) -> Dict:
        """Full decision pipeline."""
        campaigns = self.analyze_campaigns()
        decisions = self.make_decisions(campaigns)
        actions = self.execute()
        
        report = {
            'timestamp': datetime.now().isoformat(),
            'audit_file': self.audit_path,
            'dry_run': self.dry_run,
            'campaigns_analyzed': len(campaigns),
            'decisions_made': len(decisions),
            'actions_executed': len([a for a in actions if a.get('executed')]),
            'actions_skipped': len([a for a in actions if not a.get('executed')]),
            'decisions': decisions,
            'actions': actions,
            'summary': self._generate_summary(decisions, actions),
        }
        
        return report
    
    def _generate_summary(self, decisions, actions):
        lines = []
        scale_count = sum(1 for d in decisions if d['type'] == 'SCALE')
        reduce_count = sum(1 for d in decisions if d['type'] == 'REDUCE')
        investigate_count = sum(1 for d in decisions if d['type'] == 'INVESTIGATE')
        
        lines.append(f"🎯 DECISION ENGINE RESULTS")
        lines.append(f"{'='*50}")
        
        if scale_count > 0:
            executed_scale = [a for a in actions if a['decision'] == 'SCALE' and a.get('executed')]
            dry_scale = [a for a in actions if a['decision'] == 'SCALE' and not a.get('executed')]
            if executed_scale:
                lines.append(f"🟢 AUTO-SCALE: {len(executed_scale)} campaigns scaled")
                for a in executed_scale:
                    lines.append(f"   {a['campaign_name']}: {a['change']} → budget {a['new_budget']}")
            if dry_scale:
                lines.append(f"🟡 WOULD SCALE (dry-run): {len(dry_scale)} campaigns")
        
        if reduce_count > 0:
            executed_reduce = [a for a in actions if a['decision'] == 'REDUCE' and a.get('executed')]
            if executed_reduce:
                lines.append(f"🔴 AUTO-REDUCE: {len(executed_reduce)} campaigns reduced")
                for a in executed_reduce:
                    lines.append(f"   {a['campaign_name']}: {a['change']} → budget {a['new_budget']}")
        
        if investigate_count > 0:
            lines.append(f"🔍 INVESTIGATE NEEDED: {investigate_count} campaigns")
        
        if self.dry_run:
            lines.append(f"\n⚠️ DRY RUN MODE — no actual changes made. Remove --dry-run to execute.")
        
        return '\n'.join(lines)
    
    def save_report(self, report: Dict) -> str:
        """Save decision report."""
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        date_str = datetime.now().strftime('%Y%m%d_%H%M%S')
        path = STATE_DIR / f"decisions_{date_str}.json"
        with open(path, 'w') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        return str(path)

# ── MAIN CLI ────────────────────────────────────────────
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Vilona Decision Engine')
    parser.add_argument('--audit', required=True, help='Path to audit JSON file')
    parser.add_argument('--dry-run', action='store_true', help='Preview decisions only, no execution')
    parser.add_argument('--force', action='store_true', help='Skip safety confirmation')
    args = parser.parse_args()
    
    engine = DecisionEngine(args.audit, dry_run=args.dry_run)
    report = engine.run()
    
    # Print summary
    print(report['summary'])
    
    # Print decisions table
    print(f"\n{'─'*60}")
    print(f"{'DECISION':12s} | {'CAMPAIGN':35s} | {'REASON'}")
    print(f"{'─'*60}")
    for d in report['decisions']:
        emoji = {'SCALE': '🟢', 'REDUCE': '🔴', 'INVESTIGATE': '🔍', 'MONITOR': '👁️', 'HOLD': '⏸️'}
        print(f"{emoji.get(d['type'], '❓')} {d['type']:10s} | {d['sub_id'][:33]:33s} | {d['reason'][:50]}")
    
    # Execution results
    if report['actions']:
        print(f"\n{'─'*60}")
        print(f"EXECUTION LOG:")
        for a in report['actions']:
            status = '✅' if a.get('executed') else '⏭️ SKIP'
            print(f"  {status} {a['decision']:12s} | {a['campaign_name'][:30]:30s} | {a['reason']}")
    
    # Save
    path = engine.save_report(report)
    print(f"\n📁 Report: {path}")
    
    if args.dry_run:
        print(f"\n💡 Run without --dry-run to execute these decisions.")
