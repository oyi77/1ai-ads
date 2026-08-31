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
      mockCampaignsRepo.findById.mockReturnValue(campaign);
      
      const scaleSpy = vi.spyOn(RuleEvaluator.prototype, '_scaleCampaign').mockResolvedValue();
      
      await evaluator._increaseBudget('c1', 20);
      
      expect(scaleSpy).toHaveBeenCalledWith('c1', 20, 'up');
      
      scaleSpy.mockRestore();
    });

    it('passes undefined when no percentage (default kicks in)', async () => {
      const campaign = { id: 'c1', platform: 'meta', budget: 100000 };
      mockCampaignsRepo.findById.mockReturnValue(campaign);
      
      const scaleSpy = vi.spyOn(RuleEvaluator.prototype, '_scaleCampaign').mockResolvedValue();
      
      await evaluator._increaseBudget('c1');
      
      // JavaScript passes undefined when no arg, default param kicks in
      expect(scaleSpy).toHaveBeenCalledWith('c1', undefined, 'up');
      
      scaleSpy.mockRestore();
    });
  });

  describe('decrease_budget', () => {
    it('calls _scaleCampaign with down direction', async () => {
      const campaign = { id: 'c1', platform: 'meta', budget: 100000 };
      mockCampaignsRepo.findById.mockReturnValue(campaign);
      
      const scaleSpy = vi.spyOn(RuleEvaluator.prototype, '_scaleCampaign').mockResolvedValue();
      
      await evaluator._decreaseBudget('c1', 30);
      
      expect(scaleSpy).toHaveBeenCalledWith('c1', 30, 'down');
      
      scaleSpy.mockRestore();
    });

    it('passes undefined when no percentage (default kicks in)', async () => {
      const campaign = { id: 'c1', platform: 'meta', budget: 100000 };
      mockCampaignsRepo.findById.mockReturnValue(campaign);
      
      const scaleSpy = vi.spyOn(RuleEvaluator.prototype, '_scaleCampaign').mockResolvedValue();
      
      await evaluator._decreaseBudget('c1');
      
      // JavaScript passes undefined when no arg, default param kicks in
      expect(scaleSpy).toHaveBeenCalledWith('c1', undefined, 'down');
      
      scaleSpy.mockRestore();
    });
  });

  describe('duplicate_campaign', () => {
    it('logs duplication intent', async () => {
      const campaign = { id: 'c1', name: 'Test Campaign', platform: 'meta' };
      mockCampaignsRepo.findById.mockReturnValue(campaign);
      
      await expect(evaluator._duplicateCampaign('c1', '_auto_copy')).resolves.not.toThrow();
    });

    it('handles missing campaign gracefully', async () => {
      mockCampaignsRepo.findById.mockReturnValue(null);
      
      await expect(evaluator._duplicateCampaign('missing', '_copy')).resolves.not.toThrow();
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
