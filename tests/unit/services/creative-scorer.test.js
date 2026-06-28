import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { CreativeScorer, FEATURE_NAMES } from '../../../server/services/creative-scorer.js';

describe('CreativeScorer', () => {
  let scorer;
  let mockDb;
  let mockLlm;
  let mockSettingsRepo;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      prepare: vi.fn().mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      }),
    };
    mockLlm = { call: vi.fn() };
    mockSettingsRepo = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    };

    scorer = new CreativeScorer(mockDb, mockLlm, mockSettingsRepo);
  });

  it('should create instance with default weights', () => {
    expect(scorer.weights).toHaveLength(FEATURE_NAMES.length + 1);
    expect(scorer.db).toBe(mockDb);
  });

  it('should load stored weights when available', () => {
    const customWeights = new Array(FEATURE_NAMES.length + 1).fill(0.5);
    mockSettingsRepo.get.mockReturnValue(JSON.stringify(customWeights));

    const s = new CreativeScorer(mockDb, mockLlm, mockSettingsRepo);
    expect(s.weights).toEqual(customWeights);
  });

  describe('scoreCreative', () => {
    it('should return a score between 0 and 100', async () => {
      const result = await scorer.scoreCreative({
        hook: 'Get 50% off today! Best deal ever.',
        body: 'Save money and boost your revenue with our proven solution. Free trial.',
        cta: 'Shop now',
        platform: 'meta',
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.model).toBe('logistic');
      expect(result.probability).toBeGreaterThanOrEqual(0);
      expect(result.probability).toBeLessThanOrEqual(1);
      expect(result.breakdown).toBeDefined();
      expect(result.suggestions).toBeDefined();
    });

    it('should return higher score for a strong creative', async () => {
      const strong = await scorer.scoreCreative({
        hook: '#1 best product - 50% off today only! Are you tired of bad results?',
        body: 'Save thousands and boost revenue with our proven, trusted solution. Free trial, instant results.',
        cta: 'Get started now',
        platform: 'meta',
      });

      const weak = await scorer.scoreCreative({
        hook: 'product',
        body: 'it is good',
        cta: 'click',
        platform: 'meta',
      });

      expect(strong.score).toBeGreaterThan(weak.score);
    });

    it('should handle empty creative input', async () => {
      const result = await scorer.scoreCreative();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should return a breakdown with all feature names', async () => {
      const result = await scorer.scoreCreative({
        hook: 'Test hook',
        body: 'Test body',
        cta: 'Buy',
      });

      for (const name of FEATURE_NAMES) {
        expect(result.breakdown).toHaveProperty(name);
      }
    });
  });

  describe('scoreByHistory', () => {
    it('should return historical score from DB', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([
          { id: '1', name: 'Ad A', hook: 'Buy now', performance_score: 80, best_roas: 3, best_ctr: 2.5 },
          { id: '2', name: 'Ad B', hook: 'Sale', performance_score: 60, best_roas: 2, best_ctr: 1.5 },
        ]),
      });

      const result = await scorer.scoreByHistory({ platform: 'meta' });
      expect(result.historicalScore).toBe(70);
      expect(result.similarCreatives).toHaveLength(2);
    });

    it('should return default score when no data', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      const result = await scorer.scoreByHistory({ platform: 'meta' });
      expect(result.historicalScore).toBe(50);
      expect(result.similarCreatives).toEqual([]);
      expect(result.note).toBeDefined();
    });

    it('should handle DB errors gracefully', async () => {
      mockDb.prepare.mockImplementation(() => { throw new Error('DB error'); });

      const result = await scorer.scoreByHistory({ platform: 'meta' });
      expect(result.historicalScore).toBe(50);
      expect(result.error).toBe('DB error');
    });
  });

  describe('trainFromHistory', () => {
    it('should return early with no training data', async () => {
      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([]),
      });

      const result = await scorer.trainFromHistory({ epochs: 10 });
      expect(result.epochs).toBe(0);
      expect(result.finalLoss).toBe(0);
    });

    it('should train with valid data and return loss', async () => {
      const trainingData = Array.from({ length: 10 }, (_, i) => ({
        hook: `Hook ${i} best ${i % 2 === 0 ? '50%' : ''} now`,
        body: `Body ${i} save free boost`,
        cta: i % 2 === 0 ? 'Buy now' : 'click',
        platform: 'meta',
        performance_score: 70 + (i % 30),
        ctr: 2 + i * 0.1,
        roas: 1 + i * 0.3,
      }));

      mockDb.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue(trainingData),
      });

      const result = await scorer.trainFromHistory({ epochs: 5, learningRate: 0.01 });
      expect(result.epochs).toBe(5);
      expect(result.weights).toHaveLength(FEATURE_NAMES.length + 1);
    });
  });

  describe('_extractFeatures', () => {
    it('should detect urgency words', () => {
      const features = scorer._extractFeatures({ hook: 'Buy now limited offer', body: '', cta: '', platform: 'meta' });
      // hook_has_urgency is index 3
      expect(features[3]).toBe(1);
    });

    it('should detect curiosity triggers', () => {
      const features = scorer._extractFeatures({ hook: 'The secret revealed', body: '', cta: '', platform: 'meta' });
      expect(features[4]).toBe(1);
    });

    it('should detect pain words', () => {
      const features = scorer._extractFeatures({ hook: 'Are you tired of struggling?', body: '', cta: '', platform: 'meta' });
      expect(features[6]).toBe(1);
    });

    it('should detect numbers in hook', () => {
      const features = scorer._extractFeatures({ hook: 'Get 50% off', body: '', cta: '', platform: 'meta' });
      expect(features[1]).toBe(1);
    });

    it('should detect question marks', () => {
      const features = scorer._extractFeatures({ hook: 'Want more?', body: '', cta: '', platform: 'meta' });
      expect(features[2]).toBe(1);
    });
  });

  describe('_platformFit', () => {
    it('should score well for meta-optimized hook', () => {
      const fit = scorer._platformFit(10, 20, 'meta');
      expect(fit).toBe(1);
    });

    it('should score low for very long hooks on meta', () => {
      const fit = scorer._platformFit(30, 20, 'meta');
      // hook>25 → 0.2, body in 10-40 → 1.0, avg = 0.6
      expect(fit).toBeLessThan(0.7);
    });

    it('should score well for short TikTok hook', () => {
      const fit = scorer._platformFit(5, 0, 'tiktok');
      expect(fit).toBe(1);
    });

    it('should return default for unknown platform', () => {
      const fit = scorer._platformFit(10, 20, 'pinterest');
      expect(fit).toBe(0.5);
    });
  });

  describe('_complexityScore', () => {
    it('should score high for simple words', () => {
      expect(scorer._complexityScore(['buy', 'now', 'get', 'the'])).toBe(1);
    });

    it('should score lower for complex words', () => {
      expect(scorer._complexityScore(['unprecedented', 'extraordinary', 'revolutionary'])).toBe(0.3);
    });

    it('should return 0.5 for empty array', () => {
      expect(scorer._complexityScore([])).toBe(0.5);
    });
  });
});
