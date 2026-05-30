import { createLogger } from '../lib/logger.js';
import { MetaAdsAPI } from './meta-api.js';
import { GoogleAdsAPI } from './google-ads-api.js';
import { TikTokAdsAPI } from './tiktok-api.js';
import config from '../config/index.js';

const log = createLogger('autonomous-agent');
const API_VERSION = config.metaApiVersion;

// Rule types: if <condition> then <action>
// Conditions: budget > X, spend > Y, ROAS < Z, etc.
// Actions: scale_up, scale_down, pause, resume, optimize_creative, optimize_budget

export class AutonomousAgent {
  constructor(settingsRepo, platformAccountsRepo, campaignsRepo, rulesRepo, llmClient, aiAgent) {
    this.settingsRepo = settingsRepo;
    this.platformAccountsRepo = platformAccountsRepo;
    this.campaignsRepo = campaignsRepo;
    this.rulesRepo = rulesRepo;
    this.llmClient = llmClient;
    this.aiAgent = aiAgent;
    this.metaAdsAPI = new MetaAdsAPI(''); // Will be populated on connect
    this.googleAdsAPI = new GoogleAdsAPI();
    this.tiktokAdsAPI = new TikTokAdsAPI(settingsRepo);
    
    this.scheduler = null;
    this.runningRules = new Set(); // Track currently running rules to prevent overlap
  }

  _getPlatformApi(platform) {
    switch (platform) {
      case 'google': return this.googleAdsAPI;
      case 'tiktok': return this.tiktokAdsAPI;
      default: return this.metaAdsAPI;
    }
  }

  // ============================================
  // 1. FB CONNECTION - Simple OAuth Flow
  // ============================================

  async connectFacebook(authCode, redirectUri) {
    // Exchange auth code for access token (use centralized version)
    const response = await fetch(`https://graph.facebook.com/${API_VERSION}/oauth/access_token?client_id=${process.env.FB_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${process.env.FB_APP_SECRET}&code=${authCode}`);
    const data = await response.json();
    
    if (data.error) throw new Error(data.error.message);
    
    // Get long-lived token
    const longLived = await fetch(`https://graph.facebook.com/${API_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${process.env.FB_APP_ID}&client_secret=${process.env.FB_APP_SECRET}&access_token=${data.access_token}`);
    const longData = await longLived.json();
    
    return { accessToken: longData.access_token || data.access_token, expires: longData.expires_in || 0 };
  }

  async getFacebookAccounts(accessToken) {
    this.metaAdsAPI = new MetaAdsAPI(accessToken);
    
    // Get user accounts
    const userResponse = await this.metaAdsAPI.apiGet('/me/accounts', { fields: 'id,name,access_token,perms' });
    
    // Get business accounts if user has one
    const businessResponse = await this.metaAdsAPI.apiGet('/me/businesses', { fields: 'id,name' });
    
    return {
      personal: userResponse.data.filter(a => a.perms.includes('CREATE_AD')),
      business: businessResponse.data || []
    };
  }

  async linkFacebookAccount(userId, accountId, accountName, accessToken) {
    // Save to platform accounts
    return this.platformAccountsRepo.upsert({
      user_id: userId,
      platform: 'meta',
      platform_id: accountId,
      name: accountName,
      access_token: accessToken,
      status: 'connected',
      metadata: JSON.stringify({ last_sync: new Date().toISOString() })
    });
  }

  // ============================================
  // 2. Automation Rules System
  // ============================================

  createRule(userId, { name, condition, action, priority = 1, enabled = true }) {
    // Condition: JSON like { "type": "roas", "operator": "<", "value": 2.0 }
    // Action: JSON like { "type": "scale_up", "amount": 1.5 } or { "type": "pause" }
    
    return this.rulesRepo.create({
      user_id: userId,
      name,
      condition: JSON.stringify(condition),
      action: JSON.stringify(action),
      priority,
      enabled,
      created_at: new Date().toISOString()
    });
  }

