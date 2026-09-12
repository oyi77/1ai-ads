import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  normalizeOperator,
  resolveMetricValue,
  isUnknownMetric,
  MAX_CONDITION_DEPTH,
} from '../../../server/lib/rule-condition.js';

// A campaign row shaped like the `campaigns` table plus resolved metrics.
const campaign = {
  id: 'c1',
  name: 'Camp',
  status: 'active',
  spend: 500,
  impressions: 20000,
  clicks: 300,
  conversions: 5,
  revenue: 100,
  roas: 0.2,
  ctr: 1.5,
  frequency: 4.5,
};

describe('evaluateCondition — stored condition schemas', () => {
  it('evaluates the bot group schema (type:group + leaf children)', () => {
    const cond = {
      type: 'group',
      logic: 'and',
      children: [
        { type: 'leaf', metric: 'roas', operator: '<', value: 1, window: '1h' },
        { type: 'leaf', metric: 'spend', operator: '>', value: 100 },
      ],
    };
    expect(evaluateCondition(cond, campaign)).toBe(true);
    // One child false => AND group false.
    expect(evaluateCondition(
      { ...cond, children: [cond.children[0], { type: 'leaf', metric: 'spend', operator: '>', value: 10000 }] },
      campaign,
    )).toBe(false);
  });

  it('evaluates the web compound schema (all/any) with nesting', () => {
    // This exact shape exists in production as "QA Compound v3"; the bot's
    // evaluator used to ignore it entirely.
    const cond = {
      all: [{ type: 'roas', operator: '<', value: 1.5 }],
      any: [{ type: 'frequency', operator: '>', value: 4 }, { type: 'ctr', operator: '<', value: 1 }],
    };
    expect(evaluateCondition(cond, campaign)).toBe(true);
    // `all` failing short-circuits the whole condition.
    expect(evaluateCondition({ ...cond, all: [{ type: 'roas', operator: '>', value: 1.5 }] }, campaign)).toBe(false);
    // `any` with no child true fails.
    expect(evaluateCondition(
      { all: [{ type: 'roas', operator: '<', value: 1.5 }], any: [{ type: 'ctr', operator: '<', value: 0.1 }] },
      campaign,
    )).toBe(false);
  });

  it('evaluates the legacy flat schema using threshold', () => {
    expect(evaluateCondition({ metric: 'spend', operator: 'gt', threshold: 0 }, campaign)).toBe(true);
    expect(evaluateCondition({ metric: 'spend', operator: 'gt', threshold: 9999 }, campaign)).toBe(false);
  });

  it('compares a numeric threshold stored as a string', () => {
    expect(evaluateCondition({ metric: 'spend', operator: '==', threshold: '500' }, campaign)).toBe(true);
  });

  it('resolves derived metrics instead of reading a missing column', () => {
    // ctr/cvr/cpc are not columns on `campaigns`; reading them off the row made
    // every derived-metric rule unsatisfiable.
    expect(evaluateCondition({ type: 'leaf', metric: 'ctr', operator: '>', value: 1 }, campaign)).toBe(true);
    expect(evaluateCondition({ type: 'leaf', metric: 'cvr', operator: '>', value: 0 }, campaign)).toBe(true);
  });

  it('returns false for empty, null and unknown-metric conditions', () => {
    expect(evaluateCondition(null, campaign)).toBe(false);
    expect(evaluateCondition(undefined, campaign)).toBe(false);
    expect(evaluateCondition({ type: 'group', logic: 'and', children: [] }, campaign)).toBe(false);
    expect(evaluateCondition({ all: [], any: [] }, campaign)).toBe(false);
    expect(evaluateCondition({ type: 'leaf', metric: 'nope', operator: '>', value: 0 }, campaign)).toBe(false);
  });

  it('bounds compound nesting depth', () => {
    let deep = { type: 'leaf', metric: 'roas', operator: '<', value: 1 };
    for (let i = 0; i < 10; i++) deep = { type: 'group', logic: 'and', children: [deep] };
    expect(evaluateCondition(deep, campaign)).toBe(false);
    expect(MAX_CONDITION_DEPTH).toBe(3);
  });
});

describe('evaluateCondition — status casing', () => {
  it('matches status regardless of casing between row and rule', () => {
    // Meta sync stores 'active'/'paused'; the rule UIs store 'ACTIVE'.
    expect(evaluateCondition({ type: 'status', operator: '=', value: 'ACTIVE' }, campaign)).toBe(true);
    expect(evaluateCondition({ type: 'status', operator: '=', value: 'active' }, campaign)).toBe(true);
    expect(evaluateCondition({ type: 'status', operator: '=', value: 'PAUSED' }, campaign)).toBe(false);
    expect(evaluateCondition({ type: 'status', operator: '=', value: 'ACTIVE' }, { ...campaign, status: 'paused' })).toBe(false);
  });
});

describe('normalizeOperator', () => {
  it('maps the UI spellings onto the comparison table', () => {
    expect(normalizeOperator('gt')).toBe('>');
    expect(normalizeOperator('lt')).toBe('<');
    expect(normalizeOperator('gte')).toBe('>=');
    expect(normalizeOperator('lte')).toBe('<=');
    expect(normalizeOperator('eq')).toBe('==');
    expect(normalizeOperator('=')).toBe('==');
  });

  it('passes through symbols and an empty operator', () => {
    expect(normalizeOperator('>')).toBe('>');
    expect(normalizeOperator('')).toBe('==');
    expect(normalizeOperator(undefined)).toBe('==');
  });

  it('keeps an unknown operator so compare() rejects it', () => {
    expect(normalizeOperator('~=')).toBe('~=');
    expect(evaluateCondition({ metric: 'spend', operator: '~=', value: 1 }, campaign)).toBe(false);
  });
});

describe('resolveMetricValue / isUnknownMetric', () => {
  it('returns undefined for metrics that cannot be resolved', () => {
    expect(resolveMetricValue('nope', campaign)).toBeUndefined();
    expect(resolveMetricValue(undefined, campaign)).toBeUndefined();
  });

  it('flags unknown metrics but not known or compound conditions', () => {
    expect(isUnknownMetric({ metric: 'nope' })).toBe(true);
    expect(isUnknownMetric({ metric: 'roas' })).toBe(false);
    expect(isUnknownMetric({ type: 'status', value: 'ACTIVE' })).toBe(false);
    expect(isUnknownMetric({ type: 'group', children: [] })).toBe(false);
    expect(isUnknownMetric({ all: [] })).toBe(false);
  });
});
