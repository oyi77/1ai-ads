import { describe, it, expect, vi } from 'vitest';
import { AdResearchService } from '../../../server/services/ad-research.js';

describe('AdResearchService', () => {
  const mockSettingsRepo = {
    getCredentials: vi.fn(),
  };

  const service = new AdResearchService(mockSettingsRepo);

  it('should create an AdResearchService instance with settings repo', () => {
    expect(service).toBeInstanceOf(AdResearchService);
    expect(service.settingsRepo).toBe(mockSettingsRepo);
  });

  it('should throw error when access token is not configured', () => {
    mockSettingsRepo.getCredentials.mockReturnValue(null);

    expect(() => service._getToken()).toThrow('Meta access token not configured');
  });

  it('should search ads by keyword', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token_123',
    });

    const mockApiResponse = {
      data: [
        {
          id: 'ad_1',
          page_name: 'Test Page',
          page_id: 'page_1',
          ad_creative_bodies: ['Body text 1'],
          ad_creative_link_titles: ['Title 1'],
          ad_creative_link_descriptions: ['Description 1'],
          ad_creative_link_captions: ['Caption 1'],
          ad_snapshot_url: 'https://example.com/snapshot',
          ad_delivery_start_time: '2024-01-01',
          ad_delivery_stop_time: '2024-01-15',
          publisher_platforms: ['facebook', 'instagram'],
          languages: ['en'],
          estimated_audience_size: 10000,
          spend: 5000,
          impressions: 50000,
          currency: 'IDR',
        },
      ],
      paging: {
        next: 'https://graph.facebook.com/v21.0/ads_archive?after=next_cursor_123',
        cursors: { after: 'next_cursor_123' },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockApiResponse,
    });

    const result = await service.searchAds({
      query: 'digital marketing',
      country: 'ID',
      limit: 50,
    });

    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].id).toBe('ad_1');
    expect(result.ads[0].pageName).toBe('Test Page');
    expect(result.ads[0].bodies).toEqual(['Body text 1']);
    expect(result.total).toBe(1);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('next_cursor_123');

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('ads_archive'));
  });

  it('should throw error when search query is missing', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    await expect(service.searchAds({})).rejects.toThrow('Search query is required');
  });

  it('should handle Meta API errors', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        error: { message: 'Invalid access token' },
      }),
    });

    await expect(service.searchAds({ query: 'test' })).rejects.toThrow('Meta API error');
  });

  it('should search ads by page ID', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    const mockApiResponse = {
      data: [
        {
          id: 'ad_2',
          page_name: 'Competitor Page',
          page_id: 'page_2',
          ad_creative_bodies: ['Competitor ad body'],
          ad_creative_link_titles: ['Competitor title'],
          ad_creative_link_descriptions: [],
          ad_creative_link_captions: [],
          ad_snapshot_url: 'https://example.com/comp-snapshot',
          ad_delivery_start_time: '2024-02-01',
          ad_delivery_stop_time: null,
          publisher_platforms: ['facebook'],
          languages: ['id'],
          estimated_audience_size: 5000,
          spend: null,
          impressions: null,
          currency: null,
        },
      ],
      paging: {},
    };

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockApiResponse,
    });

    const result = await service.searchByPage({
      pageId: '123456789',
      country: 'ID',
      limit: 100,
    });

    expect(result.ads).toHaveLength(1);
    expect(result.ads[0].pageId).toBe('page_2');
    expect(result.ads[0].pageName).toBe('Competitor Page');
    expect(result.hasMore).toBe(false);
  });

  it('should throw error when page ID is missing', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    await expect(service.searchByPage({})).rejects.toThrow('Page ID is required');
  });

  it('should resolve page ID from page name', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    const mockPageResponse = {
      id: '987654321',
      name: 'My Business Page',
      fan_count: 5000,
      category: 'Business',
    };

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockPageResponse,
    });

    const result = await service.resolvePageId('My Business Page');

    expect(result.id).toBe('987654321');
    expect(result.name).toBe('My Business Page');
    expect(result.fanCount).toBe(5000);
    expect(result.category).toBe('Business');
  });

  it('should extract page name from URL', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    const mockPageResponse = {
      id: '111222333',
      name: 'URL Page',
      fan_count: 10000,
      category: 'Brand',
    };

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => mockPageResponse,
    });

    const result = await service.resolvePageId('https://www.facebook.com/urlpage');

    // The service calls fetch with only the URL (no options)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('urlpage'));
    expect(result.name).toBe('URL Page');
  });

  it('should handle page resolution errors', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        error: { message: 'Page not found' },
      }),
    });

    await expect(service.resolvePageId('nonexistent-page')).rejects.toThrow('Could not resolve page');
  });

  it('should format ad data correctly', () => {
    const rawAd = {
      id: 'ad_123',
      page_name: 'Test Page',
      page_id: 'page_123',
      ad_creative_bodies: ['Body 1', 'Body 2'],
      ad_creative_link_titles: ['Title 1'],
      ad_creative_link_descriptions: ['Desc 1'],
      ad_creative_link_captions: ['Cap 1'],
      ad_snapshot_url: 'https://snap.com/123',
      ad_delivery_start_time: '2024-01-01T00:00:00+0000',
      ad_delivery_stop_time: '2024-01-31T23:59:59+0000',
      publisher_platforms: ['facebook', 'instagram', 'messenger'],
      languages: ['id', 'en'],
      estimated_audience_size: 25000,
      spend: 100000,
      impressions: 1000000,
      currency: 'IDR',
    };

    const formatted = service._formatAd(rawAd);

    expect(formatted.id).toBe('ad_123');
    expect(formatted.pageName).toBe('Test Page');
    expect(formatted.bodies).toEqual(['Body 1', 'Body 2']);
    expect(formatted.titles).toEqual(['Title 1']);
    expect(formatted.platforms).toEqual(['facebook', 'instagram', 'messenger']);
    expect(formatted.audienceSize).toBe(25000);
    expect(formatted.spend).toBe(100000);
    expect(formatted.impressions).toBe(1000000);
    expect(formatted.currency).toBe('IDR');
  });

  it('should handle missing optional fields in ad formatting', () => {
    const minimalAd = {
      id: 'ad_minimal',
      page_name: 'Minimal Page',
      page_id: 'page_minimal',
    };

    const formatted = service._formatAd(minimalAd);

    expect(formatted.id).toBe('ad_minimal');
    expect(formatted.bodies).toEqual([]);
    expect(formatted.titles).toEqual([]);
    expect(formatted.descriptions).toEqual([]);
    expect(formatted.platforms).toEqual([]);
    expect(formatted.spend).toBeNull();
    expect(formatted.impressions).toBeNull();
  });

  it('should limit search results to 500', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ data: [], paging: {} }),
    });

    await service.searchAds({ query: 'test', limit: 1000 });

    const fetchCallArgs = fetch.mock.calls[0][0];
    expect(fetchCallArgs).toContain('limit=500');
  });

  it('should apply media type filter', async () => {
    mockSettingsRepo.getCredentials.mockReturnValue({
      access_token: 'test_token',
    });

    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ data: [], paging: {} }),
    });

    await service.searchAds({ query: 'test', mediaType: 'VIDEO' });

    const fetchCallArgs = fetch.mock.calls[0][0];
    expect(fetchCallArgs).toContain('media_type=VIDEO');
  });
});
