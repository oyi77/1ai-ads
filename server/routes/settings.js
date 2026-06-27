import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import config from '../config/index.js';
import { PlanCheck } from '../lib/plan-check.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('settings');

export function createSettingsRouter(settingsRepo, llmClient, db, metaApi, _dailySpendGuard, nangoAuth) {
  const router = Router();
  const planCheck = new PlanCheck(db);

  // Get all general settings
  router.get('/', (req, res) => {
    const all = settingsRepo.getAll();
    const safe = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('credentials_')) continue; // Skip legacy creds in general list
      safe[key] = value;
    }
    res.json({ success: true, data: safe });
  });

  // Get user's plan details
  router.get('/plan', (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const planDetails = planCheck.getPlanDetails(userId);
    if (!planDetails) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    res.json({ success: true, data: planDetails });
  });

  router.get('/ai', (req, res) => {
    const llmConfig = settingsRepo.get('llm_config') || {
      url: config.llm.url,
      model: config.llm.model,
      apiKey: config.llm.apiKey ? '••••••••' : ''
    };
    res.json({ success: true, data: llmConfig });
  });

  router.put('/ai', (req, res) => {
    const { url, model, apiKey } = req.body;
    const current = settingsRepo.get('llm_config') || {};
    
    const newConfig = {
      url: url || llmClient.url,
      model: model || llmClient.model,
      apiKey: (apiKey && apiKey !== '••••••••') ? apiKey : current.apiKey || llmClient.apiKey
    };

    settingsRepo.set('llm_config', newConfig);
    llmClient.updateConfig(newConfig);
    res.json({ success: true });
  });

  router.post('/ai/test-connection', async (req, res) => {
    const { url, apiKey } = req.body;
    
    try {
      const testClient = new llmClient.constructor({
        url: url || llmClient.url,
        apiKey: (apiKey && apiKey !== '••••••••') ? apiKey : llmClient.apiKey
      });
      
      await testClient.call('You are a connectivity test bot.', 'Respond with "OK" if you receive this.');
      res.json({ success: true, message: 'Connection successful' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ai/models', async (req, res) => {
    const { url, apiKey } = req.body;
    
    try {
      const testClient = new llmClient.constructor({
        url: url || llmClient.url,
        apiKey: (apiKey && apiKey !== '••••••••') ? apiKey : llmClient.apiKey
      });
      
      const models = await testClient.fetchModels();
      res.json({ success: true, data: models });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/ai/test-prompt', async (req, res) => {
    const { prompt, systemPrompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'prompt is required' });

    try {
      const response = await llmClient.call(systemPrompt || 'You are a helpful assistant.', prompt);
      res.json({ success: true, data: response });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Multi-account API ---

  router.get('/accounts', (req, res) => {
    try {
      const { platform } = req.query;
      const accounts = settingsRepo.getAccounts ? settingsRepo.getAccounts(platform) : [];
      const safe = (Array.isArray(accounts) ? accounts : []).map(acc => {
        const creds = acc.credentials || {};
        const maskedCreds = {};
        for (const [k, v] of Object.entries(creds)) {
          maskedCreds[k] = v ? `${String(v).slice(0, 4)}****` : null;
        }
        return { ...acc, credentials: maskedCreds };
      });
      res.json({ success: true, data: safe });
    } catch {
      res.json({ success: true, data: [] });
    }
  });

  router.post('/accounts', (req, res) => {
    const { platform, account_name, credentials } = req.body;
    if (!platform || !account_name || !credentials) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const id = uuid();
    settingsRepo.addAccount({
      id,
      user_id: req.user?.id || 'admin', // Default to admin for MVP
      platform,
      account_name,
      credentials
    });

    res.json({ success: true, data: { id } });
  });

  router.put('/accounts/:id', (req, res) => {
    const { id } = req.params;
    const { platform, is_active } = req.body;
    
    if (is_active === 1 && platform) {
      settingsRepo.setActiveAccount(platform, id);
    } else {
      settingsRepo.updateAccount(id, req.body);
    }
    
    res.json({ success: true });
  });

  router.delete('/accounts/:id', (req, res) => {
    settingsRepo.deleteAccount(req.params.id);
    res.json({ success: true });
  });

  router.post('/accounts/test', async (req, res) => {
    const { platform, credentials } = req.body;
    if (!platform || !credentials) {
      return res.status(400).json({ success: false, error: 'Missing platform or credentials' });
    }

    try {
      if (platform === 'meta') {
        const credentialHolder = { getCredentials: () => credentials };
        const api = new metaApi.constructor(credentialHolder);
        const me = await api.getMe();
        return res.json({ success: true, message: `Connected as ${me.name}` });
      }
      
      res.json({ success: true, message: 'Configuration format looks valid' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  router.post('/accounts/meta/exchange-token', async (req, res) => {
    const { appId, appSecret, shortToken } = req.body;
    if (!appId || !appSecret || !shortToken) {
      return res.status(400).json({ success: false, error: 'appId, appSecret, and shortToken are required' });
    }

    try {
      const url = `https://graph.facebook.com/${config.metaApiVersion}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ success: false, error: data.error.message });
      }

      const longToken = data.access_token;
      
      const tokenInfoUrl = `https://graph.facebook.com/${config.metaApiVersion}/debug_token?input_token=${encodeURIComponent(longToken)}&access_token=${encodeURIComponent(appId)}|${encodeURIComponent(appSecret)}`;
      const tokenInfoRes = await fetch(tokenInfoUrl);
      const tokenInfo = await tokenInfoRes.json();
      
      let expiresIn = 60;
      if (tokenInfo.data?.expires_at) {
        expiresIn = Math.floor((tokenInfo.data.expires_at * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
      }

      const credentialHolder = { getCredentials: () => ({ access_token: longToken }) };
      const api = new metaApi.constructor(credentialHolder);
      const me = await api.getMe();

      const accountName = `Meta - ${me.name}`;
      const existingAccounts = settingsRepo.getAccounts('meta');
      const existing = existingAccounts.find(a => a.account_name === accountName);

      if (existing) {
        settingsRepo.updateAccount(existing.id, { credentials: { access_token: longToken } });
      } else {
        settingsRepo.addAccount({
          id: uuid(),
          user_id: req.user?.id || 'admin',
          platform: 'meta',
          account_name: accountName,
          credentials: { access_token: longToken },
          is_active: existingAccounts.length === 0 ? 1 : 0
        });
      }

      res.json({ 
        success: true, 
        message: `Token exchanged & saved! Valid for ~${expiresIn} days. Connected as ${me.name}`,
        expiresInDays: expiresIn,
        userName: me.name
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- SIMPLE TOKEN CONNECT (no OAuth needed) ---
  router.post('/accounts/connect-token', async (req, res) => {
    const { access_token, account_name } = req.body;
    if (!access_token) {
      return res.status(400).json({ success: false, error: 'access_token is required' });
    }

    try {
      // Verify token works
      const meRes = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/me?access_token=${encodeURIComponent(access_token)}&fields=id,name`);
      const meData = await meRes.json();
      if (meData.error) {
        return res.status(400).json({ success: false, error: `Invalid token: ${meData.error.message}` });
      }

      const userName = account_name || meData.name || 'Meta Account';
      
      // Auto-detect ad accounts
      let adAccounts = [];
      try {
        const accRes = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/me/adaccounts?access_token=${encodeURIComponent(access_token)}&fields=name,account_id,account_status,currency&limit=50`);
        const accData = await accRes.json();
        if (accData.data) {
          adAccounts = accData.data.filter(a => a.account_status === 1).map(a => ({
            id: `act_${a.account_id}`,
            name: a.name,
            account_id: a.account_id,
            currency: a.currency,
            status: 'active'
          }));
        }
      } catch (e) {
        log.error('Failed to detect ad accounts', { error: e.message });
      }

      // Save main account with token
      const existingAccounts = settingsRepo.getAccounts('meta');
      const existing = existingAccounts.find(a => 
        a.account_name === userName || 
        (a.credentials?.access_token === access_token)
      );

      let mainId;
      if (existing) {
        settingsRepo.updateAccount(existing.id, { 
          credentials: { access_token, user_name: meData.name, user_id: meData.id } 
        });
        mainId = existing.id;
      } else {
        const id = uuid();
        settingsRepo.addAccount({
          id,
          user_id: req.user?.id || 'admin',
          platform: 'meta',
          account_name: userName,
          credentials: { access_token, user_name: meData.name, user_id: meData.id },
          is_active: existingAccounts.length === 0 ? 1 : 0
        });
        mainId = id;
      }
      // Optionally mirror credentials to Nango
      if (nangoAuth && nangoAuth.enabled) {
        nangoAuth.storeCredentials(req.user?.id || 'admin', 'meta', { access_token }).catch(err => {
          log.error('Failed to mirror credentials to Nango', { error: err.message });
        });
      }

      // Also save each ad account
      let connectedCount = 0;
      for (const adAcc of adAccounts) {
        const adExisting = existingAccounts.find(a => a.account_name === adAcc.id || a.account_name === adAcc.name);
        if (!adExisting) {
          settingsRepo.addAccount({
            id: uuid(),
            user_id: req.user?.id || 'admin',
            platform: 'meta',
            account_name: adAcc.id,
            credentials: { access_token, ad_account_id: adAcc.account_id, ad_account_name: adAcc.name },
            is_active: 0
          });
          connectedCount++;
        }
      }

      res.json({
        success: true,
        message: `Connected as ${meData.name}! Found ${adAccounts.length} ad accounts, ${connectedCount} new connected.`,
        data: {
          id: mainId,
          user_name: meData.name,
          user_id: meData.id,
          ad_accounts_count: adAccounts.length,
          new_connected: connectedCount,
          ad_accounts: adAccounts
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Legacy Support (for existing frontend calls) ---

  router.get('/credentials/:platform', (req, res) => {
    const accounts = settingsRepo.getAccounts(req.params.platform);
    const acc = accounts.find(a => a.is_active) || accounts[0];
    
    if (!acc) {
      return res.json({ success: true, data: { configured: false, platform: req.params.platform } });
    }

    const fields = {};
    for (const [k, v] of Object.entries(acc.credentials)) {
      fields[k] = v ? `${String(v).slice(0, 4)}****` : null;
    }
    res.json({ success: true, data: { configured: true, platform: req.params.platform, fields, account_id: acc.id } });
  });

  router.post('/credentials/:platform', (req, res) => {
    const { platform } = req.params;
    const credentials = req.body;

    // Create or update "Default" account for legacy calls
    const accounts = settingsRepo.getAccounts(platform);
    const existingDefault = accounts.find(a => a.account_name === 'Default');

    if (existingDefault) {
      settingsRepo.updateAccount(existingDefault.id, { credentials });
    } else {
      settingsRepo.addAccount({
        id: uuid(),
        user_id: req.user?.id || 'admin',
        platform,
        account_name: 'Default',
        credentials,
        is_active: 1
      });
    }

    res.json({ success: true, data: { platform, configured: true } });
  });

  // Get integration configs
  router.get('/integrations', (req, res) => {
    const enabled = settingsRepo.get('integration_adspirer_enabled');
    res.json({
      success: true,
      data: {
        adspirer: { enabled: enabled === true || enabled === 'true' || enabled === 1 },
      },
    });
  });

  // Toggle an integration on/off
  router.post('/integrations/:name', (req, res) => {
    const { name } = req.params;
    const { enabled } = req.body;
    if (enabled === undefined) return res.status(400).json({ success: false, error: 'enabled is required' });
    if (!['adspirer'].includes(name)) return res.status(400).json({ success: false, error: `Unknown integration: ${name}` });
    settingsRepo.set(`integration_${name}_enabled`, Boolean(enabled));
    res.json({ success: true, data: { [name]: { enabled: Boolean(enabled) } } });
  });

  // Save a general setting
  router.put('/:key', (req, res) => {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, error: 'value is required' });
    settingsRepo.set(req.params.key, value);
    res.json({ success: true });
  });

  return router;
}
