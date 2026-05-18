#!/usr/bin/env python3
"""
AdForge - Meta Ads Management Platform
Facebook Graph API Integration + Campaign Management
"""

from flask import Flask, request, redirect, session, jsonify, render_template
from urllib.parse import urlencode
import requests
import json
import os
import time
from datetime import datetime
from pathlib import Path

app = Flask(__name__, static_folder='static', template_folder='templates')

# Configuration
app.secret_key = os.getenv('ADFORGE_SECRET_KEY', 'adforge-secret-key-2026')
FB_APP_ID = os.getenv('FB_APP_ID', '')
FB_APP_SECRET = os.getenv('FB_APP_SECRET', '')
FB_REDIRECT_URI = os.getenv('FB_REDIRECT_URI', 'https://adforge.aitradepulse.com/auth/facebook/callback')

# User data storage
USERS_DIR = Path('/home/openclaw/.openclaw/workspace/adforge_users')
USERS_DIR.mkdir(parents=True, exist_ok=True)

@app.route('/')
def index():
    """Dashboard home - frictionless access, no login required"""
    user = session.get('user')
    return render_template('dashboard.html', user=user)


def get_facebook_auth_url():
    """Generate Facebook OAuth URL"""
    params = {
        'client_id': FB_APP_ID,
        'redirect_uri': FB_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'ads_management,ads_read,pages_show_list,pages_read_engagement'
    }
    return f"https://www.facebook.com/v18.0/dialog/oauth?{urlencode(params)}"


@app.route('/auth/facebook')
def authorize_facebook():
    """Facebook OAuth login - redirect to Facebook"""
    return redirect(get_facebook_auth_url())


@app.route('/auth/facebook/callback')
def callback_facebook():
    """Facebook OAuth callback"""
    code = request.args.get('code')
    if not code:
        return 'Authorization failed - no code received', 400
    
    try:
        # Exchange code for access token
        token_url = f"https://graph.facebook.com/oauth/access_token"
        params = {
            'client_id': FB_APP_ID,
            'client_secret': FB_APP_SECRET,
            'redirect_uri': FB_REDIRECT_URI,
            'code': code
        }
        
        response = requests.get(token_url, params=params)
        token_data = response.json()
        
        if 'error' in token_data:
            return f"Token exchange failed: {token_data['error']}", 400
        
        access_token = token_data['access_token']
        token_expires = token_data.get('expires_in', 0)
        
        # Get user info
        user_info = requests.get(
            'https://graph.facebook.com/me',
            params={'access_token': access_token, 'fields': 'id,name,email'}
        ).json()
        
        # Store session
        session['user'] = {
            'fb_id': user_info['id'],
            'fb_name': user_info['name'],
            'fb_email': user_info.get('email', ''),
            'access_token': access_token,
            'token_expires': token_expires,
            'login_at': datetime.now().isoformat()
        }
        
        # Save user data
        save_user_data(user_info['id'], session['user'])
        
        return redirect('/')
        
    except Exception as e:
        return f"Callback failed: {str(e)}", 500


@app.route('/logout')
def logout():
    """User logout"""
    session.pop('user', None)
    return redirect('/')


# Facebook Graph API helper
def fb_api_request(endpoint, method='GET', params=None):
    """Make Facebook Graph API request"""
    user = session.get('user')
    if not user:
        return {'error': 'Not authenticated'}, 401
    
    base_url = f'https://graph.facebook.com/v18.0/{endpoint}'
    all_params = {'access_token': user['access_token']}
    if params:
        all_params.update(params)
    
    try:
        if method == 'GET':
            response = requests.get(base_url, params=all_params, timeout=30)
        elif method == 'POST':
            response = requests.post(base_url, data=all_params, timeout=30)
        else:
            return {'error': 'Unsupported method'}, 400
        
        return response.json()
    except Exception as e:
        return {'error': f'Facebook API request failed: {str(e)}'}


# API Endpoints

@app.route('/api/accounts')
def get_ads_accounts():
    """Get all ad accounts for logged-in user"""
    accounts = []
    
    # Get user's ad accounts
    response = fb_api_request('me/adaccounts')
    if 'data' in response:
        accounts.extend(response['data'])
    
    return jsonify({'accounts': accounts, 'count': len(accounts)})


@app.route('/api/campaigns')
def get_campaigns():
    """Get campaigns for selected ad account"""
    account_id = request.args.get('account_id')
    
    if not account_id:
        return jsonify({'error': 'account_id required'}), 400
    
    fields = 'id,name,status,objective,configured_status,created_time,updated_time,budget_type,budget_reformatted,start_time,end_time'
    
    response = fb_api_request(f'{account_id}/campaigns', params={'fields': fields})
    campaigns = response.get('data', [])
    
    return jsonify({'campaigns': campaigns, 'count': len(campaigns)})


@app.route('/api/campaigns/<campaign_id>')
def get_campaign_details(campaign_id):
    """Get campaign details"""
    fields = 'id,name,status,objective,configured_status,created_time,updated_time,budget_type,budget_reformatted,start_time,end_time,insights{spend,impressions,clicks,ctr,cpc,cpm}'
    
    response = fb_api_request(f'{campaign_id}', params={'fields': fields})
    
    if 'error' in response:
        return jsonify({'error': response['error']}), 400
    
    return jsonify({'campaign': response})


@app.route('/api/campaigns/<campaign_id>/pause')
def pause_campaign(campaign_id):
    """Pause a campaign"""
    response = fb_api_request(f'{campaign_id}', method='POST', params={'status': 'PAUSED'})
    
    if 'error' in response:
        return jsonify({'error': response['error']}), 400
    
    return jsonify({'success': True, 'campaign_id': campaign_id, 'status': 'PAUSED'})


