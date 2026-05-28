import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdResearchService } from '../../../server/services/ad-research-service.js';

describe('AdResearchService', () => {
  const mockMetaApi = {
    getAdLibrary: vi.fn(),
    getPageAds: vi.fn(),
    searchPages: vi.fn(),
    getTargetingOptions: vi.fn(),
  };

  let service;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdResearchService({ metaApi: mockMetaApi });
  });

  describe('constructor', () => {
    it('should create instance with metaApi', () => {
      expect(service).toBeInstanceOf(AdResearchService);
      expect(service.metaApi).toBe(mockMetaApi);
    });

    it('should handle optional mcpClient and db', () => {
      const s = new AdResearchService({ metaApi: mockMetaApi, mcpClient: {}, db: {} });
      expect(s.mcpClient).toBeDefined();
      expect(s.db).toBeDefined();
    });

    it('should handle empty constructor', () => {
      const s = new AdResearchService();
      expect(s.metaApi).toBeUndefined();
    });
  });

  describe('searchTrendingAds', () => {
    it('should return ads from Meta Ads Archive API', async () => {
      const mockAds = [{ id: 'ad_1', ad_creative_bodies: ['Check this out'] }];
      mockMetaApi.getAdLibrary.mockResolvedValue(mockAds);

      const result = await service.searchTrendingAds({ query: 'sneakers', country: 'US' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockAds);
      expect(result.source).toBe('meta_ads_archive');
      expect(mockMetaApi.getAdLibrary).toHaveBeenCalledWith({ query: 'sneakers', country: 'US', limit: 20 });
    });

    it('should try MCP fallback when API returns empty', async () => {
      mockMetaApi.getAdLibrary.mockResolvedValue([]);
      const mockMcpClient = {
        callTool: vi.fn().mockResolvedValue({ content: [{ id: 'mcp_ad_1' }] }),
      };
      service = new AdResearchService({ metaApi: mockMetaApi, mcpClient: mockMcpClient });

      const result = await service.searchTrendingAds({ query: 'sneakers', source: 'auto' });

      expect(result.success).toBe(true);
      expect(result.source).toBe('mcp');
      expect(mockMcpClient.callTool).toHaveBeenCalledWith('search_ads', { query: 'sneakers', country: 'ID', limit: 20 });
    });

    it('should return empty result when all sources fail', async () => {
      mockMetaApi.getAdLibrary.mockRejectedValue(new Error('API error'));

      const result = await service.searchTrendingAds({ query: 'sneakers' });

      // Error is caught by the outer try/catch → success: false
      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });

    it('should skip MCP if no mcpClient', async () => {
      mockMetaApi.getAdLibrary.mockResolvedValue([]);

      const result = await service.searchTrendingAds({ query: 'test', source: 'scrape' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.source).toBe('scrape');
    });

    it('should log warning when MCP fails', async () => {
      mockMetaApi.getAdLibrary.mockResolvedValue([]);
      const mockMcpClient = {
        callTool: vi.fn().mockRejectedValue(new Error('MCP error')),
      };
      service = new AdResearchService({ metaApi: mockMetaApi, mcpClient: mockMcpClient });

      const result = await service.searchTrendingAds({ query: 'test', source: 'scrape' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('analyzeCompetitor', () => {
    it('should analyze competitor with ads data', async () => {
      mockMetaApi.getPageAds.mockResolvedValue({
        source: 'ads_archive',
        ads: [
          { id: '1', ad_creative_bodies: ['Body 1'], publisher_platforms: ['facebook'] },
          { id: '2', ad_creative_bodies: ['Body 2 long text'], publisher_platforms: ['facebook', 'instagram'] },
        ],
      });

      const result = await service.analyzeCompetitor({ pageId: 'comp_123' });

      expect(result.success).toBe(true);
      expect(result.data.pageId).toBe('comp_123');
      expect(result.data.totalAds).toBe(2);
      expect(result.data.patterns).toBeDefined();
      expect(result.data.patterns.adCount).toBe(2);
      expect(result.data.patterns.avgBodyLength).toBeGreaterThan(0);
    });

    it('should handle page-only result (no ads)', async () => {
      mockMetaApi.getPageAds.mockResolvedValue({
        source: 'page_search',
        page: { id: 'comp_123', name: 'Competitor' },
      });

      const result = await service.analyzeCompetitor({ pageId: 'comp_123' });

      expect(result.success).toBe(true);
      expect(result.data.source).toBe('page_search');
      expect(result.data.totalAds).toBe(0);
      expect(result.data.note).toContain('Ads Archive');
    });

    it('should handle API error', async () => {
      mockMetaApi.getPageAds.mockRejectedValue(new Error('Page not found'));

      const result = await service.analyzeCompetitor({ pageId: 'bad_page' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Page not found');
    });
  });

  describe('searchPages', () => {
    it('should return search results', async () => {
      const mockPages = [{ id: 'p1', name: 'Nike' }];
      mockMetaApi.searchPages.mockResolvedValue(mockPages);

      const result = await service.searchPages('nike');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPages);
      expect(mockMetaApi.searchPages).toHaveBeenCalledWith('nike');
    });

    it('should handle search error', async () => {
      mockMetaApi.searchPages.mockRejectedValue(new Error('Search failed'));

      const result = await service.searchPages('nike');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Search failed');
    });
  });

  describe('getTargetingSuggestions', () => {
    it('should return targeting options', async () => {
      const mockOptions = [{ id: '1', name: 'Sneakers' }];
      mockMetaApi.getTargetingOptions.mockResolvedValue(mockOptions);

      const result = await service.getTargetingSuggestions('shoes');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockOptions);
    });

    it('should handle targeting error', async () => {
      mockMetaApi.getTargetingOptions.mockRejectedValue(new Error('API error'));

      const result = await service.getTargetingSuggestions('shoes');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API error');
    });
  });

  describe('_extractPatterns', () => {
    it('should extract patterns from ads', () => {
      // hasMultipleVariants = bodyLengths.length > ads.length
      // Use an ad with 2 creative bodies to trigger true
      const ads = [
        { ad_creative_bodies: ['Short'], publisher_platforms: ['facebook'] },
        { ad_creative_bodies: ['Body A', 'Body B'], publisher_platforms: ['facebook', 'instagram'] },
      ];

      const patterns = service._extractPatterns(ads);

      expect(patterns.adCount).toBe(2);
      expect(patterns.avgBodyLength).toBeGreaterThan(0);
      expect(patterns.platformDistribution).toEqual({ facebook: 2, instagram: 1 });
      expect(patterns.hasMultipleVariants).toBe(true);
    });

    it('should handle empty ads', () => {
      const patterns = service._extractPatterns([]);
      expect(patterns.adCount).toBe(0);
      expect(patterns.avgBodyLength).toBe(0);
      expect(patterns.platformDistribution).toBeNull();
      expect(patterns.hasMultipleVariants).toBe(false);
    });

    it('should handle ads without platform data', () => {
      const ads = [
        { ad_creative_bodies: ['Test'] },
        { ad_creative_bodies: ['Test 2'] },
      ];

      const patterns = service._extractPatterns(ads);
      expect(patterns.platformDistribution).toBeNull();
    });

    it('should handle ads without creative bodies', () => {
      const ads = [
        { publisher_platforms: ['facebook'] },
      ];

      const patterns = service._extractPatterns(ads);
      expect(patterns.avgBodyLength).toBe(0);
    });
  });

  describe('_searchViaMCP', () => {
    it('should return empty if no mcpClient', async () => {
      const result = await service._searchViaMCP('test', 'ID', 10);
      expect(result).toEqual([]);
    });

    it('should return empty if mcpClient has no callTool', async () => {
      service = new AdResearchService({ metaApi: mockMetaApi, mcpClient: {} });
      const result = await service._searchViaMCP('test', 'ID', 10);
      expect(result).toEqual([]);
    });

    it('should return MCP results', async () => {
      const mockMcpClient = {
        callTool: vi.fn().mockResolvedValue({ content: [{ id: '1' }, { id: '2' }] }),
      };
      service = new AdResearchService({ metaApi: mockMetaApi, mcpClient: mockMcpClient });

      const result = await service._searchViaMCP('test', 'ID', 10);
      expect(result).toHaveLength(2);
    });

    it('should handle MCP error gracefully', async () => {
      const mockMcpClient = {
        callTool: vi.fn().mockRejectedValue(new Error('MCP error')),
      };
      service = new AdResearchService({ metaApi: mockMetaApi, mcpClient: mockMcpClient });

      const result = await service._searchViaMCP('test', 'ID', 10);
      expect(result).toEqual([]);
    });
  });
});
