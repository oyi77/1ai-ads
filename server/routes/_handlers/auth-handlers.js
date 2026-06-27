/**
 * Auth Handlers — Extracted from auth.js god function.
 * Each handler is a pure function that takes deps and returns a middleware.
 */

import { hashPassword, verifyPassword, generateToken, generateRefreshToken, verifyToken } from '../../lib/auth.js';
import { createLogger } from '../../lib/logger.js';
import config from '../../config/index.js';
import { v4 as uuid } from 'uuid';

const log = createLogger('auth-handlers');

/**
 * POST /register
 */
export function handleRegister(usersRepo, refreshTokensRepo) {
  return async (req, res) => {
    try {
      const { username, password, email } = req.body;
      if (!username || !password || !email) {
        return res.status(400).json({ success: false, error: 'username, password, and email are required' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }
      if (usersRepo.findByUsername(username)) {
        return res.status(409).json({ success: false, error: 'Username already exists' });
      }
      if (usersRepo.findByEmail(email)) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }

      const userId = usersRepo.create({ username, email, password_hash: hashPassword(password), confirmed: 1 });
      const accessToken = generateToken({ id: userId, username, role: 'user', plan: 'free' });
      const refreshToken = generateRefreshToken({ id: userId, username });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(userId, refreshToken, expiresAt.toISOString());

      res.json({ success: true, data: { user: { id: userId, username, email, role: 'user', plan: 'free' }, accessToken, refreshToken } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

/**
 * POST /login
 */
export function handleLogin(usersRepo, refreshTokensRepo) {
  return async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = usersRepo.findByUsername(username) || usersRepo.findByEmail(username);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ success: false, error: 'Invalid credentials' });
      }

      refreshTokensRepo.deleteByUserId(user.id);
      const accessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const refreshToken = generateRefreshToken({ id: user.id, username: user.username });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, refreshToken, expiresAt.toISOString());

      res.json({ success: true, data: { user: { id: user.id, username: user.username, email: user.email, role: user.role || 'user', plan: user.plan || 'free' }, accessToken, refreshToken } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

/**
 * POST /refresh-token
 */
export function handleRefreshToken(usersRepo, refreshTokensRepo) {
  return async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ success: false, error: 'Refresh token required' });

      const payload = verifyToken(refreshToken);
      if (!payload || payload.tokenType !== 'refresh') {
        return res.status(401).json({ success: false, error: 'Invalid refresh token' });
      }

      const storedToken = refreshTokensRepo.findByToken(refreshToken);
      if (!storedToken) return res.status(401).json({ success: false, error: 'Token not found or revoked' });
      if (new Date(storedToken.expires_at) < new Date()) {
        refreshTokensRepo.deleteByToken(refreshToken);
        return res.status(401).json({ success: false, error: 'Refresh token expired' });
      }

      const user = usersRepo.findById(payload.id);
      if (!user) return res.status(401).json({ success: false, error: 'User not found' });

      const newAccessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const newRefreshToken = generateRefreshToken({ id: user.id, username: user.username });
      refreshTokensRepo.deleteByToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, newRefreshToken, expiresAt.toISOString());

      res.json({ success: true, data: { accessToken: newAccessToken, refreshToken: newRefreshToken } });
    } catch {
      res.status(401).json({ success: false, error: 'Authentication failed' });
    }
  };
}

/**
 * POST /logout
 */
export function handleLogout(refreshTokensRepo) {
  return (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) refreshTokensRepo.deleteByToken(refreshToken);
    res.json({ success: true });
  };
}

/**
 * POST /connect-meta-token
 */
export function handleConnectMetaToken(settingsRepo) {
  return async (req, res) => {
    const { access_token, account_name } = req.body;
    if (!access_token) return res.status(400).json({ success: false, error: 'access_token is required' });
    if (!settingsRepo) return res.status(500).json({ success: false, error: 'Settings repository not available' });

    try {
      const meRes = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/me?access_token=${encodeURIComponent(access_token)}&fields=id,name`);
      const meData = await meRes.json();
      if (meData.error) return res.status(400).json({ success: false, error: `Invalid token: ${meData.error.message}` });

      const userName = account_name || meData.name || 'Meta Account';
      let adAccounts = [];
      try {
        const accRes = await fetch(`https://graph.facebook.com/${config.metaApiVersion}/me/adaccounts?access_token=${encodeURIComponent(access_token)}&fields=name,account_id,account_status,currency&limit=50`);
        const accData = await accRes.json();
        if (accData.data) {
          adAccounts = accData.data.filter(a => a.account_status === 1).map(a => ({
            id: `act_${a.account_id}`, name: a.name, account_id: a.account_id, currency: a.currency, status: 'active'
          }));
        }
      } catch (e) {
        log.info('Ad account detection skipped', { error: e.message });
      }

      const existingAccounts = settingsRepo.getAccounts('meta');
      const existing = existingAccounts.find(a => a.account_name === userName || (a.credentials?.access_token === access_token));

      let mainId;
      if (existing) {
        settingsRepo.updateAccount(existing.id, { credentials: { access_token, user_name: meData.name, user_id: meData.id } });
        mainId = existing.id;
      } else {
        const id = uuid();
        settingsRepo.addAccount({ id, user_id: 'admin', platform: 'meta', account_name: userName, credentials: { access_token, user_name: meData.name, user_id: meData.id }, is_active: existingAccounts.length === 0 ? 1 : 0 });
        mainId = id;
      }

      let connectedCount = 0;
      for (const adAcc of adAccounts) {
        const adExisting = existingAccounts.find(a => a.account_name === adAcc.id);
        if (!adExisting) {
          settingsRepo.addAccount({ id: uuid(), user_id: 'admin', platform: 'meta', account_name: adAcc.id, credentials: { access_token, ad_account_id: adAcc.account_id, ad_account_name: adAcc.name }, is_active: 0 });
          connectedCount++;
        }
      }

      res.json({ success: true, message: `Connected as ${meData.name}! Found ${adAccounts.length} ad accounts, ${connectedCount} new connected.`, data: { id: mainId, user_name: meData.name, user_id: meData.id, ad_accounts_count: adAccounts.length, new_connected: connectedCount, ad_accounts: adAccounts } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