  async evaluateRule(rule, campaign) {
    const condition = JSON.parse(rule.condition);
    const action = JSON.parse(rule.action);

    // Evaluate condition against campaign
    let matches = false;

    switch (condition.type) {
      case 'roas':
        const roas = campaign.stats?.roas || 0;
        matches = this._compare(roas, condition.operator, condition.value);
        break;
      
      case 'spend':
        const spend = campaign.stats?.spend || 0;
        matches = this._compare(spend, condition.operator, condition.value);
        break;
      
      case 'cpm':
        const cpm = campaign.stats?.cpm || 0;
        matches = this._compare(cpm, condition.operator, condition.value);
        break;
      
      case 'status':
        matches = campaign.status === condition.value;
        break;
    }

    if (matches) {
      return await this._executeAction(action, campaign);
    }
    
    return null;
  }

  _compare(value, operator, target) {
    switch (operator) {
      case '>': return value > target;
      case '>=': return value >= target;
      case '<': return value < target;
      case '<=': return value <= target;
      case '==': return value == target;
      case '!=': return value != target;
      default: return false;
    }
  }

  async _executeAction(action, campaign) {
    // Lock this campaign while executing
    if (this.runningRules.has(campaign.id)) return null;
    this.runningRules.add(campaign.id);

    try {
      const result = await this._applyAction(action, campaign);
      return { campaign_id: campaign.id, action, result };
    } finally {
      this.runningRules.delete(campaign.id);
    }
  }

  async _applyAction(action, campaign) {
    const { type } = action;

    switch (type) {
      case 'scale_up':
        const amount = action.amount || 1.5;
        return await this._scaleCampaign(campaign.id, amount, 'increase');
      
      case 'scale_down':
        const downAmount = action.amount || 0.8;
        return await this._scaleCampaign(campaign.id, downAmount, 'decrease');
      
      case 'pause':
        return await this._pauseCampaign(campaign.id);
      
      case 'resume':
        return await this._resumeCampaign(campaign.id);
      
      case 'optimize_creative':
        return await this._optimizeCreative(campaign.id);
      
      case 'optimize_budget':
        return await this._optimizeBudget(campaign.id);
      
      default:
        log.warn('Unknown action type', { type });
        return null;
    }
  }

  async _scaleCampaign(campaignId, multiplier, direction) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    const platform = campaign.platform || 'meta';
    const api = this._getPlatformApi(platform);
    const currentBudget = campaign.budget || 100;
    const newBudget = direction === 'increase' ? currentBudget * multiplier : currentBudget / multiplier;
    const minBudget = 100;
    const safeBudget = Math.max(minBudget, newBudget);
    
    if (platform === 'meta') {
      await api.apiUpdate(`/campaign_${campaignId}`, {
        budget: Math.round(safeBudget * 100) / 100
      });
    } else if (platform === 'google') {
      await api.updateCampaign(campaign.customer_id, campaign.platform_campaign_id, { budget: safeBudget });
    } else if (platform === 'tiktok') {
      await api.updateCampaign(campaign.advertiser_id, campaign.platform_campaign_id, { budget: safeBudget });
    }

