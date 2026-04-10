import { Router } from 'express';
import crypto from 'crypto';
import config from '../config/index.js';

export function createAdspirerRouter(adspirerClient, platformAccountsRepo, settingsRepo) {
  const router = Router();

  const AUTH_URL = 'https://mcp.adspirer.com/oauth/authorize';
  const TOKEN_URL = 'https://mcp.adspirer.com/oauth/token';

  // In-memory PKCE state store (keyed by state param)
  const pkceStore = new Map();

  // Guard: block all routes (except status/disconnect) when explicitly disabled
  router.use((req, res, next) => {
    if (req.path === '/status' || req.path === '/disconnect') return next();
    const raw = settingsRepo.get('integration_adspirer_enabled');
    // Only block when explicitly set to false/0 — null/undefined means "not configured yet" → allow
    if (raw === false || raw === 'false' || raw === 0) {
      return res.status(403).json({ success: false, error: 'Adspirer integration is disabled. Enable it in Settings > Integrations.' });
    }
    next();
  });

  // GET /status — check if connected (always available, includes enabled flag)
  router.get('/status', (req, res) => {
    const raw = settingsRepo.get('integration_adspirer_enabled');
    // null/undefined = not configured yet, treat as enabled
    const enabled = raw === null || raw === undefined ? true : (raw === true || raw === 'true' || raw === 1);
    try {
      const account = platformAccountsRepo.findActiveByUserAndPlatform(req.user.id, 'adspirer');
      if (!account) return res.json({ success: true, data: { connected: false, enabled } });
      res.json({ success: true, data: { connected: true, enabled } });
    } catch (err) {
      res.json({ success: true, data: { connected: false, enabled, error: err.message } });
    }
  });

  // GET /auth — initiate OAuth 2.1 PKCE flow
  router.get('/auth', (req, res) => {
    const state = crypto.randomBytes(16).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    pkceStore.set(state, { verifier, userId: req.user.id, at: Date.now() });
    setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.adspirerClientId,
      redirect_uri: config.adspirerRedirectUri,
      scope: 'ads:read ads:write',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    res.redirect(`${AUTH_URL}?${params}`);
  });

  // GET /auth/callback — receive code, exchange for tokens
  router.get('/auth/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) return res.redirect(`/settings#adspirer-error=${encodeURIComponent(error)}`);

    const pkce = pkceStore.get(state);
    if (!pkce) return res.status(400).json({ success: false, error: 'Invalid or expired state' });
    pkceStore.delete(state);

    try {
      const resp = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.adspirerRedirectUri,
          client_id: config.adspirerClientId,
          code_verifier: pkce.verifier,
        }),
      });
      if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);
      const tokens = await resp.json();

      const credentials = JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      });

      const existing = platformAccountsRepo.findActiveByUserAndPlatform(pkce.userId, 'adspirer');
      if (existing) {
        platformAccountsRepo.update(existing.id, { credentials, health_status: 'ok', last_error: null });
      } else {
        platformAccountsRepo.create({
          user_id: pkce.userId,
          platform: 'adspirer',
          account_name: 'Adspirer',
          credentials,
        });
      }

      res.redirect('/settings#adspirer-connected');
    } catch (err) {
      res.redirect(`/settings#adspirer-error=${encodeURIComponent(err.message)}`);
    }
  });

  // POST /tools/:toolName — proxy tool call
  router.post('/tools/:toolName', async (req, res) => {
    try {
      const result = await adspirerClient.callTool(req.user.id, req.params.toolName, req.body || {});
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message?.includes('not connected') ? 401 : 500;
      res.status(status).json({ success: false, error: err.message });
    }
  });

  // GET /tools — list available tools
  router.get('/tools', async (req, res) => {
    try {
      const tools = await adspirerClient.listTools(req.user.id);
      res.json({ success: true, data: tools });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /disconnect
  router.post('/disconnect', async (req, res) => {
    try {
      await adspirerClient.disconnect(req.user.id);
      const account = platformAccountsRepo.findActiveByUserAndPlatform(req.user.id, 'adspirer');
      if (account) platformAccountsRepo.remove(account.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
