import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../server/lib/operators.js', () => ({
  compare: vi.fn((value, operator, target) => {
    switch(operator) {
      case '>': return value > target;
      case '<': return value < target;
      case '>=': return value >= target;
      case '<=': return value <= target;
      case '==': return value === target;
      case '!=': return value !== target;
      default: return false;
    }
  }),
}));

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: vi.fn(),
}));

vi.mock('../../../server/services/google/index.js', () => ({
  GoogleAdsAPI: vi.fn(),
}));

vi.mock('../../../server/services/tiktok/index.js', () => ({
  TikTokAdsAPI: vi.fn(),
}));

import { RuleEvaluator } from '../../../server/services/rule-evaluator.js';

describe('RuleEvaluator', () => {
  let evaluator;
  let mockSettingsRepo;
  let mockCampaignsRepo;
  let mockRulesRepo;
  let mockPlatformAccountsRepo;

  beforeEach(() => {
    mockSettingsRepo = {};
    mockCampaignsRepo = {
      findById: vi.fn(),
      findAll: vi.fn(() => []),
    };
    mockRulesRepo = {
      create: vi.fn(),
      getAllEnabled: vi.fn(() => []),
      trigger: vi.fn(),
    };
    mockPlatformAccountsRepo = {
      findByUserId: vi.fn(() => []),
    };

    evaluator = new RuleEvaluator(
      mockSettingsRepo,
      mockCampaignsRepo,
      mockRulesRepo,
      {},
      {},
      null
    );
    evaluator.platformAccountsRepo = mockPlatformAccountsRepo;
  });

  it('should create instance with dependencies', () => {
    expect(evaluator).toBeDefined();
  });

  it('should create a rule via repository', () => {
    evaluator.createRule('u1', {
      name: 'Test Rule',
      condition: { type: 'leaf', metric: 'cvr', operator: '<', value: 1.5 },
      action: { type: 'pause' },
    });
    expect(mockRulesRepo.create).toHaveBeenCalled();
  });

  describe('evaluateRule', () => {
    it('should execute action when condition matches', async () => {
      const rule = {
        id: 'r1',
        name: 'Test',
        condition: { type: 'leaf', metric: 'roas', operator: '<', value: 1.5 },
        action: { type: 'pause' },
      };
      const campaign = { id: 'c1', name: 'Camp', insights: { roas: 1.2 } };
      const result = await evaluator.evaluateRule(rule, campaign);
      expect(result).toBe(true);
    });

    it('should return false when condition does not match', async () => {
      const rule = {
        id: 'r1',
        name: 'Test',
        condition: { type: 'leaf', metric: 'roas', operator: '>', value: 5 },
        action: { type: 'pause' },
      };
      const campaign = { id: 'c1', name: 'Camp', insights: { roas: 1.2 } };
      const result = await evaluator.evaluateRule(rule, campaign);
      expect(result).toBe(false);
    });
  });

  describe('_evaluateCondition', () => {
    const campaign = {
      id: 'c1',
      name: 'Camp',
      status: 'ACTIVE',
      insights: {
        roas: 1.2,
        spend: 500,
        impressions: 20000,
        clicks: 300,
        conversions: 5,
        reach: 9000,
      },
    };

    it('should evaluate leaf conditions', () => {
      const cond = { type: 'leaf', metric: 'roas', operator: '<', value: 1.5 };
      expect(evaluator._evaluateCondition(cond, campaign)).toBe(true);
    });

    it('should evaluate AND group conditions', () => {
      const cond = {
        type: 'group',
        logic: 'and',
        children: [
          { type: 'leaf', metric: 'roas', operator: '<', value: 1.5 },
          { type: 'leaf', metric: 'spend', operator: '>', value: 100 },
        ],
      };
      expect(evaluator._evaluateCondition(cond, campaign)).toBe(true);
    });

    it('should evaluate OR group conditions', () => {
      const cond = {
        type: 'group',
        logic: 'or',
        children: [
          { type: 'leaf', metric: 'roas', operator: '>', value: 5 },
          { type: 'leaf', metric: 'spend', operator: '>', value: 100 },
        ],
      };
      expect(evaluator._evaluateCondition(cond, campaign)).toBe(true);
    });

    it('should return false for empty group', () => {
      expect(evaluator._evaluateCondition({ type: 'group', logic: 'and', children: [] }, campaign)).toBe(false);
    });

    it('should return false for unknown metric', () => {
      const cond = { type: 'leaf', metric: 'unknown', operator: '>', value: 1 };
      expect(evaluator._evaluateCondition(cond, campaign)).toBe(false);
    });
  });

  describe('checkCampaigns', () => {
    it('should check all campaigns against all rules', async () => {
      const campaigns = [
        { id: 'c1', insights: { roas: 0.5 } },
        { id: 'c2', insights: { roas: 3.0 } },
      ];
      mockCampaignsRepo.findAll.mockReturnValue(campaigns);
      mockRulesRepo.getAllEnabled.mockReturnValue([
        { id: 'r1', condition: { type: 'leaf', metric: 'roas', operator: '<', value: 1 }, action: { type: 'pause' } },
      ]);
      const matched = await evaluator.checkCampaigns('u1');
      expect(matched).toBe(1);
    });
  });
});
