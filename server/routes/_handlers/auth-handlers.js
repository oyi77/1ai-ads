/**
 * Auth Handlers — Extracted from auth.js god function.
 * Each handler is a pure function that takes deps and returns a middleware.
 */

import { hashPassword, verifyPassword, generateToken, generateRefreshToken, verifyToken } from '../../lib/auth.js';
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '../../lib/auth-cookies.js';
import { createLogger } from '../../lib/logger.js';
import config from '../../config/index.js';
import {
  sendVerificationEmail, sendPasswordResetEmail,
  generateToken as generateEmailToken, hashToken, mailerEnabled,
} from '../../lib/mailer.js';
import crypto from 'crypto';
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

      // Email verification enforced only when a mail provider is configured;
      // otherwise accounts start confirmed (dev/test/legacy parity).
      const needsVerification = mailerEnabled();
      const userId = usersRepo.create({ username, email, password_hash: hashPassword(password), confirmed: needsVerification ? 0 : 1 });

      let verificationSent = false;
      if (needsVerification) {
        const token = generateEmailToken();
        usersRepo.setEmailVerificationToken(userId, {
          hash: hashToken(token),
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        });
        verificationSent = await sendVerificationEmail(email, username, token);
      }

      const accessToken = generateToken({ id: userId, username, role: 'user', plan: 'free' });
      const refreshToken = generateRefreshToken({ id: userId, username });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(userId, refreshToken, expiresAt.toISOString());
      setAuthCookies(res, accessToken, refreshToken);

      res.json({ success: true, data: { user: { id: userId, username, email, role: 'user', plan: 'free', email_verified: !needsVerification }, accessToken, refreshToken, verificationSent } });
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

      if (user.is_active === 0) {
        return res.status(401).json({ success: false, error: 'Account disabled' });
      }

      if (user.confirmed === 0 && user.email_verification_hash) {
        return res.status(403).json({ success: false, error: 'Please verify your email before signing in. Check your inbox for the verification link.', code: 'EMAIL_NOT_VERIFIED' });
      }
      refreshTokensRepo.deleteByUserId(user.id);
      const accessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const refreshToken = generateRefreshToken({ id: user.id, username: user.username });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, refreshToken, expiresAt.toISOString());
      setAuthCookies(res, accessToken, refreshToken);

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
      // Accept the refresh token from the httpOnly cookie (SPA) or body (API clients)
      const refreshToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
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
      if (user.is_active === 0) {
        refreshTokensRepo.deleteByToken(refreshToken);
        return res.status(401).json({ success: false, error: 'Account disabled' });
      }
      const newAccessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });

      const newRefreshToken = generateRefreshToken({ id: user.id, username: user.username });
      refreshTokensRepo.deleteByToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, newRefreshToken, expiresAt.toISOString());
      setAuthCookies(res, newAccessToken, newRefreshToken);

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
    // Revoke whichever refresh token we can see (cookie or body), then clear cookies.
    const refreshToken = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    if (refreshToken) refreshTokensRepo.deleteByToken(refreshToken);
    clearAuthCookies(res);
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

    const userId = req.user.id;
      const existingAccounts = settingsRepo.getAccounts('meta').filter(a => a.user_id === userId);
      const existing = existingAccounts.find(a => a.account_name === userName || (a.credentials?.access_token === access_token));

      let mainId;
      if (existing) {
        settingsRepo.updateAccount(existing.id, { credentials: { access_token, user_name: meData.name, user_id: meData.id } });
        mainId = existing.id;
      } else {
        const id = uuid();
        settingsRepo.addAccount({ id, user_id: userId, platform: 'meta', account_name: userName, credentials: { access_token, user_name: meData.name, user_id: meData.id }, is_active: existingAccounts.length === 0 ? 1 : 0 });
        mainId = id;
      }

      let connectedCount = 0;
      for (const adAcc of adAccounts) {
        const adExisting = existingAccounts.find(a => a.account_name === adAcc.id);
        if (!adExisting) {
          settingsRepo.addAccount({ id: uuid(), user_id: userId, platform: 'meta', account_name: adAcc.id, credentials: { access_token, ad_account_id: adAcc.account_id, ad_account_name: adAcc.name }, is_active: 0 });
          connectedCount++;
        }
      }

      res.json({ success: true, message: `Connected as ${meData.name}! Found ${adAccounts.length} ad accounts, ${connectedCount} new connected.`, data: { id: mainId, user_name: meData.name, user_id: meData.id, ad_accounts_count: adAccounts.length, new_connected: connectedCount, ad_accounts: adAccounts } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

/**
 * POST /verify-email — confirm an email verification token.
 */
export function handleVerifyEmail(usersRepo) {
  return async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, error: 'token is required' });
      const user = usersRepo.findByVerificationTokenHash(hashToken(token));
      if (!user || !user.email_verification_expires || new Date(user.email_verification_expires) < new Date()) {
        return res.status(400).json({ success: false, error: 'Invalid or expired verification link' });
      }
      usersRepo.markEmailVerified(user.id);
      res.json({ success: true, data: { username: user.username } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

/**
 * POST /resend-verification — re-send the verification email for an unverified account.
 */
export function handleResendVerification(usersRepo) {
  return async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ success: false, error: 'email is required' });
      const user = usersRepo.findByEmail(email);
      // Anti-enumeration: same response whether or not the account exists.
      if (!user || user.confirmed === 1 || !mailerEnabled()) {
        return res.json({ success: true, message: 'If the account exists and is unverified, a new verification email has been sent.' });
      }
      const token = generateEmailToken();
      usersRepo.setEmailVerificationToken(user.id, {
        hash: hashToken(token),
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });
      await sendVerificationEmail(user.email, user.username, token);
      res.json({ success: true, message: 'If the account exists and is unverified, a new verification email has been sent.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

/**
 * POST /forgot-password — issue a password reset link (anti-enumeration response).
 */
export function handleForgotPassword(usersRepo) {
  return async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ success: false, error: 'email is required' });
      const user = usersRepo.findByEmail(email);
      if (user && mailerEnabled()) {
        const token = generateEmailToken();
        usersRepo.setPasswordResetToken(user.id, {
          hash: hashToken(token),
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
        await sendPasswordResetEmail(user.email, user.username, token);
      }
      res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

/**
 * POST /reset-password — consume a reset token and set a new password.
 */
export function handleResetPassword(usersRepo, refreshTokensRepo) {
  return async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) return res.status(400).json({ success: false, error: 'token and password are required' });
      if (String(password).length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });

      const user = usersRepo.findByPasswordResetTokenHash(hashToken(token));
      if (!user || !user.password_reset_expires || new Date(user.password_reset_expires) < new Date()) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset link' });
      }

      usersRepo.update(user.id, { password_hash: hashPassword(String(password)) });
      usersRepo.clearPasswordResetToken(user.id);
      refreshTokensRepo.deleteByUserId(user.id); // revoke existing sessions
      log.info('Password reset completed', { userId: user.id });
      res.json({ success: true, message: 'Password updated. Sign in with your new password.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

/**
 * POST /telegram-webapp — Telegram Mini App single sign-on.
 * Validates initData per the Telegram spec (HMAC-SHA256 keyed with
 * HMAC("WebAppData", botToken)), then mints a JWT for the linked local user.
 */
export function handleTelegramWebapp(usersRepo, refreshTokensRepo, botToken) {
  return async (req, res) => {
    try {
      const { initData } = req.body || {};
      if (!initData || !botToken) {
        return res.status(400).json({ success: false, error: 'initData is required' });
      }

      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      if (!hash) return res.status(401).json({ success: false, error: 'Missing hash' });

      // data_check_string: every field except hash, sorted alphabetically
      const pairs = [...params.entries()]
        .filter(([k]) => k !== 'hash')
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`);
      const dataCheckString = pairs.join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      const valid =
        computed.length === hash.length &&
        crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
      if (!valid) {
        return res.status(401).json({ success: false, error: 'Invalid initData signature' });
      }

      // Auth date freshness — reject replays older than 24h
      const authDate = parseInt(params.get('auth_date') || '0', 10) * 1000;
      if (!authDate || Date.now() - authDate > 24 * 3600 * 1000) {
        return res.status(401).json({ success: false, error: 'initData expired' });
      }

      let tgUser;
      try {
        tgUser = JSON.parse(params.get('user') || '{}');
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid user payload' });
      }
      const tgId = String(tgUser.id || '');
      if (!tgId) return res.status(400).json({ success: false, error: 'Missing user id' });

      let user = usersRepo.findByTelegramId(tgId);
      if (!user) {
        // First Mini App contact — same auto-bind contract as the bot identify middleware
        const username = `tg_${tgId}`;
        const id = usersRepo.create({
          username,
          email: `${username}@telegram.local`,
          password_hash: hashPassword(generateEmailToken()),
          confirmed: 1,
          telegram_id: tgId,
        });
        user = usersRepo.findById(id);
        log.info({ telegramId: tgId }, 'auto-created telegram customer via mini app');
      }
      if (user.is_active === 0) {
        return res.status(403).json({ success: false, error: 'Account disabled' });
      }

      const accessToken = generateToken({ id: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' });
      const refreshToken = generateRefreshToken({ id: user.id, username: user.username });
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      refreshTokensRepo.upsert(user.id, refreshToken, expiresAt.toISOString());

      res.json({
        success: true,
        data: { user: { id: user.id, username: user.username, email: user.email, role: user.role || 'user', plan: user.plan || 'free' }, accessToken, refreshToken },
      });
    } catch (err) {
      log.error('telegram webapp login failed', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  };
}
