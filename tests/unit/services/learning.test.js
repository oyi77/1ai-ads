import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningService } from '../../../server/services/learning.js';

// Mock node-fetch
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

// Get the mocked fetch
import fetch from 'node-fetch';
const mockFetch = vi.mocked(fetch);

// Mock config
vi.mock('../../../server/config/index.js', () => ({
  default: {
    bkHubUrl: 'http://localhost:9099',
  },
}));

describe('LearningService', () => {
  let mockCampaignsRepo;
  let mockAdsRepo;
  let mockLandingRepo;
  let learning;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCampaignsRepo = {
      findAll: vi.fn(),
    };

    mockAdsRepo = {
      findAll: vi.fn(),
    };

    mockLandingRepo = {
      findAll: vi.fn(),
    };

    learning = new LearningService(mockCampaignsRepo, mockAdsRepo, mockLandingRepo);
  });

  it('should create a LearningService instance with dependencies', () => {
    expect(learning).toBeInstanceOf(LearningService);
    expect(learning.campaignsRepo).toBe(mockCampaignsRepo);
    expect(learning.adsRepo).toBe(mockAdsRepo);
    expect(learning.landingRepo).toBe(mockLandingRepo);
  });

  it('should sync insight to knowledge base successfully', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'kb_123' }),
    });

    const insight = {
      title: 'Test Insight',
      content: 'Test content',
      tags: ['test'],
    };

    const result = await learning.syncInsightToKB(insight);

    expect(result).toEqual({ id: 'kb_123' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/kb/add'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(insight),
      })
    );
  });

  it('should return null on failed KB sync', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: async () => 'Error message',
    });

    const result = await learning.syncInsightToKB({
      title: 'Test',
      content: 'Test',
      tags: [],
    });

    expect(result).toBeNull();
  });

  it('should return null on KB sync error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await learning.syncInsightToKB({
      title: 'Test',
      content: 'Test',
      tags: [],
    });

    expect(result).toBeNull();
  });

  it('should query knowledge base', async () => {
    const mockResults = [
      { id: '1', title: 'Result 1', snippet: 'Snippet 1', score: 0.9, tags: [] },
      { id: '2', title: 'Result 2', snippet: 'Snippet 2', score: 0.8, tags: [] },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    });

    const results = await learning.queryKB('test query', 5);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Result 1');
    expect(results[0].score).toBe(0.9);
  });

  it('should return empty array on failed KB query', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const results = await learning.queryKB('test query');
    expect(results).toEqual([]);
  });

  it('should record campaign performance', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'kb_campaign' }),
    });

    const campaign = {
      name: 'Test Campaign',
      platform: 'meta',
      status: 'ACTIVE',
      objective: 'OUTCOME_TRAFFIC',
      spend: 100000,
      revenue: 300000,
      impressions: 10000,
      clicks: 500,
      conversions: 20,
    };

    const result = await learning.recordCampaignPerformance(campaign);

    expect(result).toEqual({ id: 'kb_campaign' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/kb/add'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('should determine excellent performance label', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'kb' }),
    });

    const campaign = {
      name: 'Excellent Campaign',
      platform: 'meta',
      status: 'ACTIVE',
      spend: 100000,
      revenue: 400000, // roas = 4 (> 3)
      roas: 4,
      impressions: 10000,
      clicks: 300, // ctr = 3% (> 2%)
      conversions: 10,
    };

    await learning.recordCampaignPerformance(campaign);

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);

    expect(body.title).toContain('EXCELLENT');
    expect(body.tags).toContain('excellent');
  });

  it('should record ad performance', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'kb_ad' }),
    });

    const ad = {
      hook: 'Amazing hook that captures attention',
      body: 'Compelling body text that converts',
      cta: 'Buy Now',
      platform: 'meta',
      objective: 'OUTCOME_SALES',
      model_name: 'P.A.S',
    };

    const result = await learning.recordAdPerformance(ad);

    expect(result).toEqual({ id: 'kb_ad' });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should return null for ad without hook or body', async () => {
    const ad = { platform: 'meta' };
    const result = await learning.recordAdPerformance(ad);
    expect(result).toBeNull();
  });

  it('should record landing page performance', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'kb_landing' }),
    });

    const landing = {
      name: 'Test Landing',
      template: 'conversion',
      theme: 'modern',
      is_published: true,
      slug: 'test-landing',
      product_name: 'Test Product',
      price: 'Rp 99.000',
      benefits: 'Benefit 1, Benefit 2',
      pain_points: 'Pain 1, Pain 2',
      cta_primary: 'Buy Now',
      html_output: '<html>...</html>',
    };

    const result = await learning.recordLandingPerformance(landing);

    expect(result).toEqual({ id: 'kb_landing' });
    expect(mockFetch).toHaveBeenCalled();
  });

  it('should return null for landing without html or template', async () => {
    const landing = { name: 'Empty Landing' };
    const result = await learning.recordLandingPerformance(landing);
    expect(result).toBeNull();
  });

  it('should sync all data to knowledge base', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'kb_sync' }),
    });

    mockCampaignsRepo.findAll.mockReturnValue({
      data: [
        { name: 'Campaign 1', spend: 10000, impressions: 1000 }, // meets condition (spend > 0)
        { name: 'Campaign 2', spend: 0, impressions: 0 }, // doesn't meet condition
      ],
    });

    mockAdsRepo.findAll.mockReturnValue({
      data: [
        { hook: 'Hook 1', body: 'Body 1' }, // meets condition (has hook or body)
        { hook: '', body: '' }, // doesn't meet condition
      ],
    });

    mockLandingRepo.findAll.mockReturnValue({
      data: [
        { name: 'Landing 1', is_published: true, template: 'conversion' }, // meets condition (is_published AND has template)
        { name: 'Landing 2', html_output: '<html>test</html>' }, // meets condition (has html_output)
        { name: 'Landing 3' }, // doesn't meet condition (no html_output or template)
      ],
    });

    const result = await learning.syncAllToKB();

    expect(result.synced).toBe(4); // Campaign 1, Ad 1, Landing 1, Landing 2
    expect(result.total).toBe(7);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('should get creative inspiration', async () => {
    const mockResults = [
      { title: 'Inspiration 1', snippet: 'Snippet 1', score: 0.95, tags: ['creative'] },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    });

    const results = await learning.getCreativeInspiration('Product', 'Target', 'Industry');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Inspiration 1');
    expect(results[0].score).toBe(0.95);
  });

  it('should get landing inspiration', async () => {
    const mockResults = [
      { title: 'Landing Insp 1', snippet: 'Landing snippet', score: 0.88, tags: ['landing'] },
    ];
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    });

    const results = await learning.getLandingInspiration('template1', 'theme1', 'Product');

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Landing Insp 1');
  });
});
