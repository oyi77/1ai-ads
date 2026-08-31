import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import crypto from 'crypto';
import { createLogger } from '../lib/logger.js';
import { CacheService } from '../services/cache-service.js';
import config from '../config/index.js';

const log = createLogger('ads-library-ai');

const GRAPHQL_ENDPOINT = config.adsLibraryAi.endpoint;
const SEARCH_DOC_ID = config.adsLibraryAi.docId;
const SEARCH_FRIENDLY_NAME = 'AdLibraryFilterContextProviderQuery';
const COOKIES_KEY = 'ads_library_ai_cookies';
const DEFAULT_COUNTRY = 'ID';
const DEFAULT_AD_TYPE = 'ALL';
const DEFAULT_SEARCH_TYPE = 'KEYWORD_UNORDERED';

const CACHE_TTL_MS = 30 * 60 * 1000;
const STALE_TTL_MS = 24 * 60 * 60 * 1000;
const PERSISTENT_KEY_PREFIX = 'adslib_cache:';
const MAX_PERSISTENT_ENTRIES = 2000;

const memoryCache = new CacheService({ defaultTTL: CACHE_TTL_MS, maxSize: 500, staleTTL: STALE_TTL_MS });
const inFlight = new Map();
const stats = { freshHits: 0, staleHits: 0, misses: 0, graphqlSuccess: 0, graphqlFail: 0, scraperSuccess: 0, scraperFail: 0, lastSuccessAt: null, lastFailAt: null, lastFailReason: null };

function cacheKey(query, country, adType, searchType) {
  const norm = `${query.trim().toLowerCase()}|${country}|${adType}|${searchType}`;
  return 'adslib:' + crypto.createHash('sha1').update(norm).digest('hex');
}

function persistentKey(sha1) {
  return PERSISTENT_KEY_PREFIX + sha1;
}

function resolveCookies(settingsRepo) {
  const fromDb = settingsRepo?.get?.(COOKIES_KEY);
  if (fromDb && typeof fromDb === 'string' && fromDb.trim()) return fromDb;
  return config.adsLibraryAiCookies;
}

function savePersistent(settingsRepo, key, value) {
  if (!settingsRepo) return;
  prunePersistent(settingsRepo);
  settingsRepo.set(persistentKey(key), value);
}

function loadPersistent(settingsRepo, key) {
  if (!settingsRepo) return null;
  return settingsRepo.get(persistentKey(key));
}

function prunePersistent(settingsRepo) {
  if (!settingsRepo) return;
  const all = settingsRepo.getAll?.() || {};
  const entries = [];
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(PERSISTENT_KEY_PREFIX)) continue;
    const ts = v?._cachedAt || 0;
    if (Date.now() - ts > STALE_TTL_MS) {
      settingsRepo.delete(k);
    } else {
      entries.push({ k, ts });
    }
  }
  if (entries.length > MAX_PERSISTENT_ENTRIES) {
    entries.sort((a, b) => a.ts - b.ts);
    const toRemove = entries.slice(0, entries.length - MAX_PERSISTENT_ENTRIES);
    for (const e of toRemove) settingsRepo.delete(e.k);
  }
}

function lookupCache(settingsRepo, key) {
  const mem = memoryCache.get(key);
  if (mem && !mem._stale) return { value: mem, source: 'memory-fresh' };
  const persistent = loadPersistent(settingsRepo, key);
  if (!persistent) return { value: null, source: null };
  const age = Date.now() - (persistent._cachedAt || 0);
  if (age < CACHE_TTL_MS) return { value: persistent, source: 'persistent-fresh' };
  if (age < STALE_TTL_MS) return { value: { ...persistent, _stale: true }, source: 'persistent-stale' };
  return { value: null, source: null };
}

