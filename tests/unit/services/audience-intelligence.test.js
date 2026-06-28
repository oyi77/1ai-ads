import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { AudienceIntelligence } from '../../../server/services/audience-intelligence.js';

describe('AudienceIntelligence', () => {
  let service;
  let mockMeta;
  let mockLlm;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMeta = {
      getTargetingOptions: vi.fn().mockResolvedValue([
        { id: '6003107902483', name: 'Fitness', audienceSize: 50000000, path: ['Interests'], topic: 'Health' },
        { id: '6003107902484', name: 'Yoga', audienceSize: 20000000, path: ['Interests'], topic: 'Health' },
      ]),
      apiPost: vi.fn().mockResolvedValue({ id: 'audience-123' }),
      apiGet: vi.fn().mockResolvedValue({ overlap_percentage: 30, audience_count: 5000 }),
    };

    mockLlm = {
      call: vi.fn().mockResolvedValue(JSON.stringify([
        { interest: 'Fitness', reason: 'Health conscious' },
        { interest: 'Yoga', reason: 'Wellness focus' },
      ])),
    };

    service = new AudienceIntelligence(mockMeta, mockLlm);
  });

  it('should create instance with dependencies', () => {
    expect(service.meta).toBe(mockMeta);
    expect(service.llm).toBe(mockLlm);
  });

  describe('getAudienceInsights', () => {
    it('should return audience insights for interests', async () => {
      const result = await service.getAudienceInsights(['Fitness', 'Yoga']);
      expect(result.interests).toHaveLength(2);
      expect(result.totalReach).toBe(70000000);
      expect(result.country).toBe('ID');
    });

    it('should handle custom country option', async () => {
      const result = await service.getAudienceInsights(['Fitness'], { country: 'US' });
      expect(result.country).toBe('US');
    });

    it('should throw for empty interests', async () => {
      await expect(service.getAudienceInsights([])).rejects.toThrow('interests array is required');
      await expect(service.getAudienceInsights(null)).rejects.toThrow('interests array is required');
    });

    it('should handle API errors gracefully per interest', async () => {
      mockMeta.getTargetingOptions.mockRejectedValueOnce(new Error('API error'));
      const result = await service.getAudienceInsights(['Fitness']);
      expect(result.interests[0].error).toBe('API error');
      expect(result.interests[0].audienceSize).toBe(0);
    });

    it('should pick exact name match over first result', async () => {
      mockMeta.getTargetingOptions.mockResolvedValue([
        { id: '1', name: 'Other', audienceSize: 100 },
        { id: '2', name: 'Fitness', audienceSize: 50000 },
      ]);
      const result = await service.getAudienceInsights(['Fitness']);
      expect(result.interests[0].interest).toBe('Fitness');
      expect(result.interests[0].audienceSize).toBe(50000);
    });
  });

  describe('buildLookalikeAudience', () => {
    it('should create lookalike audience via Meta API', async () => {
      const result = await service.buildLookalikeAudience('act_123', {
        sourceAudienceId: 'src-1', country: 'US', ratio: 0.05,
      });

      expect(result.audienceId).toBe('audience-123');
      expect(result.status).toBe('created');
      expect(mockMeta.apiPost).toHaveBeenCalledWith('/act_123/customaudiences', expect.objectContaining({
        subtype: 'LOOKALIKE',
      }));
    });

    it('should throw if accountId missing', async () => {
      await expect(service.buildLookalikeAudience(null, { sourceAudienceId: 'src-1' })).rejects.toThrow('accountId is required');
    });

    it('should throw if sourceAudienceId missing', async () => {
      await expect(service.buildLookalikeAudience('act_123', {})).rejects.toThrow('sourceAudienceId is required');
    });

    it('should clamp ratio between 0.01 and 0.20', async () => {
      await service.buildLookalikeAudience('act_123', { sourceAudienceId: 'src-1', ratio: 0.5 });
      const call = mockMeta.apiPost.mock.calls[0][1];
      expect(call.lookalike_spec.ratio).toBe(0.20);
    });

    it('should handle API failure', async () => {
      mockMeta.apiPost.mockRejectedValue(new Error('Permission denied'));
      await expect(service.buildLookalikeAudience('act_123', { sourceAudienceId: 'src-1' }))
        .rejects.toThrow('Lookalike audience creation failed');
    });
  });

  describe('detectOverlap', () => {
    it('should detect overlap between ad sets', async () => {
      const result = await service.detectOverlap('act_123', ['adset-1', 'adset-2']);
      expect(result).toHaveLength(1);
      expect(result[0].adset1).toBe('adset-1');
      expect(result[0].adset2).toBe('adset-2');
      expect(result[0].overlapPercent).toBe(30);
    });

    it('should add recommendations based on overlap percentage', async () => {
      mockMeta.apiGet.mockResolvedValue({ overlap_percentage: 60 });
      const result = await service.detectOverlap('act_123', ['a1', 'a2']);
      expect(result[0].recommendation).toContain('High overlap');
    });

    it('should throw for less than 2 ad sets', async () => {
      await expect(service.detectOverlap('act_123', ['adset-1'])).rejects.toThrow('At least 2 adsetIds required');
    });

    it('should throw if accountId missing', async () => {
      await expect(service.detectOverlap(null, ['a1', 'a2'])).rejects.toThrow('accountId is required');
    });

    it('should handle API failure with fallback message', async () => {
      mockMeta.apiGet.mockRejectedValue(new Error('API error'));
      const result = await service.detectOverlap('act_123', ['a1', 'a2']);
      expect(result[0].error).toBe('API error');
      expect(result[0].recommendation).toContain('Unable to calculate');
    });
  });

  describe('suggestInterests', () => {
    it('should return validated interest suggestions', async () => {
      const result = await service.suggestInterests('fitness tracker', 'health enthusiasts');
      expect(mockLlm.call).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].interest).toBeDefined();
    });

    it('should throw if product description missing', async () => {
      await expect(service.suggestInterests(null)).rejects.toThrow('product description is required');
    });

    it('should filter out already-targeted interests', async () => {
      const result = await service.suggestInterests('fitness tracker', 'health', { existingInterests: ['Fitness'] });
      const fitness = result.find(r => r.interest.toLowerCase() === 'fitness');
      expect(fitness).toBeUndefined();
    });

    it('should handle LLM failure gracefully', async () => {
      mockLlm.call.mockRejectedValue(new Error('LLM error'));
      const result = await service.suggestInterests('fitness tracker', 'health');
      expect(result).toEqual([]);
    });

    it('should sort results by valid status then audience size', async () => {
      mockLlm.call.mockResolvedValue(JSON.stringify([
        { interest: 'SmallNiche', reason: 'Small' },
        { interest: 'Fitness', reason: 'Large' },
      ]));
      mockMeta.getTargetingOptions.mockImplementation((term) => {
        if (term.toLowerCase() === 'fitness') return Promise.resolve([{ id: '1', name: 'Fitness', audienceSize: 50000 }]);
        return Promise.resolve([]);
      });

      const result = await service.suggestInterests('product', 'target');
      const validIdx = result.findIndex(r => r.valid);
      const invalidIdx = result.findIndex(r => !r.valid);
      if (validIdx >= 0 && invalidIdx >= 0) expect(validIdx).toBeLessThan(invalidIdx);
    });
  });

  describe('_parseJSON', () => {
    it('should parse valid JSON', () => {
      expect(service._parseJSON('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('should extract JSON from markdown fences', () => {
      expect(service._parseJSON('```json\n[1,2,3]\n```')).toEqual([1, 2, 3]);
    });

    it('should return null for invalid input', () => {
      expect(service._parseJSON(null)).toBeNull();
      expect(service._parseJSON('not json')).toBeNull();
    });
  });
});
