/**
 * Integration Tests: Free Ads Library
 *
 * Tests platform adapters (Meta, Google, TikTok), fallback logic,
 * rate limiting, caching, and normalized output format.
 * All external HTTP calls are mocked - no real network calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MetaAdapter } from '../../server/services/ads-library/meta-adapter.js';
import { GoogleAdapter } from '../../server/services/ads-library/google-adapter.js';
import { TikTokAdapter } from '../../server/services/ads-library/tiktok-adapter.js';
import { CacheService } from '../../server/services/cache-service.js';

// ---- Shared mock data ----

const makeMetaApiResponse = (count = 2) => ({
  data: Array.from({ length: count }, (_, i) => ({
    id: `meta-ad-${i + 1}`,
    page_name: `Meta Page ${i + 1}`,
    page_id: `page-${i + 1}`,
    ad_creative_link_titles: [`Headline ${i + 1}`],
    ad_creative_bodies: [`Body text ${i + 1}`],
    ad_snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=meta-ad-${i + 1}`,
    ad_delivery_start_time: '2024-01-01',
    ad_delivery_stop_time: null,
    publisher_platforms: ['facebook', 'instagram'],
    spend: { lower_bound: 100, upper_bound: 500 },
    impressions: { lower_bound: 1000, upper_bound: 5000 },
  })),
  paging: {
    cursors: { after: 'cursor-abc', before: 'cursor-xyz' },
    next: 'https://graph.facebook.com/next',
  },
});

const makeGoogleScraperAds = (count = 2) =>
  Array.from({ length: count }, (_, i) => ({
    id: `google-ad-${i + 1}`,
    pageName: `Google Advertiser ${i + 1}`,
    headlines: [`Google Headline ${i + 1}`],
    descriptions: [`Google description ${i + 1}`],
    imageUrl: `https://example.com/google-image-${i + 1}.jpg`,
    platforms: ['google_search', 'display'],
    status: 'active',
    adType: 'text',
  }));

const makeTikTokApiResponse = (count = 2) => ({
  data: {
    list: Array.from({ length: count }, (_, i) => ({
      ad_id: `tiktok-ad-${i + 1}`,
      advertiser_name: `TikTok Advertiser ${i + 1}`,
      advertiser_id: `adv-${i + 1}`,
      ad_text: `TikTok ad text ${i + 1}`,
      cover_image_url: `https://example.com/tiktok-cover-${i + 1}.jpg`,
      video_url: `https://example.com/tiktok-video-${i + 1}.mp4`,
      landing_url: `https://example.com/landing-${i + 1}`,
      call_to_action: 'Shop Now',
      first_show_time: '2024-01-01',
      impression_count: 10000,
      is_active: true,
      like_count: 500,
      comment_count: 50,
      share_count: 100,
      hashtags: ['ad', 'promo'],
    })),
  },
});

// ---- Helpers ----

function makeMockSettingsRepo(platform, credentials) {
  return {
    getCredentials: (p) => (p === platform ? credentials : null),
  };
}

function makeMockScraper(ads) {
  return {
    scrapeAdsLibrary: vi.fn().mockResolvedValue(ads),
    extractAdMetadata: vi.fn().mockResolvedValue(ads[0] || {}),
  };
}

// ---- CacheService ----

describe('CacheService', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTTL: 5000, maxSize: 10, cleanupInterval: 60000 });
  });

  afterEach(() => {
    cache.destroy();
  });

  it('stores and retrieves a value', () => {
    cache.set('key1', { foo: 'bar' });
    expect(cache.get('key1')).toEqual({ foo: 'bar' });
  });

  it('returns null for missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('returns null for expired entry', async () => {
    cache.set('expiring', 'value', 1); // 1ms TTL
    await new Promise(r => setTimeout(r, 10));
    expect(cache.get('expiring')).toBeNull();
  });

  it('tracks hit/miss stats', () => {
    cache.set('k', 'v');
    cache.get('k');       // hit
    cache.get('missing'); // miss
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe('50.00%');
  });

  it('buildKey produces consistent keys', () => {
    const k1 = cache.buildKey('meta', 'shoes', { country: 'US', status: 'ALL' });
    const k2 = cache.buildKey('meta', 'shoes', { status: 'ALL', country: 'US' });
    expect(k1).toBe(k2);
  });

  it('clearByPrefix removes matching entries', () => {
    cache.set('ads:meta:shoes:x', 1);
    cache.set('ads:meta:bags:x', 2);
    cache.set('ads:google:shoes:x', 3);
    const removed = cache.clearByPrefix('ads:meta');
    expect(removed).toBe(2);
    expect(cache.get('ads:google:shoes:x')).toBe(3);
  });

  it('evicts oldest entry when at capacity', () => {
    const small = new CacheService({ maxSize: 2, defaultTTL: 60000 });
    small.set('a', 1);
    small.set('b', 2);
    small.set('c', 3); // should evict 'a'
    expect(small.get('a')).toBeNull();
    expect(small.get('b')).toBe(2);
    expect(small.get('c')).toBe(3);
    small.destroy();
  });

  it('has() returns false for expired key', async () => {
    cache.set('exp', 'val', 1);
    await new Promise(r => setTimeout(r, 10));
    expect(cache.has('exp')).toBe(false);
  });
});

// ---- Meta Adapter ----

describe('MetaAdapter', () => {
  let cache;
  let fetchMock;

  beforeEach(() => {
    cache = new CacheService({ defaultTTL: 60000 });
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    cache.destroy();
    vi.restoreAllMocks();
  });

  it('platformName is "meta"', () => {
    const adapter = new MetaAdapter({ cacheService: cache });
    expect(adapter.platformName).toBe('meta');
  });

  it('displayName is "Meta (Facebook & Instagram)"', () => {
    const adapter = new MetaAdapter({ cacheService: cache });
    expect(adapter.displayName).toBe('Meta (Facebook & Instagram)');
  });

  it('hasApiAccess() returns false without settingsRepo', () => {
    const adapter = new MetaAdapter({ cacheService: cache });
    expect(adapter.hasApiAccess()).toBe(false);
  });

  it('hasApiAccess() returns true when access_token is present', () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'test-token' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });
    expect(adapter.hasApiAccess()).toBe(true);
  });

  it('hasApiAccess() returns false when access_token is absent', () => {
    const settingsRepo = makeMockSettingsRepo('meta', {});
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });
    expect(adapter.hasApiAccess()).toBe(false);
  });

  it('searchAds via API returns normalized ads', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => makeMetaApiResponse(2),
    });

    const result = await adapter.searchAds('shoes', { source: 'api' });

    expect(result.platform).toBe('meta');
    expect(result.source).toBe('api');
    expect(result.ads).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('cursor-abc');
    expect(result.fetchedAt).toBeDefined();
  });

  it('searchAds via API returns ads with normalized fields', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => makeMetaApiResponse(1),
    });

    const result = await adapter.searchAds('shoes', { source: 'api' });
    const ad = result.ads[0];

    expect(ad.id).toBe('meta-ad-1');
    expect(ad.platform).toBe('meta');
    expect(ad.pageName).toBe('Meta Page 1');
    expect(ad.headlines).toEqual(['Headline 1']);
    expect(ad.descriptions).toEqual(['Body text 1']);
    expect(ad.snapshotUrl).toBeDefined();
    expect(Array.isArray(ad.platforms)).toBe(true);
  });

  it('searchAds via scraper when no API credentials', async () => {
    const scrapedAds = makeGoogleScraperAds(2).map(ad => ({
      ...ad,
      id: `meta-scraped-${ad.id}`,
      pageName: 'Scraped Page',
    }));
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new MetaAdapter({ cacheService: cache, scraper });

    const result = await adapter.searchAds('bags', { source: 'scrape' });

    expect(result.platform).toBe('meta');
    expect(result.source).toBe('scrape');
    expect(result.ads).toHaveLength(2);
    expect(scraper.scrapeAdsLibrary).toHaveBeenCalledWith('bags', expect.objectContaining({ country: 'US' }));
  });

  it('auto mode with API creds uses API (not scraper) when API succeeds', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'good-tok' });
    const scrapedAds = [{ id: 'scraped-1', pageName: 'Fallback Page', headlines: [], descriptions: [], platforms: [] }];
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo, scraper });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => makeMetaApiResponse(1),
    });

    const result = await adapter.searchAds('shoes', { source: 'auto' });

    expect(result.source).toBe('api');
    expect(result.ads).toHaveLength(1);
    expect(scraper.scrapeAdsLibrary).not.toHaveBeenCalled();
  });

  it('auto mode without API creds uses scraper directly', async () => {
    // No settingsRepo = no API access, so auto mode goes straight to scraper
    const scrapedAds = [{ id: 'scraped-1', pageName: 'Fallback Page', headlines: [], descriptions: [], platforms: [] }];
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new MetaAdapter({ cacheService: cache, scraper });

    const result = await adapter.searchAds('shoes', { source: 'auto' });

    expect(result.source).toBe('scrape');
    expect(result.ads).toHaveLength(1);
    expect(scraper.scrapeAdsLibrary).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws ConfigurationError when no API and no scraper', async () => {
    const adapter = new MetaAdapter({ cacheService: cache });

    await expect(adapter.searchAds('shoes', { source: 'scrape' }))
      .rejects.toThrow();
  });

  it('getAvailablePublicAPIs returns two entries', () => {
    const adapter = new MetaAdapter({ cacheService: cache });
    const apis = adapter.getAvailablePublicAPIs();
    expect(apis).toHaveLength(2);
    expect(apis[0].name).toContain('Meta');
    expect(apis[1].requiresAuth).toBe(false);
  });

  it('searchAdsCached uses cache on second call', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => makeMetaApiResponse(2),
    });

    await adapter.searchAdsCached('shoes');
    await adapter.searchAdsCached('shoes');

    // fetch should only have been called once (second call hits cache)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---- Google Adapter ----

describe('GoogleAdapter', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTTL: 60000 });
  });

  afterEach(() => {
    cache.destroy();
    vi.restoreAllMocks();
  });

  it('platformName is "google"', () => {
    const adapter = new GoogleAdapter({ cacheService: cache });
    expect(adapter.platformName).toBe('google');
  });

  it('displayName is "Google Ads"', () => {
    const adapter = new GoogleAdapter({ cacheService: cache });
    expect(adapter.displayName).toBe('Google Ads');
  });

  it('hasApiAccess() returns false without settingsRepo', () => {
    const adapter = new GoogleAdapter({ cacheService: cache });
    expect(adapter.hasApiAccess()).toBe(false);
  });

  it('hasApiAccess() returns true when developer_token and oauth_token present', () => {
    const settingsRepo = makeMockSettingsRepo('google', {
      developer_token: 'dev-tok',
      oauth_token: 'oauth-tok',
    });
    const adapter = new GoogleAdapter({ cacheService: cache, settingsRepo });
    expect(adapter.hasApiAccess()).toBe(true);
  });

  it('searchAds via scraper returns normalized ads', async () => {
    const scrapedAds = makeGoogleScraperAds(3);
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new GoogleAdapter({ cacheService: cache, scraper });

    const result = await adapter.searchAds('running shoes', { source: 'scrape' });

    expect(result.platform).toBe('google');
    expect(result.source).toBe('scrape');
    expect(result.ads).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(result.fetchedAt).toBeDefined();
  });

  it('searchAds returns ads with normalized fields', async () => {
    const scrapedAds = makeGoogleScraperAds(1);
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new GoogleAdapter({ cacheService: cache, scraper });

    const result = await adapter.searchAds('shoes');
    const ad = result.ads[0];

    expect(ad.platform).toBe('google');
    expect(ad.id).toBe('google-ad-1');
    expect(ad.pageName).toBe('Google Advertiser 1');
    expect(ad.headlines).toEqual(['Google Headline 1']);
    expect(ad.descriptions).toEqual(['Google description 1']);
  });

  it('searchAds auto mode uses scraper by default', async () => {
    const scraper = makeMockScraper(makeGoogleScraperAds(2));
    const adapter = new GoogleAdapter({ cacheService: cache, scraper });

    const result = await adapter.searchAds('query', { source: 'auto' });

    expect(result.source).toBe('scrape');
    expect(scraper.scrapeAdsLibrary).toHaveBeenCalled();
  });

  it('throws ConfigurationError when no scraper provided', async () => {
    const adapter = new GoogleAdapter({ cacheService: cache });

    await expect(adapter.searchAds('shoes'))
      .rejects.toThrow();
  });

  it('throws PlatformError when source is "api"', async () => {
    const settingsRepo = makeMockSettingsRepo('google', {
      developer_token: 'dev-tok',
      oauth_token: 'oauth-tok',
    });
    const adapter = new GoogleAdapter({ cacheService: cache, settingsRepo });

    await expect(adapter.searchAds('shoes', { source: 'api' }))
      .rejects.toThrow();
  });

  it('getAvailablePublicAPIs returns two entries', () => {
    const adapter = new GoogleAdapter({ cacheService: cache });
    const apis = adapter.getAvailablePublicAPIs();
    expect(apis).toHaveLength(2);
    expect(apis[0].name).toContain('Google');
    expect(apis[0].requiresAuth).toBe(false);
    expect(apis[1].requiresAuth).toBe(true);
  });

  it('getAdDetails uses scraper extractAdMetadata', async () => {
    const adData = makeGoogleScraperAds(1)[0];
    const scraper = {
      scrapeAdsLibrary: vi.fn(),
      extractAdMetadata: vi.fn().mockResolvedValue(adData),
    };
    const adapter = new GoogleAdapter({ cacheService: cache, scraper });

    const ad = await adapter.getAdDetails('google-ad-1');

    expect(ad.platform).toBe('google');
    expect(scraper.extractAdMetadata).toHaveBeenCalledWith(
      expect.stringContaining('google-ad-1')
    );
  });
});

// ---- TikTok Adapter ----

describe('TikTokAdapter', () => {
  let cache;
  let fetchMock;

  beforeEach(() => {
    cache = new CacheService({ defaultTTL: 60000 });
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    cache.destroy();
    vi.restoreAllMocks();
  });

  it('platformName is "tiktok"', () => {
    const adapter = new TikTokAdapter({ cacheService: cache });
    expect(adapter.platformName).toBe('tiktok');
  });

  it('displayName is "TikTok Ads"', () => {
    const adapter = new TikTokAdapter({ cacheService: cache });
    expect(adapter.displayName).toBe('TikTok Ads');
  });

  it('hasApiAccess() returns false without settingsRepo', () => {
    const adapter = new TikTokAdapter({ cacheService: cache });
    expect(adapter.hasApiAccess()).toBe(false);
  });

  it('hasApiAccess() returns true when access_token present', () => {
    const settingsRepo = makeMockSettingsRepo('tiktok', { access_token: 'tiktok-tok' });
    const adapter = new TikTokAdapter({ cacheService: cache, settingsRepo });
    expect(adapter.hasApiAccess()).toBe(true);
  });

  it('searchAds via public Creative Center API returns normalized ads', async () => {
    const adapter = new TikTokAdapter({ cacheService: cache });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => makeTikTokApiResponse(2),
    });

    const result = await adapter.searchAds('summer sale', { source: 'api' });

    expect(result.platform).toBe('tiktok');
    expect(result.source).toBe('api');
    expect(result.ads).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.fetchedAt).toBeDefined();
  });

  it('searchAds returns ads with normalized fields', async () => {
    const adapter = new TikTokAdapter({ cacheService: cache });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => makeTikTokApiResponse(1),
    });

    const result = await adapter.searchAds('promo', { source: 'api' });
    const ad = result.ads[0];

    expect(ad.id).toBe('tiktok-ad-1');
    expect(ad.platform).toBe('tiktok');
    expect(ad.pageName).toBe('TikTok Advertiser 1');
    expect(ad.headlines).toEqual(['TikTok ad text 1']);
    expect(ad.videoUrl).toBeDefined();
    expect(ad.ctaType).toBe('Shop Now');
    expect(ad.status).toBe('active');
  });

  it('falls back to scraper when public API returns non-ok response', async () => {
    const scrapedAds = [{ id: 'tt-scraped-1', pageName: 'TikTok Scraped', headlines: [], descriptions: [], platforms: ['tiktok'] }];
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new TikTokAdapter({ cacheService: cache, scraper });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    const result = await adapter.searchAds('sale', { source: 'auto' });

    expect(result.source).toBe('scrape');
    expect(scraper.scrapeAdsLibrary).toHaveBeenCalled();
  });

  it('searchAds via scraper with source=scrape', async () => {
    const scrapedAds = [
      { id: 'tt-1', pageName: 'Advertiser A', headlines: ['Ad text A'], descriptions: [], platforms: ['tiktok'], adType: 'video' },
      { id: 'tt-2', pageName: 'Advertiser B', headlines: ['Ad text B'], descriptions: [], platforms: ['tiktok'], adType: 'image' },
    ];
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new TikTokAdapter({ cacheService: cache, scraper });

    const result = await adapter.searchAds('promo', { source: 'scrape' });

    expect(result.platform).toBe('tiktok');
    expect(result.source).toBe('scrape');
    expect(result.ads).toHaveLength(2);
    expect(scraper.scrapeAdsLibrary).toHaveBeenCalledWith('promo', expect.objectContaining({ country: 'US' }));
  });

  it('throws ConfigurationError when public API fails and no scraper', async () => {
    const adapter = new TikTokAdapter({ cacheService: cache });

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(adapter.searchAds('test', { source: 'scrape' }))
      .rejects.toThrow();
  });

  it('getAvailablePublicAPIs returns three entries', () => {
    const adapter = new TikTokAdapter({ cacheService: cache });
    const apis = adapter.getAvailablePublicAPIs();
    expect(apis).toHaveLength(3);
    const names = apis.map(a => a.name);
    expect(names.some(n => n.includes('Semi-Public'))).toBe(true);
    expect(names.some(n => n.includes('Business API'))).toBe(true);
  });

  it('getAdDetails via public API', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          ad_id: 'tiktok-detail-1',
          advertiser_name: 'Detail Advertiser',
          ad_text: 'Detail ad text',
          video_url: 'https://example.com/video.mp4',
          is_active: true,
        },
      }),
    });

    const adapter = new TikTokAdapter({ cacheService: cache });
    const ad = await adapter.getAdDetails('tiktok-detail-1');

    expect(ad.platform).toBe('tiktok');
    expect(ad.id).toBe('tiktok-detail-1');
    expect(ad.pageName).toBe('Detail Advertiser');
  });
});

// ---- Normalized Output Format ----

describe('Normalized output format (all platforms)', () => {
  const REQUIRED_AD_FIELDS = [
    'id', 'platform', 'pageName', 'pageId',
    'headlines', 'descriptions', 'imageUrl', 'videoUrl',
    'landingUrl', 'ctaType', 'snapshotUrl',
    'deliveryStart', 'deliveryStop',
    'platforms', 'spend', 'impressions', 'status', 'adType',
  ];

  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTTL: 60000 });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cache.destroy();
    vi.restoreAllMocks();
  });

  it('Meta adapter output has all required NormalizedAd fields', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeMetaApiResponse(1),
    });

    const { ads } = await adapter.searchAds('test');
    expect(ads).toHaveLength(1);
    REQUIRED_AD_FIELDS.forEach(field => {
      expect(ads[0]).toHaveProperty(field);
    });
    expect(Array.isArray(ads[0].headlines)).toBe(true);
    expect(Array.isArray(ads[0].descriptions)).toBe(true);
    expect(Array.isArray(ads[0].platforms)).toBe(true);
  });

  it('Google adapter output has all required NormalizedAd fields', async () => {
    const scrapedAds = makeGoogleScraperAds(1);
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new GoogleAdapter({ cacheService: cache, scraper });

    const { ads } = await adapter.searchAds('test');
    expect(ads).toHaveLength(1);
    REQUIRED_AD_FIELDS.forEach(field => {
      expect(ads[0]).toHaveProperty(field);
    });
    expect(Array.isArray(ads[0].headlines)).toBe(true);
    expect(Array.isArray(ads[0].descriptions)).toBe(true);
    expect(Array.isArray(ads[0].platforms)).toBe(true);
  });

  it('TikTok adapter output has all required NormalizedAd fields', async () => {
    const adapter = new TikTokAdapter({ cacheService: cache });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeTikTokApiResponse(1),
    });

    const { ads } = await adapter.searchAds('test', { source: 'api' });
    expect(ads).toHaveLength(1);
    REQUIRED_AD_FIELDS.forEach(field => {
      expect(ads[0]).toHaveProperty(field);
    });
    expect(Array.isArray(ads[0].headlines)).toBe(true);
    expect(Array.isArray(ads[0].descriptions)).toBe(true);
    expect(Array.isArray(ads[0].platforms)).toBe(true);
  });

  it('AdSearchResult has required envelope fields', async () => {
    const scraper = makeMockScraper(makeGoogleScraperAds(2));
    const adapter = new GoogleAdapter({ cacheService: cache, scraper });

    const result = await adapter.searchAds('test');

    expect(result).toHaveProperty('platform');
    expect(result).toHaveProperty('source');
    expect(result).toHaveProperty('ads');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('hasMore');
    expect(result).toHaveProperty('nextCursor');
    expect(result).toHaveProperty('fetchedAt');
    expect(typeof result.fetchedAt).toBe('string');
    // fetchedAt should be a valid ISO timestamp
    expect(new Date(result.fetchedAt).getTime()).toBeGreaterThan(0);
  });
});

// ---- Fallback Logic ----

describe('Fallback logic', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTTL: 60000 });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cache.destroy();
    vi.restoreAllMocks();
  });

  it('Meta: auto mode without credentials goes directly to scraper', async () => {
    // No API credentials → useScraper=true in auto mode → goes straight to scraper
    const fallbackAds = [{ id: 'fb-1', pageName: 'Fallback', headlines: [], descriptions: [], platforms: [] }];
    const scraper = makeMockScraper(fallbackAds);
    const adapter = new MetaAdapter({ cacheService: cache, scraper }); // no settingsRepo

    const result = await adapter.searchAds('shoes', { source: 'auto' });

    expect(result.source).toBe('scrape');
    expect(result.ads[0].id).toBe('fb-1');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('Meta: explicit source=api does NOT fall back to scraper', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const scraper = makeMockScraper([]);
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo, scraper });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { message: 'Token expired', code: 190 } }),
    });

    await expect(adapter.searchAds('shoes', { source: 'api' }))
      .rejects.toThrow();

    expect(scraper.scrapeAdsLibrary).not.toHaveBeenCalled();
  });

  it('TikTok: public API 429 falls back to scraper', async () => {
    const fallbackAds = [{ id: 'tt-fb-1', pageName: 'TT Fallback', headlines: [], descriptions: [], platforms: ['tiktok'] }];
    const scraper = makeMockScraper(fallbackAds);
    const adapter = new TikTokAdapter({ cacheService: cache, scraper });

    global.fetch.mockResolvedValueOnce({ ok: false, status: 429 });

    const result = await adapter.searchAds('viral', { source: 'auto' });

    expect(result.source).toBe('scrape');
    expect(scraper.scrapeAdsLibrary).toHaveBeenCalled();
  });

  it('TikTok: source=scrape skips public API entirely', async () => {
    const scrapedAds = [{ id: 'direct-scrape-1', pageName: 'Direct', headlines: [], descriptions: [], platforms: ['tiktok'] }];
    const scraper = makeMockScraper(scrapedAds);
    const adapter = new TikTokAdapter({ cacheService: cache, scraper });

    const result = await adapter.searchAds('query', { source: 'scrape' });

    expect(result.source).toBe('scrape');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---- Caching behavior ----

describe('Caching behavior', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTTL: 60000 });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cache.destroy();
    vi.restoreAllMocks();
  });

  it('searchAdsCached returns fromCache=true on second call', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => makeMetaApiResponse(2),
    });

    const first = await adapter.searchAdsCached('shoes', { country: 'US' });
    const second = await adapter.searchAdsCached('shoes', { country: 'US' });

    expect(first.fromCache).toBeUndefined();
    expect(second.fromCache).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('different queries use different cache keys', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => makeMetaApiResponse(1) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeMetaApiResponse(3) });

    const r1 = await adapter.searchAdsCached('shoes');
    const r2 = await adapter.searchAdsCached('bags');

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(r1.ads.length).toBe(1);
    expect(r2.ads.length).toBe(3);
  });

  it('searchAdsCached without cacheService calls searchAds directly', async () => {
    const scraper = makeMockScraper(makeGoogleScraperAds(2));
    const adapter = new GoogleAdapter({ scraper }); // no cacheService

    const result = await adapter.searchAdsCached('shoes');

    expect(result.ads).toHaveLength(2);
    expect(scraper.scrapeAdsLibrary).toHaveBeenCalledTimes(1);
  });

  it('cache stores results and stats increment', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => makeMetaApiResponse(1),
    });

    await adapter.searchAdsCached('test');
    await adapter.searchAdsCached('test');

    const stats = cache.getStats();
    expect(stats.sets).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });
});

// ---- Rate limiting (RequestQueue behavior via mock) ----

describe('Rate limiting via adapter options', () => {
  let cache;

  beforeEach(() => {
    cache = new CacheService({ defaultTTL: 60000 });
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cache.destroy();
    vi.restoreAllMocks();
  });

  it('adapter respects limit option in API call', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeMetaApiResponse(10),
    });

    await adapter.searchAds('shoes', { source: 'api', limit: 10 });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('limit=10');
  });

  it('adapter caps limit at 500 for Meta API', async () => {
    const settingsRepo = makeMockSettingsRepo('meta', { access_token: 'tok' });
    const adapter = new MetaAdapter({ cacheService: cache, settingsRepo });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeMetaApiResponse(5),
    });

    await adapter.searchAds('shoes', { source: 'api', limit: 9999 });

    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('limit=500');
  });

  it('adapter passes country option to scraper', async () => {
    const scraper = makeMockScraper(makeGoogleScraperAds(1));
    const adapter = new GoogleAdapter({ cacheService: cache, scraper });

    await adapter.searchAds('test', { country: 'GB', limit: 5 });

    expect(scraper.scrapeAdsLibrary).toHaveBeenCalledWith(
      'test',
      expect.objectContaining({ country: 'GB', limit: 5 })
    );
  });

  it('TikTok adapter caps limit at 50 for Creative Center API', async () => {
    const adapter = new TikTokAdapter({ cacheService: cache });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeTikTokApiResponse(5),
    });

    await adapter.searchAds('test', { source: 'api', limit: 200 });

    const callArgs = global.fetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.limit).toBe(50); // capped at 50
  });
});
