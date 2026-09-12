/**
 * Shared rule-condition evaluator.
 *
 * The rule UIs and templates have emitted four different condition shapes over
 * time, and they all live in `autonomous_rules` at the same time:
 *
 *   1. bot group:    {type:'group', logic:'and'|'or', children:[{type:'leaf', metric, operator, value}]}
 *   2. web compound: {all:[...]} / {any:[...]}           (nested, e.g. "QA Compound v3")
 *   3. legacy flat:  {metric, operator:'gt'|'lt'|..., threshold}
 *   4. status:       {type:'status', operator:'=', value:'ACTIVE'}
 *
 * Both engines (RuleEvaluator and the bot scheduler's rule-guard cron) MUST
 * evaluate these identically. Previously each handled a different subset, so a
 * rule that worked in one engine silently never fired in the other - and stored
 * `operator:'gt'` rules never fired anywhere.
 */

import { compare } from './operators.js';
import { METRICS } from './rule-metrics.js';

/**
 * Maximum nesting depth for compound conditions. Shared so both engines agree:
 * a rule that matches in one engine must match in the other.
 */
export const MAX_CONDITION_DEPTH = 3;

/** Operator spellings the rule UIs emit, mapped to the comparison table. */
const OPERATOR_ALIASES = {
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  eq: '==',
  '=': '==',
};

/**
 * Normalize a stored operator. Unknown spellings pass through so compare()
 * rejects them (rather than silently comparing with a different operator).
 */
export function normalizeOperator(op) {
  if (op === undefined || op === null || op === '') return '==';
  return OPERATOR_ALIASES[String(op)] || String(op);
}

/**
 * Resolve a leaf metric to a comparable value.
 * Derived metrics (ctr, cvr, cpc, cpm, cpa, roi, frequency, ...) are not
 * columns on `campaigns`, so they must go through the METRICS table; reading
 * them off the row yielded undefined -> 0 and the comparison could never be true.
 *
 * @returns {number|string|boolean|undefined} metric value, or undefined when the
 *   metric is unknown (callers treat that as non-matching).
 */
export function resolveMetricValue(metric, campaign, insights) {
  if (!metric) return undefined;
  const def = METRICS[metric];
  if (def && typeof def.resolve === 'function') {
    const v = def.resolve(campaign, insights || campaign?.insights || campaign?.stats || {});
    return Number.isFinite(v) ? v : (Number(v) || 0);
  }
  const raw = campaign?.[metric];
  if (raw === undefined || raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

/** Numeric thresholds often arrive as strings; `==` would never match them. */
function coerceThreshold(value, threshold) {
  if (typeof value === 'number' && typeof threshold === 'string' && threshold.trim() !== '') {
    const n = Number(threshold);
    return Number.isFinite(n) ? n : threshold;
  }
  return threshold;
}

/** True when the condition names a metric this codebase does not know. */
export function isUnknownMetric(condition) {
  if (!condition || typeof condition !== 'object') return false;
  if (condition.type === 'group' || condition.all || condition.any) return false;
  const metric = condition.metric || condition.type;
  return Boolean(metric) && metric !== 'status' && !METRICS[metric];
}

/**
 * Evaluate a leaf: `{metric, operator, value}` or the legacy flat shape where
 * `type` carries the metric name.
 */
function evaluateLeaf(condition, campaign) {
  const metric = condition.metric || condition.type;
  const threshold = condition.value !== undefined ? condition.value : condition.threshold;
  // Status is an enum whose casing differs by producer: Meta sync stores
  // 'active'/'paused' while the rule UIs store 'ACTIVE'. A strict compare made
  // every status rule permanently unable to fire.
  if (metric === 'status') {
    return String(campaign?.status ?? '').toLowerCase() === String(threshold ?? '').toLowerCase();
  }
  const value = resolveMetricValue(metric, campaign);
  if (value === undefined) return false;
  return compare(value, normalizeOperator(condition.operator), coerceThreshold(value, threshold));
}

/**
 * Evaluate a rule condition against a campaign row.
 * @param {object} condition - parsed autonomous_rules.condition_json
 * @param {object} campaign - campaigns row (or hydrated campaign)
 * @param {number} [depth] - current recursion depth
 * @param {number} [maxDepth] - nesting bound (defaults to MAX_CONDITION_DEPTH)
 * @returns {boolean}
 */
export function evaluateCondition(condition, campaign, depth = 0, maxDepth = MAX_CONDITION_DEPTH) {
  if (!condition || typeof condition !== 'object') return false;
  if (depth > maxDepth) return false;

  // Shape 1: bot group {type:'group', logic, children}
  if (condition.type === 'group') {
    const children = Array.isArray(condition.children) ? condition.children : [];
    if (children.length === 0) return false;
    const every = condition.logic !== 'or';
    return every
      ? children.every((c) => evaluateCondition(c, campaign, depth + 1, maxDepth))
      : children.some((c) => evaluateCondition(c, campaign, depth + 1, maxDepth));
  }

  // Shape 2: web compound {all:[...]} / {any:[...]}
  if (Array.isArray(condition.all) || Array.isArray(condition.any)) {
    const all = Array.isArray(condition.all) ? condition.all : [];
    const any = Array.isArray(condition.any) ? condition.any : [];
    if (all.length === 0 && any.length === 0) return false;
    if (!all.every((c) => evaluateCondition(c, campaign, depth + 1, maxDepth))) return false;
    if (any.length === 0) return true;
    return any.some((c) => evaluateCondition(c, campaign, depth + 1, maxDepth));
  }

  // Shapes 3 and 4: flat leaf.
  return evaluateLeaf(condition, campaign);
}

export default evaluateCondition;