@app.route('/api/campaigns/<campaign_id>/activate')
def activate_campaign(campaign_id):
    """Activate a paused campaign"""
    response = fb_api_request(f'{campaign_id}', method='POST', params={'status': 'ACTIVE'})
    
    if 'error' in response:
        return jsonify({'error': response['error']}), 400
    
    return jsonify({'success': True, 'campaign_id': campaign_id, 'status': 'ACTIVE'})


@app.route('/api/ads')
def get_ads():
    """Get ads for selected campaign"""
    campaign_id = request.args.get('campaign_id')
    
    if not campaign_id:
        return jsonify({'error': 'campaign_id required'}), 400
    
    fields = 'id,name,status,created_time,updated_time,adset_id,creative{id,name,type}'
    
    response = fb_api_request(f'{campaign_id}/ads', params={'fields': fields})
    
    if 'error' in response:
        return jsonify({'error': response['error']}), 400
    
    return jsonify({'ads': response.get('data', []), 'count': len(response.get('data', []))})


@app.route('/api/adsets')
def get_adsets():
    """Get ad sets for selected campaign"""
    campaign_id = request.args.get('campaign_id')
    
    if not campaign_id:
        return jsonify({'error': 'campaign_id required'}), 400
    
    fields = 'id,name,status,budget_reformatted,start_time,end_time,optimized_loading_status'
    
    response = fb_api_request(f'{campaign_id}/adsets', params={'fields': fields})
    
    if 'error' in response:
        return jsonify({'error': response['error']}), 400
    
    return jsonify({'adsets': response.get('data', []), 'count': len(response.get('data', []))})


@app.route('/api/insights')
def get_insights():
    """Get campaign insights"""
    campaign_id = request.args.get('campaign_id')
    date_preset = request.args.get('date_preset', 'last_7_days')
    
    if not campaign_id:
        return jsonify({'error': 'campaign_id required'}), 400
    
    fields = 'spend,impressions,clicks,ctr,cpc,cpm,actions'
    
    response = fb_api_request(f'{campaign_id}/insights', params={
        'fields': fields,
        'date_preset': date_preset,
        'time_increment': '1'
    })
    
    if 'error' in response:
        return jsonify({'error': response['error']}), 400
    
    return jsonify({'insights': response.get('data', []), 'date_preset': date_preset})


@app.route('/api/auto-analyze')
def auto_analyze():
    """Auto-analyze campaigns and provide recommendations"""
    user = session.get('user')
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Get all ad accounts
    accounts_response = fb_api_request('me/adaccounts')
    accounts = accounts_response.get('data', [])
    
    analysis = []
    
    for account in accounts[:3]:  # Analyze top 3 accounts
        account_id = account.get('id')
        if not account_id:
            continue
        
        # Get campaigns for this account
        campaigns_response = fb_api_request(f'{account_id}/campaigns', params={
            'fields': 'id,name,status,objective,created_time',
            'limit': 10
        })
        
        account_analysis = {
            'account_id': account_id,
            'account_name': account.get('name', ''),
            'campaigns': []
        }
        
        for campaign in campaigns_response.get('data', []):
            campaign_id = campaign.get('id')
            if not campaign_id:
                continue
            
            # Get campaign insights
            insights_response = fb_api_request(f'{campaign_id}/insights', params={
                'fields': 'spend,impressions,clicks,ctr,cpc,cpm',
                'date_preset': 'last_7_days'
            })
            
            insights = insights_response.get('data', [])
            if insights:
                last_day = insights[0]
                spend = float(last_day.get('spend', 0))
                cpc = float(last_day.get('cpc', 0)) if last_day.get('cpc') else 0
                
                # Generate recommendations
                recommendations = []
                
                if campaign.get('status') == 'PAUSED':
                    recommendations.append({
                        'type': 'pause',
                        'message': 'Campaign is paused'
                    })
                
                if spend > 1000000 and cpc > 50000:
                    recommendations.append({
                        'type': 'optimize_cpc',
                        'message': 'High CPC detected - consider A/B testing creatives'
                    })
                
                if spend < 100000:
                    recommendations.append({
                        'type': 'increase_budget',
                        'message': 'Low spend - consider increasing budget'
                    })
                
                account_analysis['campaigns'].append({
                    'id': campaign_id,
                    'name': campaign.get('name', ''),
                    'status': campaign.get('status', ''),
                    'spend': spend,
                    'cpc': cpc,
                    'recommendations': recommendations
                })
        
        analysis.append(account_analysis)
    
    return jsonify({'analysis': analysis, 'generated_at': datetime.now().isoformat()})


@app.route('/api/cf-health')
def cf_health():
    """Cloudflare health check"""
    return jsonify({
        'status': 'ok',
        'service': 'adforge',
        'domain': 'adforge.aitradepulse.com',
        'timestamp': datetime.now().isoformat()
    })


# Helper functions
def save_user_data(fb_id, user_data):
    """Save user data to file"""
    user_file = USERS_DIR / f'{fb_id}.json'
    user_data['saved_at'] = datetime.now().isoformat()
    
    with open(user_file, 'w') as f:
        json.dump(user_data, f, indent=2)


if __name__ == '__main__':
    print("=" * 60)
    print("🚀 AdForge - Meta Ads Management Platform")
    print("=" * 60)
    print(f"FB App ID: {FB_APP_ID if FB_APP_ID else 'NOT SET'}")
    print(f"Redirect URI: {FB_REDIRECT_URI}")
    print("Listening on: http://127.0.0.1:5000")
    print("=" * 60)
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True,
        use_reloader=True
    )
