"""FacebookService — Live Meta Ads API integration for AdForge.
Uses vilona_trakpro_engine for API access (guardrail-compliant)."""
import sys, os, json
from datetime import datetime, timedelta
from pathlib import Path

# Import the existing trakpro engine for API access
sys.path.insert(0, str(Path(__file__).parent.parent / 'scripts'))
from trakpro_vilona import api, api_post, TOKEN, ACCOUNTS as TRAKPRO_ACCOUNTS


class FacebookService:
    """Wraps trakpro_vilona for AdForge dashboard integration."""
    
    ACCOUNTS = {
        '0858': {'act_id': 'act_435670549443081', 'name': '0858 — Rakdapur3', 'budget': 200000},
        '1041': {'act_id': 'act_380721031313330', 'name': '1041 — Nyamiresep', 'budget': 300000},
        '1134': {'act_id': 'act_1773760133153789', 'name': '1134 — Glowscent', 'budget': 200000},
        'glowscent': {'act_id': 'act_2125021885010866', 'name': 'Glowscent', 'budget': 300000},
        '1208': {'act_id': 'act_1439536310038458', 'name': '1208 — Herbal', 'budget': 100000},
        '1340': {'act_id': 'act_1181078009580337', 'name': '1340 — BajuAnak', 'budget': 100000},
    }
    
    def is_token_valid(self):
        """Check if token is available."""
        return bool(TOKEN and len(TOKEN) > 100)
    
    def get_accounts(self):
        """Get all configured accounts with connection status."""
        results = []
        for key, acc in self.ACCOUNTS.items():
            results.append({
                'key': key, 'act_id': acc['act_id'], 'name': acc['name'],
                'daily_budget': acc['budget'], 'connected': self.is_token_valid(),
            })
        return results
    
    def get_campaigns(self, act_key):
        """Get live campaigns for an account from Meta API."""
        acc = self.ACCOUNTS.get(act_key)
        if not acc:
            return {'error': f'Unknown account: {act_key}', 'success': False}
        if not self.is_token_valid():
            return {'error': 'Meta access token not configured', 'success': False}
        
        act_id = acc['act_id']
        data = api(f"{act_id}/campaigns", {
            'fields': 'id,name,status,effective_status,daily_budget,objective,start_time',
            'limit': 200,
        })
        
        if not data or 'error' in data:
            err = (data or {}).get('error', str(data)[:100])
            return {'error': str(err), 'success': False}
        
        campaigns = []
        camp_ids = []
        for c in data.get('data', []):
            camp_ids.append(c['id'])
            campaigns.append({
                'id': c['id'], 'name': c.get('name', ''),
                'status': c.get('effective_status', c.get('status', '?')),
                'daily_budget': int(c.get('daily_budget', 0) or 0),
                'objective': c.get('objective', ''),
                'created': c.get('start_time', '')[:10] if c.get('start_time') else '',
                'spend': 0, 'revenue': 0, 'impressions': 0, 'clicks': 0, 'conversions': 0,
                'cpc': 0, 'roas': 0,
            })
        
        # Batch insights
        if camp_ids:
            today = datetime.now().strftime('%Y-%m-%d')
            yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
            for period_label, period in [('today', today), ('yesterday', yesterday)]:
                try:
                    ins_data = api(f"{act_id}/insights", {
                        'fields': 'campaign_id,spend,impressions,clicks,cpc,actions,action_values',
                        'time_range': json.dumps({'since': period, 'until': period}),
                        'level': 'campaign', 'limit': 200,
                    })
                    for ins in ins_data.get('data', []):
                        cid = ins.get('campaign_id', '')
                        for camp in campaigns:
                            if camp['id'] == cid:
                                camp['spend'] = float(ins.get('spend', 0))
                                camp['impressions'] = int(ins.get('impressions', 0))
                                camp['clicks'] = int(ins.get('clicks', 0))
                                camp['cpc'] = int(float(ins.get('cpc', 0)))
                                camp['revenue'] = camp.get('revenue', 0)
                                for av in ins.get('action_values', []):
                                    if av.get('action_type') == 'purchase':
                                        camp['revenue'] += float(av.get('value', 0))
                                for a in ins.get('actions', []):
                                    if a.get('action_type') == 'purchase':
                                        camp['conversions'] = int(a.get('value', 0))
                                camp['roas'] = round(camp['revenue'] / max(camp['spend'], 1), 2)
                except Exception:
                    pass
        
        return {
            'success': True, 'account_name': acc['name'], 'act_id': act_id,
            'campaigns': campaigns, 'token_valid': True,
        }
    
    def get_campaign_detail(self, campaign_id):
        """Get campaign detail with ad sets from Meta API."""
        camp = api(campaign_id, {
            'fields': 'id,name,status,effective_status,daily_budget,objective,start_time'
        })
        if 'error' in camp:
            return {'error': str(camp['error']), 'success': False}
        
        ad_sets_data = api(f"{campaign_id}/adsets", {
            'fields': 'id,name,status,effective_status,daily_budget',
            'limit': 50,
        })
        
        result = {
            'id': camp['id'], 'name': camp.get('name', ''),
            'status': camp.get('effective_status', camp.get('status', '?')),
            'daily_budget': int(camp.get('daily_budget', 0) or 0),
            'objective': camp.get('objective', ''),
            'ad_sets': [],
        }
        
        for adset in ad_sets_data.get('data', []):
            result['ad_sets'].append({
                'id': adset['id'], 'name': adset.get('name', ''),
                'status': adset.get('effective_status', adset.get('status', '?')),
                'daily_budget': int(adset.get('daily_budget', 0) or 0),
                'spend': 0, 'revenue': 0, 'impressions': 0, 'clicks': 0,
            })
        
        return result
    
    def get_account_insights(self, act_key, days=1):
        """Get account-level insights."""
        acc = self.ACCOUNTS.get(act_key)
        if not acc:
            return {'error': f'Unknown account: {act_key}', 'success': False}
        
        today = datetime.now()
        since = (today - timedelta(days=days)).strftime('%Y-%m-%d')
        until = today.strftime('%Y-%m-%d')
        
        ins = api(f"{acc['act_id']}/insights", {
            'fields': 'spend,impressions,clicks,cpc,ctr,actions,action_values',
            'time_range': json.dumps({'since': since, 'until': until}),
            'level': 'account',
        })
        
        d = ins.get('data', [{}])[0] if ins.get('data') else {}
        spend = float(d.get('spend', 0))
        impressions = int(d.get('impressions', 0))
        clicks = int(d.get('clicks', 0))
        cpc = int(float(d.get('cpc', 0)))
        ctr = float(d.get('ctr', 0))
        
        revenue = 0; conversions = 0
        for av in d.get('action_values', []):
            if av.get('action_type') == 'purchase':
                revenue = float(av.get('value', 0))
        for a in d.get('actions', []):
            if a.get('action_type') == 'purchase':
                conversions = int(a.get('value', 0))
        
        return {
            'success': True, 'account_name': acc['name'],
            'period_days': days, 'spend': spend, 'revenue': revenue,
            'impressions': impressions, 'clicks': clicks,
            'cpc': cpc, 'ctr': ctr, 'conversions': conversions,
            'roas': round(revenue / max(spend, 1), 2),
        }
    
    # ─── ACTIONS ───
    
    def pause_campaign(self, campaign_id):
        """Pause campaign via Meta API."""
        result = api_post(campaign_id, {'status': 'PAUSED'})
        if 'error' in result:
            return {'success': False, 'error': str(result['error'])}
        return {'success': True, 'message': 'Campaign paused'}
    
    def activate_campaign(self, campaign_id):
        """Activate campaign via Meta API."""
        result = api_post(campaign_id, {'status': 'ACTIVE'})
        if 'error' in result:
            return {'success': False, 'error': str(result['error'])}
        return {'success': True, 'message': 'Campaign activated'}
    
    def kill_campaign(self, campaign_id):
        """Kill: pause + prefix OFF_"""
        info = api(campaign_id, {'fields': 'name'})
        name = (info or {}).get('name', '')
        if 'error' in info:
            return {'success': False, 'error': str(info.get('error', 'API error'))}
        
        if not name.startswith('OFF_'):
            api_post(campaign_id, {'name': f"OFF_{name}"})
        return self.pause_campaign(campaign_id)
    
    def update_budget(self, campaign_id, daily_budget):
        """Update campaign daily budget (in currency units, converted to cents)."""
        result = api_post(campaign_id, {'daily_budget': int(daily_budget * 100)})
        if 'error' in result:
            return {'success': False, 'error': str(result['error'])}
        return {'success': True, 'message': f'Budget updated'}


fb_service = FacebookService()
