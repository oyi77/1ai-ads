#!/usr/bin/env python3
"""
AdForge Draft Generator
Creates approval drafts for AI-proposed campaign changes.
Used by automation rules and strategy agent to propose actions before execution.
"""

import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path

DB_PATH = os.environ.get("ADFORGE_DB_PATH", str(Path(__file__).resolve().parent.parent / "db" / "adforge.db"))

def generate_id():
    return str(uuid.uuid4())[:8]

class DraftGenerator:
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.c = self.conn.cursor()
    
    def create_draft(self, draft_type, summary, details, proposed_by='automation'):
        """Create a new approval draft."""
        draft_id = generate_id()
        
        try:
            self.c.execute("""
                INSERT INTO approval_drafts 
                (id, type, summary, details_json, proposed_by, status, created_at) 
                VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
            """, (
                draft_id,
                draft_type,
                summary,
                json.dumps(details),
                proposed_by
            ))
            self.conn.commit()
            
            return {
                'success': True,
                'draft_id': draft_id,
                'message': f'Draft created: {summary}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def create_pause_draft(self, campaign_id, reason, metrics=None):
        """Create draft to pause an adset."""
        summary = f"Pause {campaign_id} — {reason}"
        details = {
            'action': 'pause',
            'campaign_id': campaign_id,
            'reason': reason,
            'metrics': metrics or {}
        }
        return self.create_draft('campaign_change', summary, details, 'automation')
    
    def create_scale_draft(self, campaign_id, percentage, reason, metrics=None):
        """Create draft to scale budget."""
        summary = f"Scale {campaign_id} by {percentage}% — {reason}"
        details = {
            'action': 'scale_budget',
            'campaign_id': campaign_id,
            'scale_percentage': percentage,
            'reason': reason,
            'metrics': metrics or {}
        }
        return self.create_draft('budget_change', summary, details, 'automation')
    
    def create_rule_draft(self, rule_id, enabled, reason):
        """Create draft to enable/disable automation rule."""
        action = 'enable' if enabled else 'disable'
        summary = f"{action.upper()} rule #{rule_id} — {reason}"
        details = {
            'rule_id': rule_id,
            'enabled': enabled,
            'reason': reason
        }
        return self.create_draft('rule_change', summary, details, 'automation')
    
    def create_compliance_draft(self, account_id, violation, fix_action):
        """Create draft for compliance issues (0858 account)."""
        summary = f"Compliance violation in {account_id}: {violation}"
        details = {
            'account_id': account_id,
            'violation': violation,
            'fix_action': fix_action
        }
        return self.create_draft('campaign_change', summary, details, 'compliance_checker')
    
    def get_pending_drafts(self, draft_type=None):
        """Get all pending drafts."""
        if draft_type:
            result = self.c.execute("""
                SELECT * FROM approval_drafts 
                WHERE status = 'pending' AND type = ?
                ORDER BY created_at DESC
            """, (draft_type,)).fetchall()
        else:
            result = self.c.execute("""
                SELECT * FROM approval_drafts 
                WHERE status = 'pending'
                ORDER BY created_at DESC
            """).fetchall()
        
        return [dict(row) for row in result]
    
    def get_draft(self, draft_id):
        """Get draft by ID."""
        result = self.c.execute(
            "SELECT * FROM approval_drafts WHERE id = ?",
            (draft_id,)
        ).fetchone()
        
        return dict(result) if result else None
    
    def approve_draft(self, draft_id, reviewed_by='system'):
        """Mark draft as approved."""
        try:
            self.c.execute("""
                UPDATE approval_drafts 
                SET status = 'approved', 
                    reviewed_at = CURRENT_TIMESTAMP,
                    reviewed_by = ?
                WHERE id = ?
            """, (reviewed_by, draft_id))
            self.conn.commit()
            
            return {
                'success': True,
                'message': f'Draft {draft_id} approved'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def reject_draft(self, draft_id, reason, reviewed_by='system'):
        """Mark draft as rejected."""
        try:
            self.c.execute("""
                UPDATE approval_drafts 
                SET status = 'rejected', 
                    reviewed_at = CURRENT_TIMESTAMP,
                    reviewed_by = ?,
                    rejection_reason = ?
                WHERE id = ?
            """, (reviewed_by, reason, draft_id))
            self.conn.commit()
            
            return {
                'success': True,
                'message': f'Draft {draft_id} rejected'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def close(self):
        self.conn.close()


# ============ EXAMPLE USAGE ============

if __name__ == '__main__':
    gen = DraftGenerator()
    
    # Example 1: Create a pause draft
    print("📝 Creating pause draft...")
    result = gen.create_pause_draft(
        campaign_id='cmp-120244938720170121',
        reason='CTR dropped to 0.65% (< 0.75% threshold)',
        metrics={'ctr': 0.65, 'impressions': 3500, 'clicks': 22}
    )
    print(f"   {result}\n")
    
    # Example 2: Create a scale draft
    print("📈 Creating scale draft...")
    result = gen.create_scale_draft(
        campaign_id='cmp-120244930497130121',
        percentage=20,
        reason='ROAS 2.3x for 3 consecutive days',
        metrics={'roas': 2.3, 'conversions': 45, 'spend': 500000}
    )
    print(f"   {result}\n")
    
    # Example 3: Get pending drafts
    print("📋 Pending drafts:")
    pending = gen.get_pending_drafts()
    for draft in pending:
        print(f"   • [{draft['type']}] {draft['summary']}")
    
    gen.close()
    print("\n✅ Draft generator examples complete!")
