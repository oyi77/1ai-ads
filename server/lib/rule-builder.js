/**
 * Rule Builder — Fluent API for creating rules with compound conditions
 */

import { METRICS } from './rule-metrics.js';

export const OPERATORS = {
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  eq: '==',
  neq: '!=',
};

export const LOGIC_OPS = {
  AND: 'and',
  OR: 'or',
};

export class Condition {
  constructor(metric, operator, value, window = '1h') {
    if (!METRICS[metric]) throw new Error(`Unknown metric: ${metric}`);
    if (!Object.values(OPERATORS).includes(operator)) {
      throw new Error(`Invalid operator: ${operator}`);
    }
    this.type = 'leaf';
    this.metric = metric;
    this.operator = operator;
    this.value = value;
    this.window = window;
  }

  static gt(metric, value, window) { return new Condition(metric, '>', value, window); }
  static lt(metric, value, window) { return new Condition(metric, '<', value, window); }
  static gte(metric, value, window) { return new Condition(metric, '>=', value, window); }
  static lte(metric, value, window) { return new Condition(metric, '<=', value, window); }
  static eq(metric, value, window) { return new Condition(metric, '==', value, window); }
  static neq(metric, value, window) { return new Condition(metric, '!=', value, window); }

  toJSON() {
    return { type: 'leaf', metric: this.metric, operator: this.operator, value: this.value, window: this.window };
  }
}

export class ConditionGroup {
  static MAX_DEPTH = 3;

  constructor(logic = 'and', depth = 0) {
    if (!Object.values(LOGIC_OPS).includes(logic)) throw new Error(`Invalid logic: ${logic}`);
    if (depth > ConditionGroup.MAX_DEPTH) throw new Error(`Max compound depth exceeded (${ConditionGroup.MAX_DEPTH})`);
    this.type = 'group';
    this.logic = logic;
    this.depth = depth;
    this.children = [];
  }

  add(condition) {
    if (condition.type === 'group' && condition.depth >= ConditionGroup.MAX_DEPTH) {
      throw new Error(`Cannot add group at depth ${condition.depth}`);
    }
    this.children.push(condition);
    return this;
  }

  static and(depth = 0) { return new ConditionGroup('and', depth); }
  static or(depth = 0) { return new ConditionGroup('or', depth); }

  toJSON() {
    return { type: 'group', logic: this.logic, children: this.children.map(c => c.toJSON()) };
  }
}

export class RuleAction {
  static TYPES = {
    pause: 'pause',
    resume: 'resume',
    scale_budget: 'scale_budget',
    change_bid: 'change_bid',
    notify: 'notify',
    notify_and_pause: 'notify_and_pause',
    auto_allocate: 'auto_allocate',
    dayparting: 'dayparting',
    optimize_creative: 'optimize_creative',
  };

  constructor(type, params = {}) {
    if (!Object.values(RuleAction.TYPES).includes(type)) throw new Error(`Invalid action type: ${type}`);
    this.type = type;
    this.params = params;
  }

  static pause() { return new RuleAction('pause'); }
  static resume() { return new RuleAction('resume'); }
  static scaleBudget(percentage) { return new RuleAction('scale_budget', { percentage }); }
  static changeBid(strategy) { return new RuleAction('change_bid', { strategy }); }
  static notify(message) { return new RuleAction('notify', { message }); }
  static notifyAndPause(message) { return new RuleAction('notify_and_pause', { message }); }

  toJSON() {
    return { type: this.type, params: this.params };
  }
}

export class RuleTemplate {
  constructor(name, description, condition, action, enabled = true, priority = 1) {
    this.name = name;
    this.description = description;
    this.condition = condition;
    this.action = action;
    this.enabled = enabled;
    this.priority = priority;
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      condition: this.condition.toJSON(),
      action: this.action.toJSON(),
      enabled: this.enabled,
      priority: this.priority,
    };
  }
}

