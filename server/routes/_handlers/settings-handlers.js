/**
 * Settings Handlers — Extracted from settings.js god function.
 * Each handler is a pure function that takes its deps and returns a middleware.
 * Behavior preserved byte-for-byte vs the inline router definitions.
 */

import { v4 as uuid } from 'uuid';
import config from '../../config/index.js';
import { PlanCheck } from '../../lib/plan-check.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('settings-handlers');

// GET / — all general settings (legacy creds skipped)
export function handleGetGeneralSettings(settingsRepo) {
  return (req, res) => {
    const all = settingsRepo.getAll();
    const safe = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('credentials_')) continue; // Skip legacy creds in general list
      safe[key] = value;
    }
    res.json({ success: true, data: safe });
  };
}

// GET /plan — user's plan details
export function handleGetPlan(db) {
  const planCheck = new PlanCheck(db);
  return (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const planDetails = planCheck.getPlanDetails(userId);
    if (!planDetails) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    res.json({ success: true, data: planDetails });
  };
}

// GET /ai
export function handleGetAi(settingsRepo) {
  return (req, res) => {
    const llmConfig = settingsRepo.get('llm_config') || {
      url: config.llm.url,
      model: config.llm.model,
      apiKey: config.llm.apiKey ? '••••••••' : ''
    };
    res.json({ success: true, data: llmConfig });
  };
}

// PUT /ai
export function handlePutAi(settingsRepo, llmClient) {
  return (req, res) => {
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
  };
}

// POST /ai/test-connection
export function handleTestAiConnection(llmClient) {
  return async (req, res) => {
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
  };
}

// POST /ai/models
export function handleListAiModels(llmClient) {
  return async (req, res) => {
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
  };
}

