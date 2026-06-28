import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../server/services/cache-service.js', () => ({
  CacheService: class {
    getStats() { return { hits: 0, misses: 0 }; }
    clear() {}
    clearByPrefix() {}
    destroy() {}
  },
}));

vi.mock('../../../server/services/ads-library/meta-adapter.js', () => ({
  MetaAdapter: class {
    get displayName() { return 'Meta Ad Library'; }
    async searchAdsCached() { return { ads: [{ id: 'ad-1' }], total: 1, source: 'api', hasMore: false }; }
    async getAdDetails() { return { id: 'ad-1', text: 'Test ad' }; }
    getAvailablePublicAPIs() { return [{ name: 'Meta Ad Library API', available: true, requiresAuth: false }]; }
    hasApiAccess() { return true; }
  },
}));

vi.mock('../../../server/services/ads-library/google-adapter.js', () => ({
  GoogleAdapter: class {
    get displayName() { return 'Google Ads Transparency'; }
    async searchAdsCached() { return { ads: [{ id: 'g-ad-1' }], total: 1, source: 'scraper', hasMore: false }; }
    async getAdDetails() { return { id: 'g-ad-1' }; }
    getAvailablePublicAPIs() { return []; }
    hasApiAccess() { return false; }
  },
}));

vi.mock('../../../server/services/ads-library/tiktok-adapter.js', () => ({
  TikTokAdapter: class {
    get displayName() { return 'TikTok Creative Center'; }
    async searchAdsCached() { return { ads: [], total: 0, source: 'scraper', hasMore: false }; }
    async getAdDetails() { return null; }
    getAvailablePublicAPIs() { return []; }
    hasApiAccess() { return false; }
  },
}));

vi.mock('../../../server/services/web-scraper/meta-scraper.js', () => ({ MetaScraper: class {} }));
vi.mock('../../../server/services/web-scraper/google-scraper.js', () => ({ GoogleScraper: class {} }));
vi.mock('../../../server/services/web-scraper/tiktok-scraper.js', () => ({ TikTokScraper: class {} }));
vi.mock('../../../server/services/web-scraper/base-scraper.js', () => ({
  PuppeteerPool: class {
    getStats() { return { active: 0 }; }
    async closeAll() {}
  },
  RequestQueue: class {
    getStats() { return { pending: 0 }; }
  },
}));

import { UnifiedAdsLibraryService, createUnifiedAdsLibraryService } from '../../../server/services/unified-ads-library.js';

describe('UnifiedAdsLibraryService', () => {
  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UnifiedAdsLibraryService();
  });

  it('should create instance and initialize adapters', () => {
    expect(service.adapters.meta).toBeDefined();
    expect(service.adapters.google).toBeDefined();
    expect(service.adapters.tiktok).toBeDefined();
  });

  it('should create via factory function', () => {
    const s = createUnifiedAdsLibraryService();
    expect(s).toBeInstanceOf(UnifiedAdsLibraryService);
  });

  describe('search', () => {
    it('should search all platforms by default', async () => {
      const result = await service.search('nike shoes');
      expect(result.query).toBe('nike shoes');
      expect(result.platforms).toHaveLength(3);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should search a specific platform', async () => {
      const result = await service.search('nike', { platform: 'meta' });
      expect(result.platforms).toHaveLength(1);
      expect(result.platforms[0].platform).toBe('meta');
    });

    it('should throw for unsupported platform', async () => {
      await expect(service.search('test', { platform: 'pinterest' })).rejects.toThrow('Unsupported platform');
    });

    it('should aggregate results with metadata', async () => {
      const result = await service.search('test');
      expect(result.totalByPlatform).toBeDefined();
      expect(result.fetchedAt).toBeDefined();
      expect(result.hasErrors).toBeDefined();
    });

    it('should handle partial platform failures', async () => {
      service.adapters.meta.searchAdsCached = vi.fn().mockRejectedValue(new Error('Meta down'));
      const result = await service.search('test', { platform: 'all' });
      const metaResult = result.platforms.find(p => p.platform === 'meta');
      expect(metaResult.error).toBeDefined();
    });
  });

  describe('getAdDetails', () => {
    it('should get ad details from a platform', async () => {
      const result = await service.getAdDetails('meta', 'ad-1');
      expect(result.platform).toBe('meta');
      expect(result.ad).toBeDefined();
      expect(result.fetchedAt).toBeDefined();
    });

    it('should throw for unsupported platform', async () => {
      await expect(service.getAdDetails('unknown', 'ad-1')).rejects.toThrow('Unsupported platform');
    });

    it('should handle adapter error gracefully', async () => {
      service.adapters.meta.getAdDetails = vi.fn().mockRejectedValue(new Error('Not found'));
      const result = await service.getAdDetails('meta', 'ad-1');
      expect(result.error).toBe('Not found');
      expect(result.ad).toBeNull();
    });
  });

  describe('getSources', () => {
    it('should return sources for all platforms', async () => {
      const result = await service.getSources();
      expect(result).toHaveLength(3);
      expect(result[0].name).toBeDefined();
      expect(result[0].displayName).toBeDefined();
    });

    it('should return sources for a specific platform', async () => {
      const result = await service.getSources('meta');
      expect(result).toHaveLength(1);
    });

    it('should filter out unknown platforms', async () => {
      const result = await service.getSources('unknown');
      expect(result).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return service statistics', async () => {
      const result = await service.getStats();
      expect(result.platforms).toBe(3);
      expect(result.sources).toBeDefined();
      expect(result.cache).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should clear cache for specific platform', () => {
      const spy = vi.spyOn(service.cacheService, 'clearByPrefix');
      service.clearCache('meta');
      expect(spy).toHaveBeenCalledWith('ads:meta');
    });

    it('should clear all cache when no platform specified', () => {
      const spy = vi.spyOn(service.cacheService, 'clear');
      service.clearCache();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('should clean up resources', async () => {
      const poolSpy = vi.spyOn(service.puppeteerPool, 'closeAll');
      const cacheSpy = vi.spyOn(service.cacheService, 'destroy');
      await service.destroy();
      expect(poolSpy).toHaveBeenCalled();
      expect(cacheSpy).toHaveBeenCalled();
    });
  });
});
