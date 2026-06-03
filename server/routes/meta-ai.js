import { Router } from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('meta-ai');

const MAIBA_ENDPOINT = 'https://adsmanager.facebook.com/api/graphql/';
const MAIBA_DOC_ID = '26667472482923907';
const MAIBA_FRIENDLY_NAME = 'MAIBAGraphQLSendMessageV2QueryMutation';
const COOKIES_KEY = 'meta_ai_cookies';
const ACCOUNT_KEY = 'meta_ai_ad_account_id';

function resolveCookies(settingsRepo) {
  const fromDb = settingsRepo?.get?.(COOKIES_KEY);
  if (fromDb && typeof fromDb === 'string' && fromDb.trim()) return fromDb;
  return process.env.META_AI_COOKIES || null;
}

function resolveAdAccountId(settingsRepo, bodyValue) {
  if (bodyValue) return bodyValue;
  const fromDb = settingsRepo?.get?.(ACCOUNT_KEY);
  if (fromDb && typeof fromDb === 'string' && fromDb.trim()) return fromDb;
  return null;
}

export function createMetaAiRouter(settingsRepo) {
  const router = Router();

  router.get('/status', (_req, res) => {
    const cookies = resolveCookies(settingsRepo);
    res.json({
      success: true,
      data: {
        configured: Boolean(cookies),
        source: settingsRepo?.get?.(COOKIES_KEY) ? 'database' : (process.env.META_AI_COOKIES ? 'env' : 'none'),
        endpoint: MAIBA_ENDPOINT,
        docId: MAIBA_DOC_ID,
        adAccountId: settingsRepo?.get?.(ACCOUNT_KEY) || null,
        note: 'Configure cookies in Settings > Meta AI, or set META_AI_COOKIES env var.',
      },
    });
  });

  router.put('/config', (req, res) => {
    const { cookies, adAccountId } = req.body || {};
    if (!settingsRepo) {
      return res.status(500).json({ success: false, error: 'Settings repository not available' });
    }
    if (cookies !== undefined) {
      if (typeof cookies !== 'string' || !cookies.trim()) {
        return res.status(400).json({ success: false, error: 'cookies must be a non-empty string' });
      }
      settingsRepo.set(COOKIES_KEY, cookies.trim());
    }
    if (adAccountId !== undefined) {
      if (typeof adAccountId !== 'string' || !adAccountId.trim()) {
        return res.status(400).json({ success: false, error: 'adAccountId must be a non-empty string' });
      }
      settingsRepo.set(ACCOUNT_KEY, adAccountId.trim());
    }
    res.json({ success: true, data: { saved: true } });
  });

  router.delete('/config', (_req, res) => {
    if (!settingsRepo) {
      return res.status(500).json({ success: false, error: 'Settings repository not available' });
    }
    settingsRepo.delete(COOKIES_KEY);
    settingsRepo.delete(ACCOUNT_KEY);
    res.json({ success: true, data: { cleared: true } });
  });

  router.post('/chat', async (req, res) => {
    const cookies = resolveCookies(settingsRepo);
    if (!cookies) {
      return res.status(400).json({
        success: false,
        error: 'META_AI_COOKIES not configured. Paste your adsmanager.facebook.com cookies in Settings > Meta AI.',
      });
    }

    const { message, adAccountId, conversationId, offlineThreadingId } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    const finalAdAccountId = resolveAdAccountId(settingsRepo, adAccountId);
    if (!finalAdAccountId) {
      return res.status(400).json({ success: false, error: 'adAccountId is required (or set default in Settings > Meta AI)' });
    }

    const variables = JSON.stringify({
      message: { sensitive_string_value: message },
      isNewConversation: !conversationId,
      externalConversationId: conversationId || String(Date.now()),
      offlineThreadingId: offlineThreadingId || String(Date.now()),
      clientContext: { ad_account_id: finalAdAccountId, fb_account_id: null, context: { ad_spec: [] } },
    });

    const formBody = new URLSearchParams({
      variables,
      doc_id: MAIBA_DOC_ID,
      fb_api_req_friendly_name: MAIBA_FRIENDLY_NAME,
      server_timestamps: 'true',
    });

    try {
      const upstream = await fetch(MAIBA_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'cookie': cookies,
          'x-fb-friendly-name': MAIBA_FRIENDLY_NAME,
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        },
        body: formBody.toString(),
        redirect: 'manual',
      });

      if (upstream.status === 302 || upstream.status === 301) {
        return res.status(401).json({
          success: false,
          error: 'Meta session expired. Refresh cookies in Settings > Meta AI.',
        });
      }

      const text = await upstream.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        return res.status(502).json({
          success: false,
          error: 'Meta returned non-JSON response. Cookies may be invalid.',
          rawSnippet: text.slice(0, 200),
        });
      }

      res.json({ success: true, data: payload });
    } catch (err) {
      log.error('Meta AI chat failed', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
