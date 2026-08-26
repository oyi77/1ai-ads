import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { RuleEvaluator } from '../../../server/services/rule-evaluator.js';

function makeEvaluator() {
  return new RuleEvaluator({
    rulesRepo: {},
    campaignsRepo: {},
    adsRepo: {},
    settingsRepo: {},
    draftService: null,
  });
}

const campaign = {
  id: 'c1',
  name: 'Camp',
  status: 'ACTIVE',
  stats: { roas: 1.2, spend: 500, cpm: 20, ctr: 1.4, clicks: 300, impressions: 20000, frequency: 3.2, purchases: 5, cpc: 1.6 },
};

describe('RuleEvaluator — compound conditions', () => {
  it('legacy single-condition leaf still evaluates (back-compat)', () => {
    const ev = makeEvaluator();
    expect(ev._evaluateCondition({ type: 'roas', operator: '<', value: 1.5 }, campaign)).toBe(true);
    expect(ev._evaluateCondition({ type: 'roas', operator: '>', value: 1.5 }, campaign)).toBe(false);
  });

  it('all-group = AND', () => {
    const ev = makeEvaluator();
    const cond = { all: [
      { type: 'roas', operator: '<', value: 1.5 },
      { type: 'spend', operator: '>', value: 100 },
    ]};
    expect(ev._evaluateCondition(cond, campaign)).toBe(true);
    expect(ev._evaluateCondition({ all: [
      { type: 'roas', operator: '<', value: 1.5 },
      { type: 'spend', operator: '>', value: 1000 },
    ]}, campaign)).toBe(false);
  });

  it('any-group = OR', () => {
    const ev = makeEvaluator();
    const cond = { any: [
      { type: 'frequency', operator: '>', value: 4 },
      { type: 'ctr', operator: '<', value: 2 },
    ]};
    expect(ev._evaluateCondition(cond, campaign)).toBe(true); // ctr 1.4 < 2
  });

  it('nested groups evaluate recursively', () => {
    const ev = makeEvaluator();
    const cond = { all: [
      { any: [
        { type: 'frequency', operator: '>', value: 4 },
        { type: 'spend', operator: '>', value: 400 },
      ]},
      { type: 'roas', operator: '<', value: 1.5 },
      { all: [
        { type: 'status', operator: '==', value: 'ACTIVE' },
        { type: 'clicks', operator: '>', value: 100 },
      ]},
    ]};
    expect(ev._evaluateCondition(cond, campaign)).toBe(true);
  });

  it('empty group and unknown metric are non-matching, depth is bounded', () => {
    const ev = makeEvaluator();
    expect(ev._evaluateCondition({ all: [] }, campaign)).toBe(false);
    expect(ev._evaluateCondition({ any: [] }, campaign)).toBe(false);
    expect(ev._evaluateCondition({ type: 'unknown_metric', operator: '>', value: 1 }, campaign)).toBe(false);

    // infinite nesting attempt: depth-capped at MAX_COMPOUND_DEPTH
    let deep = { type: 'roas', operator: '<', value: 99 };
    for (let i = 0; i < 10; i++) deep = { all: [deep] };
    // roas 1.2 < 99 = true at leaf; the outermost groups beyond depth return false
    expect(ev._evaluateCondition(deep, campaign)).toBe(false);
  });

  it('evaluateRule parses JSON condition strings with compound shape', async () => {
    const ev = makeEvaluator();
    const rule = {
      condition: JSON.stringify({ all: [
        { type: 'spend', operator: '>', value: 100 },
        { type: 'purchases', operator: '>', value: 3 },
      ]}),
      action: JSON.stringify({ type: 'pause' }),
    };
    const spy = vi.spyOn(ev, '_executeAction').mockResolvedValue({ ok: true });
    await ev.evaluateRule(rule, campaign);
    expect(spy).toHaveBeenCalled();
  });
});
