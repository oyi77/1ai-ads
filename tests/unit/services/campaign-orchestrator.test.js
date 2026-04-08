import { describe, it, expect, vi } from 'vitest';
import { CampaignOrchestrator } from '../../../server/services/campaign-orchestrator.js';

describe('CampaignOrchestrator', () => {
  const mockMetaApi = {
    createCampaign: vi.fn(),
    createAdSet: vi.fn(),
    createAdCreative: vi.fn(),
    createAd: vi.fn(),
    updateCampaign: vi.fn(),
  };

  const mockCreativeStudio = {
    generateAdPackage: vi.fn(),
  };

  const orchestrator = new CampaignOrchestrator(mockMetaApi, mockCreativeStudio);

  it('should create a CampaignOrchestrator instance with dependencies', () => {
    expect(orchestrator).toBeInstanceOf(CampaignOrchestrator);
    expect(orchestrator.meta).toBe(mockMetaApi);
    expect(orchestrator.creative).toBe(mockCreativeStudio);
  });

  it('should create a full campaign successfully', async () => {
    const mockAiResult = {
      copies: [
        {
          model: '1',
          model_name: 'P.A.S',
          hook: 'Stop losing money on ads',
          body: 'Our AI optimization saves you 40% on ad spend',
          cta: 'Learn More',
          headline: 'Save 40% Now',
          description: 'AI-powered optimization',
        },
      ],
      imageDirections: [],
      videoScript: null,
      targetingSuggestions: {
        interests: [{ id: '1', name: 'Digital marketing' }],
        ageRange: { min: 25, max: 45 },
        locations: ['Indonesia'],
      },
    };

    mockCreativeStudio.generateAdPackage.mockResolvedValue(mockAiResult);
    mockMetaApi.createCampaign.mockResolvedValue({ id: 'camp_123' });
    mockMetaApi.createAdSet.mockResolvedValue({ id: 'adset_456' });
    mockMetaApi.createAdCreative.mockResolvedValue({ id: 'creative_789' });
    mockMetaApi.createAd.mockResolvedValue({ id: 'ad_999' });

    const result = await orchestrator.createFullCampaign({
      accountId: 'act_123',
      pageId: 'page_456',
      product: 'AI Ad Optimizer',
      target: 'Business owners',
      keunggulan: '40% cost reduction',
      objective: 'OUTCOME_TRAFFIC',
      dailyBudget: 50000,
      landingUrl: 'https://example.com',
    });

    expect(result.status).toBe('created');
    expect(result.campaignId).toBe('camp_123');
    expect(result.adsetId).toBe('adset_456');
    expect(result.creativeId).toBe('creative_789');
    expect(result.adId).toBe('ad_999');
    expect(result.message).toContain('PAUSED');
    expect(result.steps).toHaveLength(5);
    expect(result.steps.every(s => s.status === 'done')).toBe(true);
  });

  it('should map objectives to optimization goals', () => {
    expect(orchestrator._objectiveToOptimization('OUTCOME_TRAFFIC')).toBe('LINK_CLICKS');
    expect(orchestrator._objectiveToOptimization('OUTCOME_SALES')).toBe('OFFSITE_CONVERSIONS');
    expect(orchestrator._objectiveToOptimization('OUTCOME_LEADS')).toBe('LEAD_GENERATION');
    expect(orchestrator._objectiveToOptimization('OUTCOME_AWARENESS')).toBe('REACH');
  });

  it('should map objectives to CTA types', () => {
    expect(orchestrator._objectiveToCTA('OUTCOME_TRAFFIC')).toBe('LEARN_MORE');
    expect(orchestrator._objectiveToCTA('OUTCOME_SALES')).toBe('SHOP_NOW');
    expect(orchestrator._objectiveToCTA('OUTCOME_LEADS')).toBe('SIGN_UP');
  });

  it('should activate a campaign', async () => {
    mockMetaApi.updateCampaign.mockResolvedValue({ id: 'camp_123', status: 'ACTIVE' });
    await orchestrator.activateCampaign('camp_123');
    expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('camp_123', { status: 'ACTIVE' });
  });

  it('should pause a campaign', async () => {
    mockMetaApi.updateCampaign.mockResolvedValue({ id: 'camp_123', status: 'PAUSED' });
    await orchestrator.pauseCampaign('camp_123');
    expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('camp_123', { status: 'PAUSED' });
  });

  it('should scale campaign budget', async () => {
    mockMetaApi.updateCampaign.mockResolvedValue({ id: 'camp_123', dailyBudget: 75000 });
    await orchestrator.scaleBudget('camp_123', 75000);
    expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('camp_123', { dailyBudget: 75000 });
  });

  it('should handle campaign creation errors and cleanup', async () => {
    mockCreativeStudio.generateAdPackage.mockResolvedValue({
      copies: [{ hook: 'Test', body: 'Test', cta: 'Test' }],
    });
    mockMetaApi.createCampaign.mockResolvedValue({ id: 'camp_123' });
    mockMetaApi.createAdSet.mockRejectedValue(new Error('API Error'));
    mockMetaApi.updateCampaign.mockResolvedValue({});

    const result = await orchestrator.createFullCampaign({
      accountId: 'act_123',
      pageId: 'page_456',
      product: 'Test Product',
      target: 'Test Target',
      keunggulan: 'Test Benefit',
      dailyBudget: 50000,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBeTruthy();
    expect(mockMetaApi.updateCampaign).toHaveBeenCalledWith('camp_123', { status: 'DELETED' });
  });
});
