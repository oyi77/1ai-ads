import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { RuleEvaluator } from '../../../server/services/rule-evaluator.js';

describe('RuleEvaluator — new actions', () => {
  let evaluator;
  let mockCampaignsRepo;

  beforeEach(() => {
    mockCampaignsRepo = {
      findById: vi.fn(),
      findAll: vi.fn(() => []),
    };

    evaluator = new RuleEvaluator(
      {},
      mockCampaignsRepo,
      {},
      {},
      {},
      null
    );
  });

  describe('increase_budget', () => {
    it('calls _scaleCampaign with up direction', async () => {
      const campaign = { id: 'c1', platform: 'meta', budget: 100000 };

      const scaleSpy = vi.spyOn(RuleEvaluator.prototype, '_scaleCampaign').mockResolvedValue();

      await evaluator._increaseBudget(campaign, 20);

      expect(scaleSpy).toHaveBeenCalledWith(campaign, 20, 'up');

      scaleSpy.mockRestore();
    });

    it('passes undefined when no percentage (default kicks in)', async () => {
      const campaign = { id: 'c1', platform: 'meta', budget: 100000 };

      const scaleSpy = vi.spyOn(RuleEvaluator.prototype, '_scaleCampaign').mockResolvedValue();

      await evaluator._increaseBudget(campaign);

      // JavaScript passes undefined when no arg, default param kicks in
      expect(scaleSpy).toHaveBeenCalledWith(campaign, undefined, 'up');

      scaleSpy.mockRestore();
    });
  });

  describe('decrease_budget', () => {
    it('calls _scaleCampaign with down direction', async () => {
      const campaign = { id: 'c1', platform: 'meta', budget: 100000 };

      const scaleSpy = vi.spyOn(RuleEvaluator.prototype, '_scaleCampaign').mockResolvedValue();

      await evaluator._decreaseBudget(campaign, 30);

      expect(scaleSpy).toHaveBeenCalledWith(campaign, 30, 'down');

      scaleSpy.mockRestore();
    });

    it('passes undefined when no percentage (default kicks in)', async () => {
      const campaign = { id: 'c1', platform: 'meta', budget: 100000 };

      const scaleSpy = vi.spyOn(RuleEvaluator.prototype, '_scaleCampaign').mockResolvedValue();

      await evaluator._decreaseBudget(campaign);

      // JavaScript passes undefined when no arg, default param kicks in
      expect(scaleSpy).toHaveBeenCalledWith(campaign, undefined, 'down');

      scaleSpy.mockRestore();
    });
  });

  describe('duplicate_campaign', () => {
    it('calls the owner Meta duplicateCampaign and returns the new id', async () => {
      const campaign = { id: 'c1', campaign_id: 'meta_1', name: 'Test Campaign', platform: 'meta' };
      const duplicateCampaign = vi.fn(async () => ({ newCampaignId: 'meta_2' }));
      vi.spyOn(evaluator, '_platformApiForOwner').mockReturnValue({ duplicateCampaign });

      const result = await evaluator._duplicateCampaign(campaign, '_auto_copy');

      expect(duplicateCampaign).toHaveBeenCalledWith(null, 'meta_1', { suffix: '_auto_copy' });
      expect(result.newCampaignId).toBe('meta_2');
    });

    it('skips platforms without duplicateCampaign support', async () => {
      const campaign = { id: 'c9', name: 'T', platform: 'tiktok' };
      vi.spyOn(evaluator, '_platformApiForOwner').mockReturnValue({});

      await expect(evaluator._duplicateCampaign(campaign, '_copy')).resolves.toBeUndefined();
    });

    it('handles missing campaign gracefully', async () => {
      await expect(evaluator._duplicateCampaign(null, '_copy')).resolves.not.toThrow();
      await expect(evaluator._duplicateCampaign({ }, '_copy')).resolves.not.toThrow();
    });
  });


  describe('ACTION_HANDLERS', () => {
    it('has handler for increase_budget', () => {
      expect(RuleEvaluator.ACTION_HANDLERS.increase_budget).toBeDefined();
    });

    it('has handler for decrease_budget', () => {
      expect(RuleEvaluator.ACTION_HANDLERS.decrease_budget).toBeDefined();
    });

    it('has handler for duplicate_campaign', () => {
      expect(RuleEvaluator.ACTION_HANDLERS.duplicate_campaign).toBeDefined();
    });

    it('has handler for pause', () => {
      expect(RuleEvaluator.ACTION_HANDLERS.pause).toBeDefined();
    });

    it('has handler for resume', () => {
      expect(RuleEvaluator.ACTION_HANDLERS.resume).toBeDefined();
    });

    it('has handler for notify', () => {
      expect(RuleEvaluator.ACTION_HANDLERS.notify).toBeDefined();
    });

    it('has handler for notify_and_pause', () => {
      expect(RuleEvaluator.ACTION_HANDLERS.notify_and_pause).toBeDefined();
    });
  });
});
