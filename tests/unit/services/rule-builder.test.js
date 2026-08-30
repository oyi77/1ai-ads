import { describe, it, expect } from 'vitest';
import {
  Condition,
  ConditionGroup,
  RuleAction,
  RuleBuilder,
  RULE_TEMPLATES,
} from '../../../server/lib/rule-builder.js';
import { METRICS } from '../../../server/lib/rule-metrics.js';

describe('RuleBuilder', () => {
  describe('Condition', () => {
    it('creates leaf condition', () => {
      const c = new Condition('cvr', '<', 1.5);
      expect(c.toJSON()).toEqual({ type: 'leaf', metric: 'cvr', operator: '<', value: 1.5, window: '1h' });
    });

    it('creates with custom window', () => {
      const c = Condition.gt('ctr', 5, '24h');
      expect(c.window).toBe('24h');
    });

    it('throws on invalid metric', () => {
      expect(() => new Condition('invalid', '>', 0)).toThrow('Unknown metric');
    });

    it('throws on invalid operator', () => {
      expect(() => new Condition('cvr', '??', 0)).toThrow('Invalid operator');
    });
  });

  describe('ConditionGroup', () => {
    it('creates AND group', () => {
      const g = ConditionGroup.and().add(Condition.gt('ctr', 5)).add(Condition.lt('cvr', 2));
      expect(g.logic).toBe('and');
      expect(g.children.length).toBe(2);
    });

    it('creates OR group', () => {
      const g = ConditionGroup.or().add(Condition.gt('spend', 1000)).add(Condition.lt('roas', 1));
      expect(g.logic).toBe('or');
    });

    it('supports nested groups', () => {
      const g = ConditionGroup.and()
        .add(ConditionGroup.or().add(Condition.gt('ctr', 5)).add(Condition.gt('cvr', 3)))
        .add(Condition.gt('impressions', 1000));
      expect(g.children[0].type).toBe('group');
    });

    it('enforces max depth', () => {
      expect(() => new ConditionGroup('and', 4)).toThrow('Max compound depth');
    });
  });

  describe('RuleAction', () => {
    it('creates pause action', () => {
      expect(RuleAction.pause().type).toBe('pause');
    });

    it('creates scale budget action', () => {
      const a = RuleAction.scaleBudget(20);
      expect(a.params.percentage).toBe(20);
    });

    it('throws on invalid type', () => {
      expect(() => new RuleAction('invalid')).toThrow('Invalid action type');
    });
  });

  describe('RuleBuilder', () => {
    it('builds a complete rule', () => {
      const rule = new RuleBuilder()
        .name('My Rule')
        .description('Test rule')
        .condition(ConditionGroup.and().add(Condition.gt('ctr', 5)))
        .action(RuleAction.pause())
        .priority(2)
        .build();

      expect(rule.name).toBe('My Rule');
      expect(rule.condition.type).toBe('group');
      expect(rule.action.type).toBe('pause');
      expect(rule.priority).toBe(2);
    });

    it('throws without name', () => {
      expect(() => new RuleBuilder().build()).toThrow('name is required');
    });

    it('throws without condition', () => {
      expect(() => new RuleBuilder().name('X').build()).toThrow('condition is required');
    });

    it('throws without action', () => {
      expect(() => new RuleBuilder().name('X').condition(ConditionGroup.and()).build()).toThrow('action is required');
    });
  });

  describe('RuleTemplates', () => {
    it('creates ROAS guard template', () => {
      const t = RULE_TEMPLATES.roasGuard();
      expect(t.name).toBe('ROAS Guard');
      expect(t.action.type).toBe('notify_and_pause');
    });

    it('creates frequency cap template', () => {
      const t = RULE_TEMPLATES.frequencyCap();
      expect(t.name).toBe('Frequency Cap');
    });

    it('creates high CTR alert template', () => {
      const t = RULE_TEMPLATES.highCtrAlert();
      expect(t.name).toBe('High CTR Alert');
    });

    it('creates CPC spike template', () => {
      const t = RULE_TEMPLATES.cpcSpike();
      expect(t.name).toBe('CPC Spike Alert');
    });

    it('creates CPA drop template', () => {
      const t = RULE_TEMPLATES.cpaDrop();
      expect(t.name).toBe('CPA Optimization');
    });

    it('creates CPM budget control template', () => {
      const t = RULE_TEMPLATES.cpmBudgetControl();
      expect(t.name).toBe('CPM Budget Control');
    });

    it('creates dayparting template', () => {
      const t = RULE_TEMPLATES.dayparting();
      expect(t.name).toBe('Dayparting');
    });

    it('all templates have valid JSON', () => {
      for (const fn of Object.values(RULE_TEMPLATES)) {
        const t = fn();
        expect(t.toJSON().name).toBeTruthy();
        expect(t.toJSON().condition).toBeDefined();
        expect(t.toJSON().action).toBeDefined();
      }
    });
  });
});

describe('Metrics', () => {
  it('CVR calculates correctly', () => {
    expect(METRICS.cvr.resolve({}, { clicks: 100, conversions: 5 })).toBe(5);
  });

  it('CVR returns 0 when no clicks', () => {
    expect(METRICS.cvr.resolve({}, { clicks: 0, conversions: 5 })).toBe(0);
  });

  it('CTR calculates correctly', () => {
    expect(METRICS.ctr.resolve({}, { impressions: 1000, clicks: 50 })).toBe(5);
  });

  it('CPC calculates correctly', () => {
    expect(METRICS.cpc.resolve({}, { spend: 5000, clicks: 100 })).toBe(50);
  });

  it('CPM calculates correctly', () => {
    expect(METRICS.cpm.resolve({}, { spend: 10000, impressions: 5000 })).toBe(2000);
  });

  it('CPA calculates correctly', () => {
    expect(METRICS.cpa.resolve({}, { spend: 50000, conversions: 10 })).toBe(5000);
  });

  it('Frequency calculates correctly', () => {
    expect(METRICS.frequency.resolve({}, { impressions: 5000, reach: 1000 })).toBe(5);
  });

  it('ROAS calculates correctly', () => {
    expect(METRICS.roas.resolve({}, { spend: 100000, revenue: 350000 })).toBe(3.5);
  });

  it('ROI calculates correctly', () => {
    expect(METRICS.roi.resolve({}, { spend: 100000, revenue: 150000 })).toBe(50);
  });
});
