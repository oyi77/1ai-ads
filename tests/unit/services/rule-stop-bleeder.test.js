import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { mockUpdateCampaign, mockMetaCtor } = vi.hoisted(() => ({
  mockUpdateCampaign: vi.fn(),
  mockMetaCtor: vi.fn(),
}));
vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: vi.fn().mockImplementation(function (token) {
    mockMetaCtor(token);
    this.updateCampaign = (...a) => mockUpdateCampaign(...a);
  }),
}));

import { RuleEvaluator } from '../../../server/services/rule-evaluator.js';

// Sellable acceptance: "if spend > 300k AND CTR < 1% then stop the ads".
// Compound {all} rule evaluated against the owner's synced campaign row;
// pause fires on the OWNER's Meta client, never the shared instance.
describe('sellable rule: spend>300k AND ctr<1% → pause', () => {
  let evaluator;
  let sharedApi;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateCampaign.mockResolvedValue({ success: true });
    sharedApi = { updateCampaign: vi.fn() };
    evaluator = new RuleEvaluator(
      {}, {}, { trigger: vi.fn(), markEvaluated: vi.fn(), getAllEnabled: vi.fn(() => []) },
      {},
      {
        metaAdsAPI: sharedApi,
        platformAccountsRepo: {
          findAllActiveByUserAndPlatform: vi.fn(() => [{ access_token: 'owner-tok' }]),
        },
      },
      null,
    );
  });

  // spend 350jt, 1000 clicks / 200000 impressions = 0.5% CTR → both fire
  const bleeder = {
    id: 'c-bleed', campaign_id: 'm-bleed', platform: 'meta', user_id: 'owner-1',
    spend: 350000, impressions: 200000, clicks: 1000, status: 'active',
  };
  const rule = {
    id: 'r-stop', name: 'Stop bleeders',
    condition: { all: [
      { metric: 'spend', operator: 'gt', threshold: 300000 },
      { metric: 'ctr', operator: 'lt', threshold: 1 },
    ] },
    action: { type: 'pause', params: {} },
  };

  it('pauses the bleeder on the owner client', async () => {
    const matched = await evaluator.evaluateRule(rule, bleeder);
    expect(matched).toBe(true);
    expect(mockMetaCtor).toHaveBeenCalledWith('owner-tok');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('m-bleed', { status: 'PAUSED' });
    expect(sharedApi.updateCampaign).not.toHaveBeenCalled();
  });

  it('leaves a healthy campaign running', async () => {
    const healthy = { ...bleeder, id: 'c-ok', spend: 100000, clicks: 5000 }; // 2.5% CTR, low spend
    const matched = await evaluator.evaluateRule(rule, healthy);
    expect(matched).toBe(false);
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });

  it('leaves a high-spend high-CTR campaign running', async () => {
    const winner = { ...bleeder, id: 'c-win', clicks: 10000 }; // 5% CTR
    const matched = await evaluator.evaluateRule(rule, winner);
    expect(matched).toBe(false);
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
  });
});