    return { campaign_id: campaignId, action: 'scale', direction, from: currentBudget, to: safeBudget, platform };
  }

  async _pauseCampaign(campaignId) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    const platform = campaign.platform || 'meta';
    const api = this._getPlatformApi(platform);
    
    if (platform === 'meta') {
      await api.apiUpdate(`/campaign_${campaignId}`, { status: 'PAUSED' });
    } else if (platform === 'google') {
      await api.updateCampaign(campaign.customer_id, campaign.platform_campaign_id, { status: 'PAUSED' });
    } else if (platform === 'tiktok') {
      await api.updateCampaign(campaign.advertiser_id, campaign.platform_campaign_id, { status: 'DISABLE' });
    }
    
    return { campaign_id: campaignId, action: 'pause', status: 'PAUSED', platform };
  }

  async _resumeCampaign(campaignId) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    const platform = campaign.platform || 'meta';
    const api = this._getPlatformApi(platform);
    
    if (platform === 'meta') {
      await api.apiUpdate(`/campaign_${campaignId}`, { status: 'ACTIVE' });
    } else if (platform === 'google') {
      await api.updateCampaign(campaign.customer_id, campaign.platform_campaign_id, { status: 'ENABLED' });
    } else if (platform === 'tiktok') {
      await api.updateCampaign(campaign.advertiser_id, campaign.platform_campaign_id, { status: 'ENABLE' });
    }
    
    return { campaign_id: campaignId, action: 'resume', status: 'ACTIVE', platform };
  }

  async _optimizeCreative(campaignId) {
    // Use AI to suggest best creative
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    const ads = await this.campaignsRepo.getAds(campaignId);
    const bestAd = this._findBestAd(ads);
    
    if (bestAd) {
      await this.metaAdsAPI.apiUpdate(`/ad_${bestAd.platform_id}`, { status: 'ACTIVE' });
      // Pause others
      for (const ad of ads) {
        if (ad.id !== bestAd.id) {
          await this.metaAdsAPI.apiUpdate(`/ad_${ad.platform_id}`, { status: 'PAUSED' });
        }
      }
      
      return { campaign_id: campaignId, action: 'optimize_creative', best_ad_id: bestAd.id };
    }
    
    return { error: 'No ads found' };
  }

  _findBestAd(ads) {
    // Simple logic - find highest ROAS ad
    return ads.sort((a, b) => (b.stats?.roas || 0) - (a.stats?.roas || 0))[0];
  }

  async _optimizeBudget(campaignId) {
    const campaign = await this.campaignsRepo.getById(campaignId);
    if (!campaign) return { error: 'Campaign not found' };

    // Get campaign stats
    const insights = await this.metaAdsAPI.apiGet(`/campaign_${campaignId}`, {
      fields: 'spend,roas,cpc,cpm',
      time_span: '7days'
    });

    const stats = insights.data?.[0] || {};
    const currentBudget = campaign.budget || 100;

    // AI suggest budget adjustment
    const suggestion = await this.llmClient.call(
      'You are a budget optimization expert. Given campaign stats, suggest budget adjustment.',
      JSON.stringify({ campaign_id: campaignId, budget: currentBudget, stats })
    );

    let newBudget = currentBudget;
    if (suggestion.includes('increase')) {
      newBudget = currentBudget * 1.5;
    } else if (suggestion.includes('decrease')) {
      newBudget = currentBudget * 0.8;
    }

    await this.metaAdsAPI.apiUpdate(`/campaign_${campaignId}`, {
      budget: Math.round(newBudget * 100) / 100
    });

    return { 
      campaign_id: campaignId, 
      action: 'optimize_budget',
      from: currentBudget,
      to: newBudget,
      suggestion: suggestion
    };
  }

  // ============================================
  // 3. Campaign Monitoring & Decision Engine
  // ============================================

  async checkCampaigns(userId) {
    // Get all campaigns for user
    const campaigns = await this.campaignsRepo.getByUserId(userId);
    if (!campaigns || campaigns.length === 0) {
      log.info('No campaigns found', { userId });
      return [];
    }

    // Get user rules
    const rules = await this.rulesRepo.getAllEnabled(userId);
    
    if (rules.length === 0) {
      log.info('No rules found', { userId });
      return [];
    }

    // For each campaign, evaluate all rules
    const results = [];
    for (const campaign of campaigns) {
      for (const rule of rules) {
        const result = await this.evaluateRule(rule, campaign);
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  }

  async runAutonomousMode() {
    // This is the MAIN LOOP - runs continuously
    log.info('Autonomous mode started');

    this.scheduler = setInterval(async () => {
      try {
        const users = await this.platformAccountsRepo.getUsersWithAutoMode();
        
        for (const user of users) {
          const rulesCount = await this.rulesRepo.countEnabled(user.id);
          if (rulesCount === 0) continue;

          const platforms = ['meta', 'google', 'tiktok'];
          for (const platform of platforms) {
            const account = await this.platformAccountsRepo.getByPlatform(user.id, platform);
            if (!account || !account.access_token) continue;

            const api = this._getPlatformApi(platform);
            if (platform === 'meta') {
              this.metaAdsAPI = new MetaAdsAPI(account.access_token);
            }

            const results = await this.checkCampaigns(user.id);
            if (results.length > 0) {
              log.info('Autonomous actions executed', { userId: user.id, platform, actions: results.length, results });
            }
          }
        }
      } catch (err) {
        log.error('Autonomous mode error', { error: err.message });
      }
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(this.scheduler);
    };
  }

  // ============================================
  // 4. Daily Reporting
  // ============================================

  async sendDailyReport(userId) {
    const campaigns = await this.campaignsRepo.getByUserId(userId);
    const stats = await this._calculateCampaignStats(campaigns);

    const report = {
      date: new Date().toISOString().split('T')[0],
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
      totalSpend: stats.totalSpend,
      totalROAS: stats.totalROAS,
      actionsTaken: await this._getActionsTakenToday(userId),
      newRecommendations: await this.aiAgent.analyzeAndSuggest(userId)
    };

    // Send report to user (via Telegram, email, etc.)
    await this._sendReportToUser(userId, report);
    
    return report;
  }

  async _calculateCampaignStats(campaigns) {
    const stats = campaigns.map(c => c.stats || {}).reduce((acc, s) => ({
      totalSpend: acc.totalSpend + (s.spend || 0),
      totalROAS: acc.totalROAS + (s.roas || 0)
    }), { totalSpend: 0, totalROAS: 0 });

    return {
      totalSpend: Math.round(stats.totalSpend * 100) / 100,
      totalROAS: campaigns.length > 0 ? Math.round((stats.totalROAS / campaigns.length) * 100) / 100 : 0
    };
  }

  async _getActionsTakenToday(userId) {
    // Count actions taken today from logs/repo
    return 0; // Placeholder
  }

  async _sendReportToUser(userId, report) {
    // This would integrate with messaging system (Telegram, Email, etc.)
    log.info('Daily report sent', { userId, stats: report.totalCampaigns ? 'campaigns analyzed' : 'no campaigns' });
  }

  // ============================================
  // 5. UI Helpers
  // ============================================

  getAccountSelectorHtml(accounts) {
    // HTML for user to select which accounts to manage
    return accounts.reduce((html, account) => {
      html += `
        <div class="account-item">
          <input type="checkbox" value="${account.id}" data-name="${account.name}" class="account-select">
          <span>${account.name}</span>
          <small>${account.type || 'Personal'}</small>
        </div>`;
      return html;
    }, '<div class="accounts-grid">') + '</div>';
  }

  getRuleBuilderHtml() {
    // Simple rule builder UI
    return `
      <div class="rule-builder">
        <h3>Create Automation Rule</h3>
        <div>
          <label>Rule Name</label>
          <input type="text" class="rule-name" placeholder="e.g., Scale high ROAS campaigns">
        </div>
        
        <div>
          <label>Condition</label>
          <select class="condition-type">
            <option value="roas">ROAS</option>
            <option value="spend">Spend</option>
            <option value="cpm">CPM</option>
            <option value="status">Status</option>
          </select>
          <select class="condition-op">
            <option value=">">More than</option>
            <option value="<">Less than</option>
            <option value=">=">At least</option>
            <option value="<="">At most</option>
          </select>
          <input type="number" class="condition-value" placeholder="e.g., 2.0">
        </div>
        
        <div>
          <label>Action</label>
          <select class="action-type">
            <option value="scale_up">Scale Up (1.5x)</option>
            <option value="scale_down">Scale Down (0.8x)</option>
            <option value="pause">Pause</option>
            <option value="resume">Resume</option>
            <option value="optimize_creative">Optimize Creative</option>
            <option value="optimize_budget">Optimize Budget</option>
          </select>
        </div>
        
        <button class="save-rule">Save Rule</button>
      </div>`;
  }
}
