import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../server/lib/operators.js', () => ({
  compare: vi.fn((value, operator, target) => {
    const ops = {
      '>': value > target,
      '>=': value >= target,
      '<': value < target,
      '<=': value <= target,
      '==': value == target,
      '===': value === target,
    };
    return ops[operator] ?? false;
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
  let mockLlmClient;
  let mockMetaApi;
  let mockGoogleApi;
  let mockTiktokApi;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSettingsRepo = {};
    mockCampaignsRepo = {
      getById: vi.fn(),
      getByUserId: vi.fn(),
      getAds: vi.fn(),
    };
    mockRulesRepo = {
      create: vi.fn().mockImplementation((r) => ({ id: 'rule_1', ...r })),
      getAllEnabled: vi.fn().mockResolvedValue([]),
    };
    mockLlmClient = {
      call: vi.fn(),
    };
    mockMetaApi = {
      apiUpdate: vi.fn().mockResolvedValue({}),
      apiGet: vi.fn(),
    };
    mockGoogleApi = {
      updateCampaign: vi.fn().mockResolvedValue({}),
    };
    mockTiktokApi = {
      updateCampaign: vi.fn().mockResolvedValue({}),
    };

    evaluator = new RuleEvaluator(
      mockSettingsRepo,
      mockCampaignsRepo,
      mockRulesRepo,
      mockLlmClient,
      { metaAdsAPI: mockMetaApi, googleAdsAPI: mockGoogleApi, tiktokAdsAPI: mockTiktokApi }
    );
  });

  it('should create instance with dependencies', () => {
    expect(evaluator.settingsRepo).toBe(mockSettingsRepo);
    expect(evaluator.campaignsRepo).toBe(mockCampaignsRepo);
    expect(evaluator.rulesRepo).toBe(mockRulesRepo);
    expect(evaluator.metaAdsAPI).toBe(mockMetaApi);
  });

  it('should create a rule via repository', () => {
    const rule = evaluator.createRule('user1', {
      name: 'Pause high spend',
      condition: { type: 'spend', operator: '>', value: 100 },
      action: { type: 'pause' },
    });

    expect(mockRulesRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user1',
      name: 'Pause high spend',
      priority: 1,
      enabled: true,
    }));
    expect(rule.id).toBe('rule_1');
  });

  describe('evaluateRule', () => {
    it('should execute action when condition matches', async () => {
      const rule = {
        condition: JSON.stringify({ type: 'status', value: 'active' }),
        action: JSON.stringify({ type: 'pause' }),
      };
      const campaign = { id: 'c1', status: 'active', platform: 'meta' };
      mockCampaignsRepo.getById.mockResolvedValue(campaign);

      const result = await evaluator.evaluateRule(rule, campaign);
      expect(result).toEqual(expect.objectContaining({
        campaign_id: 'c1',
        action: expect.objectContaining({ type: 'pause' }),
      }));
    });

    it('should return null when condition does not match', async () => {
      const rule = {
        condition: JSON.stringify({ type: 'status', value: 'paused' }),
        action: JSON.stringify({ type: 'resume' }),
      };
      const campaign = { id: 'c1', status: 'active', platform: 'meta' };

      const result = await evaluator.evaluateRule(rule, campaign);
      expect(result).toBeNull();
    });
  });

  describe('_evaluateCondition', () => {
    it('should evaluate status conditions', () => {
      expect(evaluator._evaluateCondition(
        { type: 'status', value: 'active' },
        { status: 'active' }
      )).toBe(true);

      expect(evaluator._evaluateCondition(
        { type: 'status', value: 'paused' },
        { status: 'active' }
      )).toBe(false);
    });

    it('should evaluate metric conditions', () => {
      expect(evaluator._evaluateCondition(
        { type: 'roas', operator: '>', value: 2 },
        { stats: { roas: 3.5 } }
      )).toBe(true);

      expect(evaluator._evaluateCondition(
        { type: 'spend', operator: '<', value: 100 },
        { stats: { spend: 150 } }
      )).toBe(false);
    });

    it('should return false for unknown condition types', () => {
      expect(evaluator._evaluateCondition(
        { type: 'unknown_metric', operator: '>', value: 1 },
        {}
      )).toBe(false);
    });
  });

  describe('_executeAction', () => {
    it('should not re-enter the same campaign', async () => {
      const rule = {
        condition: JSON.stringify({ type: 'status', value: 'active' }),
        action: JSON.stringify({ type: 'pause' }),
      };
      const campaign = { id: 'c1', status: 'active', platform: 'meta' };
      mockCampaignsRepo.getById.mockResolvedValue(campaign);

      // Simulate running: add to runningRules set
      evaluator.runningRules.add('c1');
      const result = await evaluator._executeAction({ type: 'pause' }, campaign);
      expect(result).toBeNull();
    });
  });

  describe('_scaleCampaign', () => {
    it('should scale up an LC_ campaign via Meta API', async () => {
      const campaign = { id: 'c1', name: 'LC_Spring', platform: 'meta', budget: 200 };
      mockCampaignsRepo.getById.mockResolvedValue(campaign);

      const result = await evaluator._scaleCampaign('c1', 1.5, 'increase');
      expect(result.direction).toBe('increase');
      expect(result.from).toBe(200);
      expect(result.to).toBe(300);
      expect(mockMetaApi.apiUpdate).toHaveBeenCalled();
    });

    it('should block scaling non-LC_ campaigns', async () => {
      const campaign = { id: 'c1', name: 'TC_Spring', platform: 'meta', budget: 200 };
      mockCampaignsRepo.getById.mockResolvedValue(campaign);

      const result = await evaluator._scaleCampaign('c1', 1.5, 'increase');
      expect(result.error).toContain('only LC_');
    });

    it('should return error if campaign not found', async () => {
      mockCampaignsRepo.getById.mockResolvedValue(null);
      const result = await evaluator._scaleCampaign('c99', 1.5, 'increase');
      expect(result.error).toBe('Campaign not found');
    });
  });

  describe('_pauseCampaign', () => {
    it('should pause a meta campaign', async () => {
      mockCampaignsRepo.getById.mockResolvedValue({ id: 'c1', platform: 'meta' });
      const result = await evaluator._pauseCampaign('c1');
      expect(result.action).toBe('pause');
      expect(result.status).toBe('PAUSED');
      expect(mockMetaApi.apiUpdate).toHaveBeenCalled();
    });

    it('should pause a google campaign', async () => {
      mockCampaignsRepo.getById.mockResolvedValue({ id: 'c1', platform: 'google', customer_id: 'cust1', platform_campaign_id: 'gc1' });
      const result = await evaluator._pauseCampaign('c1');
      expect(result.platform).toBe('google');
      expect(mockGoogleApi.updateCampaign).toHaveBeenCalledWith('cust1', 'gc1', { status: 'PAUSED' });
    });

    it('should pause a tiktok campaign', async () => {
      mockCampaignsRepo.getById.mockResolvedValue({ id: 'c1', platform: 'tiktok', advertiser_id: 'adv1', platform_campaign_id: 'tc1' });
      await evaluator._pauseCampaign('c1');
      expect(mockTiktokApi.updateCampaign).toHaveBeenCalledWith('adv1', 'tc1', { status: 'DISABLE' });
    });
  });

  describe('checkCampaigns', () => {
    it('should evaluate all rules for all campaigns', async () => {
      const campaigns = [
        { id: 'c1', status: 'active', stats: { roas: 0.5 } },
        { id: 'c2', status: 'active', stats: { roas: 3 } },
      ];
      const rules = [
        { condition: JSON.stringify({ type: 'roas', operator: '<', value: 1 }), action: JSON.stringify({ type: 'scale_down' }) },
      ];
      mockCampaignsRepo.getByUserId.mockResolvedValue(campaigns);
      mockRulesRepo.getAllEnabled.mockResolvedValue(rules);
      mockCampaignsRepo.getById.mockResolvedValue({ id: 'c1', name: 'LC_X', platform: 'meta', budget: 100 });

      const results = await evaluator.checkCampaigns('user1');
      expect(results).toHaveLength(1);
      expect(results[0].campaign_id).toBe('c1');
    });

    it('should return empty if no campaigns', async () => {
      mockCampaignsRepo.getByUserId.mockResolvedValue([]);
      const results = await evaluator.checkCampaigns('user1');
      expect(results).toEqual([]);
    });

    it('should return empty if no rules', async () => {
      mockCampaignsRepo.getByUserId.mockResolvedValue([{ id: 'c1' }]);
      mockRulesRepo.getAllEnabled.mockResolvedValue([]);
      const results = await evaluator.checkCampaigns('user1');
      expect(results).toEqual([]);
    });
  });
});
