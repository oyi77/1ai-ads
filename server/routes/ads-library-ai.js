import { Router } from 'express';
import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';
import { CacheService } from '../services/cache-service.js';

const log = createLogger('ads-library-ai');

const GRAPHQL_ENDPOINT = 'https://www.facebook.com/api/graphql/';
const SEARCH_DOC_ID = '29650582277919185';
const SEARCH_FRIENDLY_NAME = 'AdLibraryFilterContextProviderQuery';
const COOKIES_KEY = 'ads_library_ai_cookies';
const DEFAULT_COUNTRY = 'ID';
const DEFAULT_AD_TYPE = 'ALL';
const DEFAULT_SEARCH_TYPE = 'KEYWORD_UNORDERED';

const CACHE_TTL_MS = 30 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new CacheService({ defaultTTL: CACHE_TTL_MS, maxSize: 500, staleTTL: STALE_TTL_MS });

function cacheKey(query, country, adType, searchType) {
  const norm = `${query.trim().toLowerCase()}|${country}|${adType}|${searchType}`;
  return 'adslib:' + crypto.createHash('sha1').update(norm).digest('hex');
}

function resolveCookies(settingsRepo) {
  const fromDb = settingsRepo?.get?.(COOKIES_KEY);
  if (fromDb && typeof fromDb === 'string' && fromDb.trim()) return fromDb;
  return process.env.ADS_LIBRARY_AI_COOKIES || null;
}

async function fetchFromGraphQL(cookies, { query, country, adType, searchType }) {
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const variables = JSON.stringify({
    adType, country, searchType, location: null,
    queryString: query, source: null, sessionId, viewAllPageId: null,
  });

  const formBody = new URLSearchParams({
    variables, doc_id: SEARCH_DOC_ID,
    fb_api_req_friendly_name: SEARCH_FRIENDLY_NAME, server_timestamps: 'true',
  });

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
    const err = new Error('Meta session expired. Refresh cookies in Settings > Ads Library AI.');
    err.statusCode = 401;
    throw err;
  }

  const text = await upstream.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    const err = new Error('Meta returned non-JSON response. Cookies may be invalid.');
    err.statusCode = 502;
    err.snippet = text.slice(0, 500);
    throw err;
  }

  return payload;
}

async function fetchFromScraper({ query, country, adType }) {
  const url = `https://www.facebook.com/ads/library/?active_status=active&ad_type=${adType.toLowerCase()}&country=${country}&is_targeted_country=false&media_type=all&q=${encodeURIComponent(query)}&search_type=keyword_unordered`;
  try {
    const { createUnifiedAdsLibraryService } = await import('../services/unified-ads-library.js');
    const service = createUnifiedAdsLibraryService();
    const result = await service.search(query, { platform: 'meta', source: 'scrape', country, limit: 50 });
    return { scraper: { url, ...result } };
  } catch (err) {
    log.warn('Scraper fallback failed', { error: err.message });
    return null;
  }
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
        cacheTtlMs: CACHE_TTL_MS,
        staleTtlMs: STALE_TTL_MS,
        note: 'Configure cookies in Settings > Ads Library AI. Falls back to /api/ads-library/search (Puppeteer scraper) if session expired. Results cached 30min fresh, 24h stale.',
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
    cache.clear();
    res.json({ success: true, data: { saved: true, cacheCleared: true } });
  });

  router.delete('/config', (_req, res) => {
    if (!settingsRepo) {
      return res.status(500).json({ success: false, error: 'Settings repository not available' });
    }
    settingsRepo.delete(COOKIES_KEY);
    cache.clear();
    res.json({ success: true, data: { cleared: true, cacheCleared: true } });
  });

  router.post('/search', async (req, res) => {
    const { query, country = DEFAULT_COUNTRY, adType = DEFAULT_AD_TYPE, searchType = DEFAULT_SEARCH_TYPE, forceFresh = false } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const key = cacheKey(query, country, adType, searchType);

    if (!forceFresh) {
      const cached = cache.get(key);
      if (cached && !cached._stale) {
        return res.json({ success: true, data: cached, source: 'cache', cached: true });
      }
    }

    const cookies = resolveCookies(settingsRepo);
    let graphqlSucceeded = false;

    if (cookies) {
      try {
        const payload = await fetchFromGraphQL(cookies, { query, country, adType, searchType });
        const enriched = { ...payload, _cachedAt: Date.now() };
        cache.set(key, enriched, CACHE_TTL_MS);
        graphqlSucceeded = true;
        return res.json({ success: true, data: enriched, source: 'graphql', cached: false });
      } catch (err) {
        log.warn('GraphQL fetch failed, attempting fallback', { error: err.message, status: err.statusCode });
        if (err.statusCode === 401) {
          return res.status(401).json({
            success: false,
            error: err.message,
            fallback: 'scraper',
          });
        }
      }
    }

    const stale = cache.get(key);
    if (stale && stale._cachedAt && Date.now() - stale._cachedAt < STALE_TTL_MS) {
      return res.json({
        success: true,
        data: { ...stale, _stale: true },
        source: 'stale-cache',
        cached: true,
        stale: true,
        notice: 'Returning cached data — Meta session expired or unavailable.',
      });
    }

    const scraperResult = await fetchFromScraper({ query, country, adType });
    if (scraperResult) {
      return res.json({ success: true, data: scraperResult, source: 'scraper-fallback', cached: false });
    }

    if (!graphqlSucceeded && !cookies) {
      return res.status(400).json({
        success: false,
        error: 'No cookies configured and scraper fallback unavailable. Configure cookies in Settings > Ads Library AI, or ensure Puppeteer dependencies are installed for the scraper fallback.',
      });
    }

    res.status(500).json({ success: false, error: 'All search paths failed. Try again later.' });
  });

  router.delete('/cache', (_req, res) => {
    cache.clear();
    res.json({ success: true, data: { cleared: true } });
  });

  return router;
}
