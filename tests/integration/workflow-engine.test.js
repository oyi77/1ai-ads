/**
 * Workflow Engine Integration Tests
 *
 * Tests IKLAN_WORKFLOW coverage:
 * - Daily check → campaign monitoring
 * - 3-day evaluation → scale/stop/continue
 * - Weekly cycle → action routing
 * - Profitability calculation → safety gate
 * - Stoploss → ROAS drop cascade
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateProfit, evaluateROAS, getCampaignStatus, shouldScale, shouldStop, generateReport } from '../../server/services/profitability-calculator.js';
import { calculateRoasDrop, detectRoasDrop, evaluateStoploss, canIncreaseBudget } from '../../server/services/stoploss-engine.js';
import { ScaleManager } from '../../server/services/scale-manager.js';

// ─── Profitability Calculator ───

describe('ProfitabilityCalculator', () => {
  it('calculates profit with 6% tax', () => {
    // Commission 500rb, Spend 200rb → Profit = 500rb - (200rb × 1.06) = 500rb - 212rb = 288rb
    const profit = calculateProfit(500_000, 200_000);
    expect(profit).toBe(288_000);
  });

  it('calculates loss correctly', () => {
    // Commission 100rb, Spend 200rb → Profit = 100rb - 212rb = -112rb
    const profit = calculateProfit(100_000, 200_000);
    expect(profit).toBeLessThan(0);
  });

  it('evaluates ROAS', () => {
    expect(evaluateROAS(500_000, 200_000)).toBe(2.5);
    expect(evaluateROAS(0, 200_000)).toBe(0);
    expect(evaluateROAS(100, 0)).toBe(Infinity);
    expect(evaluateROAS(0, 0)).toBe(0);
  });

  it('determines campaign status', () => {
    expect(getCampaignStatus(500_000, 200_000)).toBe('PROFITABLE');
    expect(getCampaignStatus(212_000, 200_000)).toBe('BREAKEVEN');
    expect(getCampaignStatus(100_000, 200_000)).toBe('RUGI');
  });

  it('scale-up: ROAS >= 2, CTR > 2%, CPC <= 120', () => {
    expect(shouldScale({ roas: 2.5, ctr: 3, cpc: 100 })).toBe(true);
    expect(shouldScale({ roas: 1.5, ctr: 3, cpc: 100 })).toBe(false); // ROAS too low
    expect(shouldScale({ roas: 2.5, ctr: 1, cpc: 100 })).toBe(false); // CTR too low
    expect(shouldScale({ roas: 2.5, ctr: 3, cpc: 150 })).toBe(false); // CPC too high
  });

  it('stop-loss: ROAS < 1 after 3 days', () => {
    expect(shouldStop(0.5, 3)).toBe(true);
    expect(shouldStop(0.5, 2)).toBe(false); // Not enough days
    expect(shouldStop(1.5, 3)).toBe(false); // ROAS OK
  });

  it('generates formatted report', () => {
    const report = generateReport({
      product: 'Test Product',
      day: 3,
      totalDays: 3,
      spend: 200_000,
      commission: 500_000,
    });
    expect(report).toContain('Test Product');
    expect(report).toContain('PROFITABLE');
    expect(report).toContain('SCALE UP');
  });
});

// ─── Stoploss Engine ───

describe('StoplossEngine', () => {
  it('calculates ROAS drop percentage', () => {
    expect(calculateRoasDrop(2.0, 3.0)).toBeCloseTo(0.333); // 33% drop
    expect(calculateRoasDrop(3.0, 3.0)).toBe(0); // No drop
    expect(calculateRoasDrop(4.0, 3.0)).toBeLessThan(0); // Improvement
  });

  it('detects ROAS drop exceeding 30% threshold', () => {
    const result = detectRoasDrop(2.0, 3.0);
    expect(result.dropped).toBe(true);
    expect(result.exceedsThreshold).toBe(true); // 33% > 30%
  });

  it('does not flag small drops', () => {
    const result = detectRoasDrop(2.8, 3.0);
    expect(result.dropped).toBe(true);
    expect(result.exceedsThreshold).toBe(false); // 6.7% < 30%
  });

  it('stoploss: wait after first drop', () => {
    const result = evaluateStoploss({
      currentROAS: 2.0,
      previousROAS: 3.0,
      consecutiveDrops: 1,
      alreadyReducedBudget: false,
      currentDailyBudget: 200_000,
    });
    expect(result.action).toBe('WAIT');
  });

  it('stoploss: reduce budget after 2 drops', () => {
    const result = evaluateStoploss({
      currentROAS: 2.0,
      previousROAS: 3.0,
      consecutiveDrops: 2,
      alreadyReducedBudget: false,
      currentDailyBudget: 200_000,
    });
    expect(result.action).toBe('REDUCE_BUDGET');
    expect(result.newBudget).toBe(100_000); // 50% cut
  });

  it('stoploss: kill after 3 consecutive drops', () => {
    const result = evaluateStoploss({
      currentROAS: 2.0,
      previousROAS: 3.0,
      consecutiveDrops: 3,
      alreadyReducedBudget: true,
      currentDailyBudget: 100_000,
    });
    expect(result.action).toBe('KILL');
  });

  it('blocks budget increase when ROAS dropping', () => {
    expect(canIncreaseBudget(true).allowed).toBe(false);
    expect(canIncreaseBudget(false).allowed).toBe(true);
  });
});

// ─── Scale Manager ───

describe('ScaleManager', () => {
  let scaleManager;
  let mockMetaApi;
  let mockLlmClient;

  beforeEach(() => {
    mockMetaApi = {
      getCampaigns: vi.fn().mockResolvedValue([{
        id: 'camp_123',
        name: 'Test Campaign',
        objective: 'OUTCOME_TRAFFIC',
        daily_budget: 200_000,
      }]),
      createCampaign: vi.fn().mockResolvedValue({ id: 'new_camp_456' }),
      createAdSet: vi.fn().mockResolvedValue({ id: 'adset_789' }),
    };
    mockLlmClient = {
      generate: vi.fn().mockResolvedValue('["Sephora", "Wardah", "The Ordinary"]'),
    };
    scaleManager = new ScaleManager(mockMetaApi, mockLlmClient);
  });

  it('evaluates scale eligibility', () => {
    const eligible = scaleManager.evaluateScaleEligibility({ roas: 2.5, ctr: 3, cpc: 100 });
    expect(eligible.canScale).toBe(true);

    const notEligible = scaleManager.evaluateScaleEligibility({ roas: 1.5, ctr: 1, cpc: 200 });
    expect(notEligible.canScale).toBe(false);
  });

  it('discovers budget cap through ladder', () => {
    const result = scaleManager.discoverBudgetCap(200_000, false);
    expect(result.action).toBe('INCREASE');
    expect(result.newBudget).toBe(500_000);
  });

  it('blocks budget increase when ROAS dropping', () => {
    const result = scaleManager.discoverBudgetCap(200_000, true);
    expect(result.action).toBe('HOLD');
  });

  it('generates hidden interests via LLM', async () => {
    const interests = await scaleManager.expandHiddenInterests('Serum Wajah', ['kecantikan']);
    expect(interests).toEqual(['Sephora', 'Wardah', 'The Ordinary']);
    expect(mockLlmClient.generate).toHaveBeenCalled();
  });
});
