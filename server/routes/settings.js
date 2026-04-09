import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import config from '../config/index.js';
import { PlanCheck } from '../lib/plan-check.js';

export function createSettingsRouter(settingsRepo, llmClient, db) {
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
    const { platform } = req.query;
    const accounts = settingsRepo.getAccounts(platform);
    // Mask sensitive fields
    const safe = accounts.map(acc => {
      const maskedCreds = {};
      for (const [k, v] of Object.entries(acc.credentials)) {
        maskedCreds[k] = v ? `${String(v).slice(0, 4)}****` : null;
      }
      return { ...acc, credentials: maskedCreds };
    });
    res.json({ success: true, data: safe });
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
        const { MetaAdsAPI } = await import('../services/meta-api.js');
        const mockRepo = { getCredentials: () => credentials };
        const api = new MetaAdsAPI(mockRepo);
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
      const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortToken)}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        return res.status(400).json({ success: false, error: data.error.message });
      }

      const longToken = data.access_token;
      
      const tokenInfoUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(longToken)}&access_token=${encodeURIComponent(appId)}|${encodeURIComponent(appSecret)}`;
      const tokenInfoRes = await fetch(tokenInfoUrl);
      const tokenInfo = await tokenInfoRes.json();
      
      let expiresIn = 60;
      if (tokenInfo.data?.expires_at) {
        expiresIn = Math.floor((tokenInfo.data.expires_at * 1000 - Date.now()) / (1000 * 60 * 60 * 24));
      }

      const { MetaAdsAPI } = await import('../services/meta-api.js');
      const mockRepo = { getCredentials: () => ({ access_token: longToken }) };
      const api = new MetaAdsAPI(mockRepo);
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

  // Save a general setting
  router.put('/:key', (req, res) => {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, error: 'value is required' });
    settingsRepo.set(req.params.key, value);
    res.json({ success: true });
  });

  return router;
}
