import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { RuleEvaluator } from '../../../server/services/rule-evaluator.js';

function makeEvaluator() {
  return new RuleEvaluator(
    {}, // settingsRepo
    {}, // campaignsRepo
    {}, // rulesRepo
    {}, // llmClient
    {}, // platformApis
    null // draftService
  );
}

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

describe('RuleEvaluator — compound conditions', () => {
  it('legacy single-condition leaf evaluates via new format', () => {
    const ev = makeEvaluator();
    const cond = { type: 'leaf', metric: 'roas', operator: '<', value: 1.5, window: '1h' };
    expect(ev._evaluateCondition(cond, campaign)).toBe(true);
  });

  it('AND group requires all children true', () => {
    const ev = makeEvaluator();
    const cond = {
      type: 'group',
      logic: 'and',
      children: [
        { type: 'leaf', metric: 'roas', operator: '<', value: 1.5, window: '1h' },
        { type: 'leaf', metric: 'spend', operator: '>', value: 100, window: '1h' },
      ],
    };
    expect(ev._evaluateCondition(cond, campaign)).toBe(true);

    const cond2 = {
      type: 'group',
      logic: 'and',
      children: [
        { type: 'leaf', metric: 'roas', operator: '<', value: 1.5, window: '1h' },
        { type: 'leaf', metric: 'spend', operator: '>', value: 1000, window: '1h' },
      ],
    };
    expect(ev._evaluateCondition(cond2, campaign)).toBe(false);
  });

  it('OR group requires any child true', () => {
    const ev = makeEvaluator();
    const cond = {
      type: 'group',
      logic: 'or',
      children: [
        { type: 'leaf', metric: 'roas', operator: '>', value: 5, window: '1h' },
        { type: 'leaf', metric: 'spend', operator: '>', value: 100, window: '1h' },
      ],
    };
    expect(ev._evaluateCondition(cond, campaign)).toBe(true);
  });

  it('nested groups evaluate recursively', () => {
    const ev = makeEvaluator();
    const cond = {
      type: 'group',
      logic: 'and',
      children: [
        {
          type: 'group',
          logic: 'or',
          children: [
            { type: 'leaf', metric: 'spend', operator: '>', value: 400, window: '1h' },
            { type: 'leaf', metric: 'impressions', operator: '>', value: 50000, window: '1h' },
          ],
        },
        { type: 'leaf', metric: 'roas', operator: '<', value: 1.5, window: '1h' },
      ],
    };
    expect(ev._evaluateCondition(cond, campaign)).toBe(true);
  });

  it('empty group is non-matching, unknown metric is non-matching', () => {
    const ev = makeEvaluator();
    expect(ev._evaluateCondition({ type: 'group', logic: 'and', children: [] }, campaign)).toBe(false);
    expect(ev._evaluateCondition({ type: 'leaf', metric: 'unknown', operator: '>', value: 1 }, campaign)).toBe(false);
  });

  it('depth is bounded at MAX_COMPOUND_DEPTH', () => {
    const ev = makeEvaluator();
    let deep = { type: 'leaf', metric: 'roas', operator: '<', value: 99 };
    for (let i = 0; i < 10; i++) deep = { type: 'group', logic: 'and', children: [deep] };
    expect(ev._evaluateCondition(deep, campaign)).toBe(false);
  });

  it('CVR metric resolves correctly', () => {
    const ev = makeEvaluator();
    const cond = { type: 'leaf', metric: 'cvr', operator: '>', value: 0, window: '1h' };
    expect(ev._evaluateCondition(cond, campaign)).toBe(true); // 5/300*100 = 1.67% > 0
  });

  it('CPM metric resolves correctly', () => {
    const ev = makeEvaluator();
    const cond = { type: 'leaf', metric: 'cpm', operator: '>', value: 0, window: '1h' };
    expect(ev._evaluateCondition(cond, campaign)).toBe(true); // 500/20000*1000 = 25 > 0
  });
});
