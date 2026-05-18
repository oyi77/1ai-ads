#!/usr/bin/env python3
"""
AdForge Dashboard - AI-Powered Ads Management with Draft-First Approval
Self-hosted, multi-platform ad management with approval workflows.
"""
from flask import Flask, render_template, jsonify, request, redirect, url_for
from datetime import datetime
import sqlite3
import json
import uuid
from pathlib import Path
from functools import wraps

app = Flask(__name__, static_folder='static', template_folder='templates')
DB_PATH = "/home/openclaw/.openclaw/workspace/adforge/adforge.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def generate_id():
    return str(uuid.uuid4())[:8]

# ============ DRAFTS MANAGEMENT ============

@app.route('/drafts')
def drafts_page():
    """Show all pending and recent drafts."""
    conn = get_db()
    c = conn.cursor()
    
    # Get pending drafts
    pending = c.execute("""
        SELECT * FROM approval_drafts 
        WHERE status = 'pending' 
        ORDER BY created_at DESC
    """).fetchall()
    
    # Get recent history (approved/rejected)
    history = c.execute("""
        SELECT * FROM approval_drafts 
        WHERE status IN ('approved', 'rejected')
        ORDER BY reviewed_at DESC 
        LIMIT 10
    """).fetchall()
    
    conn.close()
    
    return render_template('drafts.html', 
                         pending_drafts=pending, 
                         history_drafts=history,
                         pending_count=len(pending))

@app.route('/api/drafts')
def api_drafts():
    """JSON API for drafts."""
    conn = get_db()
    c = conn.cursor()
    
    status = request.args.get('status', 'pending')
    drafts = c.execute("""
        SELECT * FROM approval_drafts 
        WHERE status = ?
        ORDER BY created_at DESC
    """, (status,)).fetchall()
    
    conn.close()
    
    return jsonify([dict(d) for d in drafts])

@app.route('/api/drafts/create', methods=['POST'])
def api_draft_create():
    """Create a new draft."""
    data = request.get_json()
    
    draft_id = generate_id()
    conn = get_db()
    c = conn.cursor()
    
    try:
        c.execute("""
            INSERT INTO approval_drafts 
            (id, type, summary, details_json, proposed_by, status) 
            VALUES (?, ?, ?, ?, ?, 'pending')
        """, (
            draft_id,
            data.get('type'),
            data.get('summary'),
            json.dumps(data.get('details', {})),
            data.get('proposed_by', 'ai')
        ))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'draft_id': draft_id,
            'message': f'Draft created for {data.get("type")}'
        })
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/drafts/<draft_id>/approve', methods=['POST'])
def api_draft_approve(draft_id):
    """Approve a draft."""
    data = request.get_json()
    conn = get_db()
    c = conn.cursor()
    
    try:
        # Get draft
        draft = c.execute("SELECT * FROM approval_drafts WHERE id = ?", (draft_id,)).fetchone()
        if not draft:
            return jsonify({'success': False, 'error': 'Draft not found'}), 404
        
        # Mark as approved
        c.execute("""
            UPDATE approval_drafts 
            SET status = 'approved', 
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?
            WHERE id = ?
        """, (data.get('reviewed_by', 'user'), draft_id))
        
        conn.commit()
        
        # TODO: Execute the draft based on type
        result = execute_draft(dict(draft))
        
        # Update execution result
        c.execute("""
            UPDATE approval_drafts 
            SET execution_result = ?
            WHERE id = ?
        """, (json.dumps(result), draft_id))
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': f'Draft approved and executed',
            'result': result
        })
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/drafts/<draft_id>/reject', methods=['POST'])
def api_draft_reject(draft_id):
    """Reject a draft."""
    data = request.get_json()
    conn = get_db()
    c = conn.cursor()
    
    try:
        c.execute("""
            UPDATE approval_drafts 
            SET status = 'rejected', 
                reviewed_at = CURRENT_TIMESTAMP,
                reviewed_by = ?,
                rejection_reason = ?
            WHERE id = ?
        """, (
            data.get('reviewed_by', 'user'),
            data.get('reason', ''),
            draft_id
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Draft rejected'
        })
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'error': str(e)}), 400

def execute_draft(draft):
    """Execute an approved draft."""
    draft_type = draft['type']
    details = json.loads(draft['details_json'])
    
    if draft_type == 'campaign_change':
        return execute_campaign_change(details)
    elif draft_type == 'rule_change':
        return execute_rule_change(details)
    elif draft_type == 'budget_change':
        return execute_budget_change(details)
    elif draft_type == 'ad_change':
        return execute_ad_change(details)
    
    return {'status': 'unknown', 'message': f'Unknown draft type: {draft_type}'}

