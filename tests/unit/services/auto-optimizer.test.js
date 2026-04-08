import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoOptimizer } from '../../../server/services/auto-optimizer.js';

describe('AutoOptimizer', () => {
  let mockMetaApi;
  let mockRulesRepo;
  let mockCampaignsRepo;
  let optimizer;

  beforeEach(() => {
    vi.clearAllMocks();

    mockMetaApi = {
      getCampaignInsights: vi.fn(),
      updateCampaign: vi.fn(),
    };

    mockRulesRepo = {
      findActive: vi.fn(),
      markTriggered: vi.fn(),
    };

    mockCampaignsRepo = {};

    optimizer = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo);
  });

  it('should create an AutoOptimizer instance with dependencies', () => {
    expect(optimizer).toBeInstanceOf(AutoOptimizer);
    expect(optimizer.meta).toBe(mockMetaApi);
    expect(optimizer.rules).toBe(mockRulesRepo);
    expect(optimizer.campaigns).toBe(mockCampaignsRepo);
  });

  it('should return empty result when no active rules', async () => {
    mockRulesRepo.findActive.mockReturnValue([]);
    const result = await optimizer.evaluate();
    expect(result.checked).toBe(0);
    expect(result.triggered).toBe(0);
    expect(mockMetaApi.getCampaignInsights).not.toHaveBeenCalled();
  });

  it('should evaluate rules and trigger pause action', async () => {
    const rules = [
      {
        id: 'rule1',
        name: 'High CPC Rule',
        campaign_id: 'camp_123',
        condition_metric: 'cpc',
        condition_operator: '>',
        condition_value: 5000,
        action: 'pause',
        action_value: null,
      },
    ];

    const insights = {
      cpc: 6000,
      ctr: 1.5,
      spend: 100000,
      conversions: 10,
      impressions: 10000,
      clicks: 150,
    };

    mockRulesRepo.findActive.mockReturnValue(rules);
    mockMetaApi.getCampaignInsights.mockResolvedValue(insights);
    mockMetaApi.updateCampaign.mockResolvedValue({ id: 'camp_123', status: 'PAUSED' });

    const result = await optimizer.evaluate();

    expect(result.checked).toBe(1);
    expect(result.triggered).toBe(1);
    expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('camp_123', { status: 'PAUSED' });
    expect(mockRulesRepo.markTriggered).toHaveBeenCalledWith('rule1');
  });

  it('should evaluate conditions correctly', () => {
    expect(optimizer._evaluateCondition(10, '>', 5)).toBe(true);
    expect(optimizer._evaluateCondition(10, '<', 5)).toBe(false);
    expect(optimizer._evaluateCondition(10, '>=', 10)).toBe(true);
    expect(optimizer._evaluateCondition(10, '<=', 10)).toBe(true);
    expect(optimizer._evaluateCondition(10, '==', 10)).toBe(true);
    expect(optimizer._evaluateCondition(10, '==', 5)).toBe(false);
    expect(optimizer._evaluateCondition(null, '>', 5)).toBe(false);
  });

  it('should get metric values from insights', () => {
    const insights = {
      cpc: 5000,
      ctr: 2.5,
      spend: 100000,
      impressions: 50000,
      clicks: 1250,
      conversions: 20,
    };

    expect(optimizer._getMetricValue(insights, 'cpc')).toBe(5000);
    expect(optimizer._getMetricValue(insights, 'ctr')).toBe(2.5);
    expect(optimizer._getMetricValue(insights, 'spend')).toBe(100000);
    expect(optimizer._getMetricValue(insights, 'impressions')).toBe(50000);
    expect(optimizer._getMetricValue(insights, 'clicks')).toBe(1250);
    expect(optimizer._getMetricValue(insights, 'cpa')).toBe(5000); // 100000/20
    expect(optimizer._getMetricValue(insights, 'roas')).toBeNull();
  });

  it('should handle scale_up action', async () => {
    const rules = [
      {
        id: 'rule2',
        name: 'Low CPA Scale Up',
        campaign_id: 'camp_456',
        condition_metric: 'cpa',
        condition_operator: '<',
        condition_value: 3000,
        action: 'scale_up',
        action_value: 20,
      },
    ];

    const insights = {
      spend: 700000,
      conversions: 300,
      cpc: 2000,
    };

    mockRulesRepo.findActive.mockReturnValue(rules);
    mockMetaApi.getCampaignInsights.mockResolvedValue(insights);
    mockMetaApi.updateCampaign.mockResolvedValue({});

    const result = await optimizer.evaluate();

    expect(result.triggered).toBe(1);
    expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('camp_456', { dailyBudget: expect.any(Number) });
  });

  it('should handle scale_down action', async () => {
    const rules = [
      {
        id: 'rule3',
        name: 'High CPA Scale Down',
        campaign_id: 'camp_789',
        condition_metric: 'cpa',
        condition_operator: '>',
        condition_value: 10000,
        action: 'scale_down',
        action_value: 20,
      },
    ];

    const insights = {
      spend: 140000,
      conversions: 10,
      cpc: 8000,
    };

    mockRulesRepo.findActive.mockReturnValue(rules);
    mockMetaApi.getCampaignInsights.mockResolvedValue(insights);
    mockMetaApi.updateCampaign.mockResolvedValue({});

    const result = await optimizer.evaluate();

    expect(result.triggered).toBe(1);
    const updateCall = mockMetaApi.updateCampaign.mock.calls[0];
    expect(updateCall[0]).toBe('camp_789');
    expect(updateCall[1].dailyBudget).toBeGreaterThanOrEqual(10000);
  });

  it('should skip rules when insights are unavailable', async () => {
    const rules = [
      {
        id: 'rule4',
        name: 'Unreachable Campaign',
        campaign_id: 'camp_999',
        condition_metric: 'cpc',
        condition_operator: '>',
        condition_value: 5000,
        action: 'pause',
        action_value: null,
      },
    ];

    mockRulesRepo.findActive.mockReturnValue(rules);
    mockMetaApi.getCampaignInsights.mockRejectedValue(new Error('Token expired'));

    const result = await optimizer.evaluate();

    expect(result.checked).toBe(1);
    expect(result.triggered).toBe(0);
    expect(mockMetaApi.updateCampaign).not.toHaveBeenCalled();
  });

  it('should handle rule evaluation errors gracefully', async () => {
    const rules = [
      {
        id: 'rule5',
        name: 'Broken Rule',
        campaign_id: 'camp_000',
        condition_metric: 'cpc',
        condition_operator: '>',
        condition_value: 5000,
        action: 'pause',
        action_value: null,
      },
    ];

    mockRulesRepo.findActive.mockReturnValue(rules);
    // Mock to throw error when getting insights
    mockMetaApi.getCampaignInsights.mockRejectedValue(new Error('API Error'));

    const result = await optimizer.evaluate();

    expect(result.checked).toBe(1);
    expect(result.results).toHaveLength(0); // Error is caught silently, rule is skipped
    expect(result.triggered).toBe(0);
  });

  it('should start and stop the optimizer', () => {
    const testOptimizer = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo);
    expect(testOptimizer._interval).toBeNull();

    testOptimizer.start(1000);
    expect(testOptimizer._interval).not.toBeNull();

    testOptimizer.stop();
    expect(testOptimizer._interval).toBeNull();
  });
});