// POST /ai/test-prompt
export function handleTestAiPrompt(llmClient) {
  return async (req, res) => {
    const { prompt, systemPrompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'prompt is required' });

    try {
      const response = await llmClient.call(systemPrompt || 'You are a helpful assistant.', prompt);
      res.json({ success: true, data: response });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// GET /accounts — multi-account list (creds masked)
export function handleListAccounts(settingsRepo) {
  return (req, res) => {
    try {
      const { platform } = req.query;
      const all = settingsRepo.getAccounts ? settingsRepo.getAccounts(platform) : [];
      // Scope to the requesting user (multi-tenant). platform_accounts rows carry user_id.
      const accounts = (Array.isArray(all) ? all : []).filter(
        acc => acc.user_id === req.user.id && acc.is_active !== 0
      );
      const safe = accounts.map(acc => {
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
  };
}

// POST /accounts — create account
export function handleCreateAccount(settingsRepo) {
  return (req, res) => {
    const { platform, account_name, credentials } = req.body;
    if (!platform || !account_name || !credentials) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const id = uuid();
    settingsRepo.addAccount({
      id,
      user_id: req.user.id,
      platform,
      account_name,
      credentials
    });

    res.json({ success: true, data: { id } });
  };
}

// PUT /accounts/:id
export function handleUpdateAccount(settingsRepo) {
  return (req, res) => {
    const { id } = req.params;
    const { platform, is_active } = req.body;

    const account = settingsRepo.getAccount(id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    // Multi-tenant ownership guard: a user may only mutate their own account.
    if (!req.user || account.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    if (is_active === 1 && platform) {
      settingsRepo.setActiveAccountForUser(platform, id, req.user.id);
    } else {
      // Strip ownership/scoping keys so a caller cannot reassign this account to
      // another user_id or change its platform — that would expose the account's
      // token to a different user (cross-tenant leak).
      const { user_id: _uid, platform: _plat, id: _id, ...safeBody } = req.body;
      settingsRepo.updateAccount(id, safeBody);
    }

    res.json({ success: true });
  };
}

// DELETE /accounts/:id
export function handleDeleteAccount(settingsRepo) {
  return (req, res) => {
    const account = settingsRepo.getAccount(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    // Multi-tenant ownership guard: a user may only delete their own account.
    if (!req.user || account.user_id !== req.user.id) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    // Soft delete (deactivate) — keep the row so the user can reconnect
    // without re-entering the token. Matches the Telegram bot
    // handleAdsDisconnectConfirm semantics. The GDPR data-deletion path in
    // auth.js intentionally uses the real hard delete and is untouched.
    settingsRepo.updateAccount(req.params.id, { is_active: 0 });
    res.json({ success: true });
  };
}


// POST /accounts/test — validate credentials (meta)
export function handleTestAccount(metaApi) {
  return async (req, res) => {
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
  };
}

// POST /accounts/meta/exchange-token — long-lived token exchange + save
export function handleExchangeMetaToken(settingsRepo, metaApi) {
  return async (req, res) => {
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

      const userId = req.user.id;
      const accountName = `Meta - ${me.name}`;
      const existingAccounts = settingsRepo.getAccounts('meta').filter(a => a.user_id === userId);
      const existing = existingAccounts.find(a => a.account_name === accountName);

      if (existing) {
        settingsRepo.updateAccount(existing.id, { credentials: { access_token: longToken } });
      } else {
        settingsRepo.addAccount({
          id: uuid(),
          user_id: req.user.id,
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
  };
}

// POST /accounts/connect-token — simple token connect (meta auto-detects ad accounts)
export function handleConnectToken(settingsRepo, metaApi, nangoAuth) {
  return async (req, res) => {
    const { platform, access_token, account_name } = req.body;
    if (!platform || !access_token) {
      return res.status(400).json({ success: false, error: 'platform and access_token are required' });
    }

    try {
      if (platform === 'meta') {
        // Meta: verify token via Facebook Graph API + discover ad accounts
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
        const userId = req.user.id;
        const existingAccounts = settingsRepo.getAccounts('meta').filter(a => a.user_id === userId);
        const existing = existingAccounts.find(a =>
          a.account_name === userName ||
          (a.credentials?.access_token === access_token)
        );
        let mainId;

        if (existing) {
          settingsRepo.updateAccount(existing.id, {
            credentials: { access_token, user_name: meData.name, user_id: meData.id },
            is_active: 1
          });
          mainId = existing.id;
        } else {
          const id = uuid();
          settingsRepo.addAccount({
            id,
            user_id: req.user.id,
            platform: 'meta',
            account_name: userName,
            credentials: { access_token, user_name: meData.name, user_id: meData.id },
            is_active: existingAccounts.length === 0 ? 1 : 0
          });
          mainId = id;
        }
        // Optionally mirror credentials to Nango
        if (nangoAuth && nangoAuth.enabled) {
          nangoAuth.storeCredentials(req.user.id, 'meta', { access_token }).catch(err => {
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
              user_id: req.user.id,
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
            platform: 'meta',
            user_name: meData.name,
            user_id: meData.id,
            ad_accounts_count: adAccounts.length,
            new_connected: connectedCount,
            ad_accounts: adAccounts
          }
        });
      } else {
        // Non-Meta platforms: save token directly (no generic platform validation)
        const userId = req.user.id;
        const existingAccounts = settingsRepo.getAccounts(platform).filter(a => a.user_id === userId);
        const displayName = account_name || `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`;
        const existing = existingAccounts.find(a =>
          a.account_name === displayName ||
          (a.credentials?.access_token === access_token)
        );

        if (existing) {
          settingsRepo.updateAccount(existing.id, { credentials: { access_token }, is_active: 1 });
        } else {
          const id = uuid();
          settingsRepo.addAccount({
            id,
            user_id: req.user.id,
            platform,
            account_name: displayName,
            credentials: { access_token },
            is_active: existingAccounts.length === 0 ? 1 : 0
          });
        }

        res.json({
          success: true,
          message: `Connected ${platform} account successfully!`,
          data: { platform }
        });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

// GET /credentials/:platform — legacy
export function handleGetCredentials(settingsRepo) {
  return (req, res) => {
    const all = settingsRepo.getAccounts(req.params.platform);
    // Scope to the requesting user (multi-tenant). platform_accounts rows carry user_id.
    const userAccounts = (Array.isArray(all) ? all : []).filter(
      a => a.user_id === req.user.id && a.is_active !== 0
    );
    const acc = userAccounts.find(a => a.is_active);

    if (!acc) {
      return res.json({ success: true, data: { configured: false, platform: req.params.platform } });
    }

    const fields = {};
    for (const [k, v] of Object.entries(acc.credentials)) {
      fields[k] = v ? `${String(v).slice(0, 4)}****` : null;
    }
    res.json({ success: true, data: { configured: true, platform: req.params.platform, fields, account_id: acc.id } });
  };
}

// POST /credentials/:platform — legacy
export function handlePostCredentials(settingsRepo) {
  return (req, res) => {
    const { platform } = req.params;
    const credentials = req.body;

    const userId = req.user.id;
    const accounts = settingsRepo.getAccounts(platform).filter(a => a.user_id === userId);
    const existingDefault = accounts.find(a => a.account_name === 'Default');

    if (existingDefault) {
      settingsRepo.updateAccount(existingDefault.id, { credentials });
    } else {
      settingsRepo.addAccount({
        id: uuid(),
        user_id: req.user.id,
        platform,
        account_name: 'Default',
        credentials,
        is_active: 1
      });
    }

    res.json({ success: true, data: { platform, configured: true } });
  };
}

// GET /integrations
export function handleGetIntegrations(settingsRepo) {
  return (req, res) => {
    const enabled = settingsRepo.get('integration_adspirer_enabled');
    res.json({
      success: true,
      data: {
        adspirer: { enabled: enabled === true || enabled === 'true' || enabled === 1 },
      },
    });
  };
}

// POST /integrations/:name
export function handleToggleIntegration(settingsRepo) {
  return (req, res) => {
    const { name } = req.params;
    const { enabled } = req.body;
    if (enabled === undefined) return res.status(400).json({ success: false, error: 'enabled is required' });
    if (!['adspirer'].includes(name)) return res.status(400).json({ success: false, error: `Unknown integration: ${name}` });
    settingsRepo.set(`integration_${name}_enabled`, Boolean(enabled));
    res.json({ success: true, data: { [name]: { enabled: Boolean(enabled) } } });
  };
}

// PUT /:key — save a general setting
export function handlePutSetting(settingsRepo) {
  return (req, res) => {
    const { value } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, error: 'value is required' });
    settingsRepo.set(req.params.key, value);
    res.json({ success: true });
  };
}