def execute_campaign_change(details):
    """Execute campaign changes (pause/scale/resume)."""
    action = details.get('action')
    campaign_id = details.get('campaign_id')
    
    # TODO: Call Meta Graph API
    return {
        'status': 'executed',
        'action': action,
        'campaign_id': campaign_id,
        'timestamp': datetime.now().isoformat()
    }

def execute_rule_change(details):
    """Execute automation rule changes."""
    rule_id = details.get('rule_id')
    new_status = details.get('enabled')
    
    # TODO: Update automation_rules table
    return {
        'status': 'executed',
        'rule_id': rule_id,
        'enabled': new_status,
        'timestamp': datetime.now().isoformat()
    }

def execute_budget_change(details):
    """Execute budget scaling."""
    campaign_id = details.get('campaign_id')
    new_budget = details.get('new_budget')
    
    # TODO: Call Meta Graph API
    return {
        'status': 'executed',
        'campaign_id': campaign_id,
        'new_budget': new_budget,
        'timestamp': datetime.now().isoformat()
    }

def execute_ad_change(details):
    """Execute ad creative changes."""
    ad_id = details.get('ad_id')
    action = details.get('action')  # pause, resume, update_creative
    
    # TODO: Call Meta Graph API
    return {
        'status': 'executed',
        'ad_id': ad_id,
        'action': action,
        'timestamp': datetime.now().isoformat()
    }

# ============ DASHBOARD PAGES ============

@app.route('/')
def dashboard():
    """Main dashboard."""
    conn = get_db()
    c = conn.cursor()
    
    # Get campaign stats
    campaigns = c.execute("SELECT * FROM campaigns LIMIT 10").fetchall()
    campaigns_count = c.execute("SELECT COUNT(*) as cnt FROM campaigns").fetchone()['cnt']
    
    # Get pending drafts count
    pending_count = c.execute(
        "SELECT COUNT(*) as cnt FROM approval_drafts WHERE status = 'pending'"
    ).fetchone()['cnt']
    
    # Get automation rules
    rules = c.execute("SELECT * FROM automation_rules LIMIT 5").fetchall()
    
    conn.close()
    
    return render_template('dashboard.html',
                         campaigns=campaigns,
                         campaigns_count=campaigns_count,
                         pending_drafts=pending_count,
                         rules=rules)

@app.route('/campaigns')
def campaigns():
    """Campaign list."""
    conn = get_db()
    c = conn.cursor()
    campaigns = c.execute("""
        SELECT id, name, platform, status, 
               COALESCE(spend, 0) as spend,
               COALESCE(revenue, 0) as revenue,
               COALESCE(impressions, 0) as impressions
        FROM campaigns 
        ORDER BY created_at DESC
    """).fetchall()
    conn.close()
    
    return render_template('campaigns.html', campaigns=campaigns)

@app.route('/automation')
def automation():
    """Automation rules."""
    conn = get_db()
    c = conn.cursor()
    rules = c.execute("SELECT * FROM automation_rules ORDER BY created_at DESC").fetchall()
    conn.close()
    
    return render_template('automation.html', rules=rules)

# ============ API ENDPOINTS ============

@app.route('/api/campaigns')
def api_campaigns():
    """Get campaign data."""
    conn = get_db()
    c = conn.cursor()
    campaigns = c.execute("""
        SELECT * FROM campaigns 
        ORDER BY created_at DESC LIMIT 20
    """).fetchall()
    conn.close()
    
    return jsonify([dict(c) for c in campaigns])

@app.route('/api/stats')
def api_stats():
    """Get dashboard stats."""
    conn = get_db()
    c = conn.cursor()
    
    total_campaigns = c.execute("SELECT COUNT(*) as cnt FROM campaigns").fetchone()['cnt']
    total_spend = c.execute("SELECT COALESCE(SUM(spend), 0) as total FROM campaigns").fetchone()['total']
    total_revenue = c.execute("SELECT COALESCE(SUM(revenue), 0) as total FROM campaigns").fetchone()['total']
    pending_drafts = c.execute("SELECT COUNT(*) as cnt FROM approval_drafts WHERE status = 'pending'").fetchone()['cnt']
    
    conn.close()
    
    return jsonify({
        'total_campaigns': total_campaigns,
        'total_spend': float(total_spend),
        'total_revenue': float(total_revenue),
        'pending_drafts': pending_drafts
    })

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 AdForge Dashboard (Draft-First Approval)")
    print("Listening on: http://127.0.0.1:5002")
    print("=" * 60)
    app.run(host='127.0.0.1', port=5002, debug=True, use_reloader=False)