export class RuleBuilder {
  constructor() {
    this._name = '';
    this._description = '';
    this._condition = null;
    this._action = null;
    this._enabled = true;
    this._priority = 1;
    this._accountId = null;
  }

  name(n) { this._name = n; return this; }
  description(d) { this._description = d; return this; }
  condition(c) { this._condition = c; return this; }
  action(a) { this._action = a; return this; }
  enabled(e) { this._enabled = e; return this; }
  priority(p) { this._priority = p; return this; }
  accountId(id) { this._accountId = id; return this; }

  build() {
    if (!this._name) throw new Error('Rule name is required');
    if (!this._condition) throw new Error('Rule condition is required');
    if (!this._action) throw new Error('Rule action is required');
    return {
      name: this._name,
      description: this._description,
      condition: this._condition.toJSON ? this._condition.toJSON() : this._condition,
      action: this._action.toJSON ? this._action.toJSON() : this._action,
      enabled: this._enabled,
      priority: this._priority,
      account_id: this._accountId,
    };
  }

  toJSON() { return this.build(); }
}

export const RULE_TEMPLATES = {
  roasGuard: () => new RuleTemplate(
    'ROAS Guard',
    'Pause when ROAS < 1x',
    ConditionGroup.and().add(Condition.lt('roas', 1)).add(Condition.gt('spend', 100000)),
    RuleAction.notifyAndPause('ROAS below 1x! Campaign paused.'),
    true, 5
  ),

  frequencyCap: () => new RuleTemplate(
    'Frequency Cap',
    'Pause when frequency > 5',
    ConditionGroup.and().add(Condition.gt('frequency', 5)).add(Condition.gt('impressions', 10000)),
    RuleAction.notifyAndPause('Frequency too high! Ad fatigue detected.'),
    true, 4
  ),

  highCtrAlert: () => new RuleTemplate(
    'High CTR Alert',
    'Notify when CTR > 5%',
    ConditionGroup.and().add(Condition.gt('ctr', 5)).add(Condition.gt('impressions', 1000)),
    RuleAction.notify('High CTR detected! Consider scaling.'),
    true, 1
  ),

  lowCvrAlert: () => new RuleTemplate(
    'Low CVR Alert',
    'Notify when CVR < 1%',
    ConditionGroup.and().add(Condition.lt('cvr', 1)).add(Condition.gt('clicks', 100)),
    RuleAction.notify('Low CVR detected! Refresh creatives.'),
    true, 1
  ),

  cpcSpike: () => new RuleTemplate(
    'CPC Spike Alert',
    'Notify when CPC > 200',
    ConditionGroup.and().add(Condition.gt('cpc', 200)).add(Condition.gt('clicks', 50)),
    RuleAction.notify('CPC spike detected!'),
    true, 2
  ),

  cpaDrop: () => new RuleTemplate(
    'CPA Optimization',
    'Scale budget when CPA < 50000',
    ConditionGroup.and().add(Condition.lt('cpa', 50000)).add(Condition.gt('conversions', 3)),
    RuleAction.scaleBudget(20),
    true, 1
  ),

  cpmBudgetControl: () => new RuleTemplate(
    'CPM Budget Control',
    'Pause when CPM > 15000',
    ConditionGroup.and().add(Condition.gt('cpm', 15000)).add(Condition.gt('impressions', 5000)),
    RuleAction.notifyAndPause('CPM too high!'),
    true, 3
  ),

  dayparting: () => new RuleTemplate(
    'Dayparting',
    'Scale budget during peak hours',
    ConditionGroup.and().add(Condition.gt('hour_of_day', 18)).add(Condition.lt('hour_of_day', 23)),
    RuleAction.scaleBudget(30),
    true, 2
  ),
};

export default {
  Condition,
  ConditionGroup,
  RuleAction,
  RuleTemplate,
  RuleBuilder,
  RULE_TEMPLATES,
  OPERATORS,
  LOGIC_OPS,
};
