import { Router } from 'express';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ads-library-ai');

const GRAPHQL_ENDPOINT = 'https://www.facebook.com/api/graphql/';
const SEARCH_DOC_ID = '29650582277919185';
const SEARCH_FRIENDLY_NAME = 'AdLibraryFilterContextProviderQuery';
const COOKIES_KEY = 'ads_library_ai_cookies';
const DEFAULT_COUNTRY = 'ID';
const DEFAULT_AD_TYPE = 'ALL';
const DEFAULT_SEARCH_TYPE = 'KEYWORD_UNORDERED';

function resolveCookies(settingsRepo) {
  const fromDb = settingsRepo?.get?.(COOKIES_KEY);
  if (fromDb && typeof fromDb === 'string' && fromDb.trim()) return fromDb;
  return process.env.ADS_LIBRARY_AI_COOKIES || null;
}

export function createAdsLibraryAiRouter(settingsRepo) {
  const router = Router();

  router.get('/status', (_req, res) => {
    const cookies = resolveCookies(settingsRepo);
    res.json({
      success: true,
      data: {
        configured: Boolean(cookies),
        source: settingsRepo?.get?.(COOKIES_KEY) ? 'database' : (process.env.ADS_LIBRARY_AI_COOKIES ? 'env' : 'none'),
        endpoint: GRAPHQL_ENDPOINT,
        docId: SEARCH_DOC_ID,
        defaults: { country: DEFAULT_COUNTRY, adType: DEFAULT_AD_TYPE, searchType: DEFAULT_SEARCH_TYPE },
        note: 'Configure cookies in Settings > Ads Library AI, or set ADS_LIBRARY_AI_COOKIES env var.',
      },
    });
  });

  router.put('/config', (req, res) => {
    const { cookies } = req.body || {};
    if (!settingsRepo) {
      return res.status(500).json({ success: false, error: 'Settings repository not available' });
    }
    if (cookies === undefined) {
      return res.status(400).json({ success: false, error: 'cookies field required' });
    }
    if (typeof cookies !== 'string' || !cookies.trim()) {
      return res.status(400).json({ success: false, error: 'cookies must be a non-empty string' });
    }
    settingsRepo.set(COOKIES_KEY, cookies.trim());
    res.json({ success: true, data: { saved: true } });
  });

  router.delete('/config', (_req, res) => {
    if (!settingsRepo) {
      return res.status(500).json({ success: false, error: 'Settings repository not available' });
    }
    settingsRepo.delete(COOKIES_KEY);
    res.json({ success: true, data: { cleared: true } });
  });

  router.post('/search', async (req, res) => {
    const cookies = resolveCookies(settingsRepo);
    if (!cookies) {
      return res.status(400).json({
        success: false,
        error: 'Cookies not configured. Paste www.facebook.com cookies in Settings > Ads Library AI.',
      });
    }

    const { query, country = DEFAULT_COUNTRY, adType = DEFAULT_AD_TYPE, searchType = DEFAULT_SEARCH_TYPE } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const variables = JSON.stringify({
      adType,
      country,
      searchType,
      location: null,
      queryString: query,
      source: null,
      sessionId,
      viewAllPageId: null,
    });

    const formBody = new URLSearchParams({
      variables,
      doc_id: SEARCH_DOC_ID,
      fb_api_req_friendly_name: SEARCH_FRIENDLY_NAME,
      server_timestamps: 'true',
    });

    try {
      const upstream = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'cookie': cookies,
          'x-fb-friendly-name': SEARCH_FRIENDLY_NAME,
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'origin': 'https://www.facebook.com',
          'referer': `https://www.facebook.com/ads/library/?active_status=active&ad_type=${adType.toLowerCase()}&country=${country}&is_targeted_country=false&media_type=all&q=${encodeURIComponent(query)}&search_type=keyword_unordered`,
        },
        body: formBody.toString(),
        redirect: 'manual',
      });

      if (upstream.status === 302 || upstream.status === 301) {
        return res.status(401).json({
          success: false,
          error: 'Meta session expired. Refresh cookies in Settings > Ads Library AI.',
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
          rawSnippet: text.slice(0, 500),
        });
      }

      res.json({ success: true, data: payload, query, sessionId });
    } catch (err) {
      log.error('Ads Library search failed', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