function storeCache(settingsRepo, key, payload) {
  const enriched = { ...payload, _cachedAt: Date.now() };
  memoryCache.set(key, enriched, CACHE_TTL_MS);
  savePersistent(settingsRepo, key, enriched);
  return enriched;
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

async function withDedup(key, factory) {
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }
  const p = factory().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export function createAdsLibraryAiRouter(settingsRepo) {
  const router = Router();

  router.get('/status', (_req, res) => {
    const cookies = resolveCookies(settingsRepo);
    res.json({
      success: true,
      data: {
        configured: Boolean(cookies),
        source: settingsRepo?.get?.(COOKIES_KEY) ? 'database' : (config.adsLibraryAiCookies ? 'env' : 'none'),
        endpoint: GRAPHQL_ENDPOINT,
        docId: SEARCH_DOC_ID,
        defaults: { country: DEFAULT_COUNTRY, adType: DEFAULT_AD_TYPE, searchType: DEFAULT_SEARCH_TYPE },
        cacheTtlMs: CACHE_TTL_MS,
        staleTtlMs: STALE_TTL_MS,
        note: 'Configure cookies in Settings > Ads Library AI. Falls back to /api/ads-library/search (Puppeteer scraper) if session expired. Results cached 30min fresh (memory+persistent), 24h stale.',
      },
    });
  });

  router.get('/health', async (_req, res) => {
    const _cookies = resolveCookies(settingsRepo);
    const persistentCount = settingsRepo
      ? Object.keys(settingsRepo.getAll?.() || {}).filter(k => k.startsWith(PERSISTENT_KEY_PREFIX)).length
      : 0;
    res.json({
      success: true,
      data: {
        cookiesValid: stats.graphqlSuccess > 0 && (Date.now() - (stats.lastSuccessAt || 0)) < 60 * 60 * 1000,
        lastSuccessAt: stats.lastSuccessAt,
        lastFailAt: stats.lastFailAt,
        lastFailReason: stats.lastFailReason,
        cacheSize: persistentCount,
        inFlight: inFlight.size,
        stats: {
          freshHits: stats.freshHits,
          staleHits: stats.staleHits,
          misses: stats.misses,
          graphqlSuccess: stats.graphqlSuccess,
          graphqlFail: stats.graphqlFail,
          scraperSuccess: stats.scraperSuccess,
          scraperFail: stats.scraperFail,
        },
      },
    });
  });

  router.put('/config', requireAuth, async (req, res) => {
    const { cookies, test = true } = req.body || {};
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
    memoryCache.clear();
    prunePersistent(settingsRepo);

    if (test) {
      try {
        await fetchFromGraphQL(cookies.trim(), { query: '__healthcheck__', country: DEFAULT_COUNTRY, adType: DEFAULT_AD_TYPE, searchType: DEFAULT_SEARCH_TYPE });
        stats.graphqlSuccess++;
        stats.lastSuccessAt = Date.now();
        return res.json({ success: true, data: { saved: true, cacheCleared: true, cookieTest: 'ok' } });
      } catch (err) {
        stats.graphqlFail++;
        stats.lastFailAt = Date.now();
        stats.lastFailReason = err.message;
        return res.json({
          success: true,
          data: { saved: true, cacheCleared: true, cookieTest: 'failed', cookieTestError: err.message },
        });
      }
    }

    res.json({ success: true, data: { saved: true, cacheCleared: true, cookieTest: 'skipped' } });
  });

  router.delete('/config', requireAuth, (_req, res) => {
    if (!settingsRepo) {
      return res.status(500).json({ success: false, error: 'Settings repository not available' });
    }
    settingsRepo.delete(COOKIES_KEY);
    memoryCache.clear();
    res.json({ success: true, data: { cleared: true, cacheCleared: true } });
  });

  router.post('/search', async (req, res) => {
    const { query, country = DEFAULT_COUNTRY, adType = DEFAULT_AD_TYPE, searchType = DEFAULT_SEARCH_TYPE, forceFresh = false } = req.body || {};
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const key = cacheKey(query, country, adType, searchType);

    if (!forceFresh) {
      const { value, source } = lookupCache(settingsRepo, key);
      if (value) {
        if (source.endsWith('-fresh')) stats.freshHits++;
        else if (source.endsWith('-stale')) stats.staleHits++;
        return res.json({
          success: true,
          data: value,
          source: source.startsWith('memory') ? 'cache' : source.split('-')[0],
          cached: true,
          stale: !!value._stale,
        });
      }
    }

    stats.misses++;

    try {
      const result = await withDedup(key, async () => {
        const cookies = resolveCookies(settingsRepo);
        if (cookies) {
          try {
            const payload = await fetchFromGraphQL(cookies, { query, country, adType, searchType });
            stats.graphqlSuccess++;
            stats.lastSuccessAt = Date.now();
            return { payload, source: 'graphql' };
          } catch (err) {
            stats.graphqlFail++;
            stats.lastFailAt = Date.now();
            stats.lastFailReason = err.message;
            log.warn('GraphQL fetch failed', { error: err.message, status: err.statusCode });
            if (err.statusCode === 401) {
              const err2 = new Error(err.message);
              err2.statusCode = 401;
              err2.fallback = 'scraper';
              throw err2;
            }
          }
        }
        return { payload: null, source: null };
      });

      if (result?.payload) {
        const stored = storeCache(settingsRepo, key, result.payload);
        return res.json({ success: true, data: stored, source: result.source, cached: false });
      }
    } catch (err) {
      if (err.statusCode === 401) {
        return res.status(401).json({ success: false, error: err.message, fallback: err.fallback });
      }
    }

    const { value: stale } = lookupCache(settingsRepo, key);
    if (stale && stale._cachedAt && Date.now() - stale._cachedAt < STALE_TTL_MS) {
      stats.staleHits++;
      return res.json({
        success: true,
        data: stale,
        source: 'stale-cache',
        cached: true,
        stale: true,
        notice: 'Returning cached data — Meta session expired or unavailable.',
      });
    }

    const scraperResult = await fetchFromScraper({ query, country, adType });
    if (scraperResult) {
      stats.scraperSuccess++;
      return res.json({ success: true, data: scraperResult, source: 'scraper-fallback', cached: false });
    }
    stats.scraperFail++;

    if (!resolveCookies(settingsRepo)) {
      return res.status(400).json({
        success: false,
        error: 'No cookies configured and scraper fallback unavailable. Configure cookies in Settings > Ads Library AI, or ensure Puppeteer dependencies are installed.',
      });
    }

    res.status(500).json({ success: false, error: 'All search paths failed. Try again later.' });
  });

  router.delete('/cache', requireAuth, (_req, res) => {
    memoryCache.clear();
    if (settingsRepo) {
      const all = settingsRepo.getAll?.() || {};
      let removed = 0;
      for (const k of Object.keys(all)) {
        if (k.startsWith(PERSISTENT_KEY_PREFIX)) {
          settingsRepo.delete(k);
          removed++;
        }
      }
      return res.json({ success: true, data: { cleared: true, memoryCleared: true, persistentRemoved: removed } });
    }
    res.json({ success: true, data: { cleared: true, memoryCleared: true, persistentRemoved: 0 } });
  });

  return router;
}
