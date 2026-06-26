import { describe, it, expect } from 'vitest';
import {
  calculateEffectiveCost, calculateProfit, evaluateROAS, getCampaignStatus,
  evaluateMetrics, shouldScale, shouldStop, shouldReviewCreative, generateReport,
  calculateRoasDrop, detectRoasDrop, evaluateStoploss, canIncreaseBudget,
  evaluateScaleEligibility, discoverBudgetCap,
  ROAS_THRESHOLDS, METRIC_THRESHOLDS,
} from '../../../server/domain/optimization.js';

describe('Domain: Optimization', () => {
  describe('Profitability', () => {
    it('calculateEffectiveCost includes 6% platform tax', () => {
      expect(calculateEffectiveCost(100000)).toBe(106000);
    });

    it('calculateProfit subtracts effective cost from commission', () => {
      expect(calculateProfit(150000, 100000)).toBe(150000 - 106000);
    });

    it('evaluateROAS returns commission/effectiveCost', () => {
      const roas = evaluateROAS(212000, 100000);
      expect(roas).toBeCloseTo(2.0, 1);
    });

    it('getCampaignStatus classifies correctly', () => {
      expect(getCampaignStatus(300000, 100000)).toBe('WINNING');   // ROAS ~2.83
      expect(getCampaignStatus(120000, 100000)).toBe('PROFITABLE'); // ROAS ~1.13
      expect(getCampaignStatus(80000, 100000)).toBe('MARGINAL');    // ROAS ~0.75
      expect(getCampaignStatus(50000, 100000)).toBe('LOSING');      // ROAS ~0.47
    });

    it('evaluateMetrics returns complete metrics object', () => {
      const m = evaluateMetrics(200000, 100000);
      expect(m).toHaveProperty('roas');
      expect(m).toHaveProperty('profit');
      expect(m).toHaveProperty('status');
      expect(m).toHaveProperty('commission');
      expect(m).toHaveProperty('spend');
    });

    it('shouldScale requires ROAS >= 2 AND CTR >= 2% AND CPC <= 120', () => {
      expect(shouldScale({ roas: 2.5, ctr: 3, cpc: 100 })).toBe(true);
      expect(shouldScale({ roas: 1.5, ctr: 3, cpc: 100 })).toBe(false); // ROAS too low
      expect(shouldScale({ roas: 2.5, ctr: 1, cpc: 100 })).toBe(false); // CTR too low
      expect(shouldScale({ roas: 2.5, ctr: 3, cpc: 150 })).toBe(false); // CPC too high
    });

    it('shouldStop requires 3+ days and ROAS < 0.7', () => {
      expect(shouldStop(0.5, 4)).toBe(true);
      expect(shouldStop(0.5, 2)).toBe(false); // Not enough days
      expect(shouldStop(0.8, 4)).toBe(false); // ROAS too high
    });
  });

  describe('Stoploss', () => {
    it('calculateRoasDrop returns percentage', () => {
      expect(calculateRoasDrop(2.0, 3.0)).toBeCloseTo(0.333, 2);
    });

    it('calculateRoasDrop returns null when previousROAS is 0', () => {
      expect(calculateRoasDrop(2.0, 0)).toBeNull();
    });

    it('detectRoasDrop detects threshold breach', () => {
      const drop = detectRoasDrop(1.0, 2.0);
      expect(drop.dropped).toBe(true);
      expect(drop.exceedsThreshold).toBe(true); // 50% drop > 30%
    });

    it('evaluateStoploss returns WAIT on first drop', () => {
      const result = evaluateStoploss({
        currentROAS: 1.0, previousROAS: 2.0,
        consecutiveDrops: 0, alreadyReducedBudget: false, currentDailyBudget: 500000,
      });
      expect(result.action).toBe('WAIT');
    });

    it('evaluateStoploss returns REDUCE_BUDGET on second drop', () => {
      const result = evaluateStoploss({
        currentROAS: 1.0, previousROAS: 2.0,
        consecutiveDrops: 1, alreadyReducedBudget: false, currentDailyBudget: 500000,
      });
      expect(result.action).toBe('REDUCE_BUDGET');
      expect(result.newBudget).toBe(250000);
    });

    it('evaluateStoploss returns KILL after 3 consecutive drops', () => {
      const result = evaluateStoploss({
        currentROAS: 1.0, previousROAS: 2.0,
        consecutiveDrops: 3, alreadyReducedBudget: true, currentDailyBudget: 250000,
      });
      expect(result.action).toBe('KILL');
    });

    it('canIncreaseBudget blocks when ROAS dropping', () => {
      expect(canIncreaseBudget(true).allowed).toBe(false);
      expect(canIncreaseBudget(false).allowed).toBe(true);
    });
  });

  describe('Scale Manager', () => {
    it('evaluateScaleEligibility checks all criteria', () => {
      const eligible = evaluateScaleEligibility({ roas: 2.5, ctr: 3, cpc: 100 });
      expect(eligible.canScale).toBe(true);

      const notEligible = evaluateScaleEligibility({ roas: 1.0, ctr: 1, cpc: 200 });
      expect(notEligible.canScale).toBe(false);
      expect(notEligible.reason).toContain('ROAS');
    });

    it('discoverBudgetCap advances ladder when ROAS stable', () => {
      const result = discoverBudgetCap(200000, false);
      expect(result.nextBudget).toBe(500000);
    });

    it('discoverBudgetCap holds when ROAS dropping', () => {
      const result = discoverBudgetCap(200000, true);
      expect(result.nextBudget).toBe(200000);
    });
  });
});
