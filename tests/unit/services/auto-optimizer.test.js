import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutoOptimizer } from '../../../server/services/auto-optimizer.js';
import { MetaAdsAPI } from '../../../server/services/meta/index.js';

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: vi.fn().mockImplementation(function () {
    this.updateCampaign = vi.fn().mockResolvedValue({});
    this.getCampaignInsights = vi.fn();
  }),
}));


// Module-level mock so ESM named exports are writable
vi.mock('../../../server/services/treasuryClient.js', () => ({
  recordToTreasury: vi.fn().mockResolvedValue(true),
  checkWf5Enabled: vi.fn().mockResolvedValue(true),
}));

import { recordToTreasury, checkWf5Enabled } from '../../../server/services/treasuryClient.js';

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

    mockCampaignsRepo = {
      getById: vi.fn().mockImplementation(async (id) => ({
        id,
        name: 'LC_' + id,  // Always return LC_ prefix so scaling is allowed
      })),
    };

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

  it('should skip evaluation when wf5_enabled=false in hub treasury', async () => {
    checkWf5Enabled.mockResolvedValueOnce(false);

    mockRulesRepo.findActive.mockReturnValue([{
      id: 'ruleX', name: 'Should Not Fire', campaign_id: 'camp_111',
      condition_metric: 'cpc', condition_operator: '>', condition_value: 1,
      action: 'pause', action_value: null,
    }]);

    const result = await optimizer.evaluate();

    expect(result.skipped).toBe(true);
    expect(result.checked).toBe(0);
    expect(mockMetaApi.getCampaignInsights).not.toHaveBeenCalled();
  });


  describe('_metaForOwner (multi-tenant)', () => {
    let acctRepo;
    let settingsRepo;

    beforeEach(() => {
      acctRepo = { getByPlatform: vi.fn(), findAllActiveByUserAndPlatform: vi.fn() };
      settingsRepo = { getCredentials: vi.fn() };
    });

    it('returns a fresh owner-scoped Meta instance when the owner has a bound token', () => {
      const opt = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo, null, acctRepo, settingsRepo);
      acctRepo.getByPlatform.mockReturnValue({ user_id: 'owner-1', platform: 'meta', access_token: 'owner-tok-xyz' });
      acctRepo.findAllActiveByUserAndPlatform.mockReturnValue([{ user_id: 'owner-1', platform: 'meta', access_token: 'owner-tok-xyz' }]);

      const meta = opt._metaForOwner({ id: 'c1', user_id: 'owner-1', platform: 'meta' });

      expect(meta).not.toBe(mockMetaApi);
      expect(meta).toBeInstanceOf(MetaAdsAPI);
      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-1', 'meta');
    });

    it('resolves owner via created_by when user_id is absent', () => {
      const opt = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo, null, acctRepo, settingsRepo);
      acctRepo.getByPlatform.mockReturnValue({ user_id: 'owner-2', platform: 'meta', access_token: 'owner-tok-2' });
      acctRepo.findAllActiveByUserAndPlatform.mockReturnValue([{ user_id: 'owner-2', platform: 'meta', access_token: 'owner-tok-2' }]);

      const meta = opt._metaForOwner({ id: 'c2', created_by: 'owner-2', platform: 'meta' });

      expect(meta).not.toBe(mockMetaApi);
      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-2', 'meta');
    });

    it('falls back to the system meta when no owner token is bound', () => {
      const opt = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo, null, acctRepo, settingsRepo);
      acctRepo.getByPlatform.mockReturnValue(null);
      acctRepo.findAllActiveByUserAndPlatform.mockReturnValue([]);

      const meta = opt._metaForOwner({ id: 'c3', user_id: 'owner-3', platform: 'meta' });

      expect(meta).toBe(mockMetaApi);
      expect(acctRepo.findAllActiveByUserAndPlatform).toHaveBeenCalledWith('owner-3', 'meta');
    });

    it('falls back to system meta when no platformAccountsRepo is wired', () => {
      const opt = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo);
      const meta = opt._metaForOwner({ id: 'c4', user_id: 'owner-4', platform: 'meta' });
      expect(meta).toBe(mockMetaApi);
    });
  });

  describe('_executeAction owner threading', () => {
    it('uses the owner-scoped meta (not system) when the owner has a bound token', async () => {
      const acctRepo = { getByPlatform: vi.fn().mockReturnValue({ user_id: 'owner-9', platform: 'meta', access_token: 'owner-tok-9' }), findAllActiveByUserAndPlatform: vi.fn().mockReturnValue([{ user_id: 'owner-9', platform: 'meta', access_token: 'owner-tok-9' }]) };
      const settingsRepo = { getCredentials: vi.fn() };
      const opt = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo, null, acctRepo, settingsRepo);

      const campaign = { id: 'c9', user_id: 'owner-9', platform: 'meta' };
      const spy = vi.spyOn(opt, '_metaForOwner').mockReturnValue(new MetaAdsAPI(settingsRepo, 'owner-tok-9'));
      const ownerMeta = opt._metaForOwner(campaign);
      ownerMeta.updateCampaign = vi.fn().mockResolvedValue({});

      await opt._executeAction('c9', 'pause', null, {}, campaign);

      // System meta must NOT be called — only the owner-scoped instance.
      expect(mockMetaApi.updateCampaign).not.toHaveBeenCalled();
      expect(ownerMeta.updateCampaign).toHaveBeenCalledWith('c9', { status: 'PAUSED' });
      spy.mockRestore();
    });

    it('uses the system meta when no owner token is bound', async () => {
      const acctRepo = { getByPlatform: vi.fn().mockReturnValue(null), findAllActiveByUserAndPlatform: vi.fn().mockReturnValue([]) };
      const settingsRepo = { getCredentials: vi.fn() };
      const opt = new AutoOptimizer(mockMetaApi, mockRulesRepo, mockCampaignsRepo, null, acctRepo, settingsRepo);

      const campaign = { id: 'c10', user_id: 'owner-10', platform: 'meta' };
      const spy = vi.spyOn(opt, '_metaForOwner').mockReturnValue(mockMetaApi);

      await opt._executeAction('c10', 'pause', null, {}, campaign);

      expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('c10', { status: 'PAUSED' });
      spy.mockRestore();
    });
});
});
