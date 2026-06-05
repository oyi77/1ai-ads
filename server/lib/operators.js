/**
 * Shared comparison operators for rule evaluation.
 * Used by AutoOptimizer and RuleEvaluator (and any future rule engines).
 */
export const OPERATORS = {
  '>':  (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<':  (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '==': (a, b) => a === b,
  '===': (a, b) => a === b,
  '!==': (a, b) => a !== b,
};

/**
 * Evaluate a comparison using the shared operator map.
 * @param {*} value - The actual metric value
 * @param {string} operator - One of the OPERATORS keys
 * @param {*} threshold - The target value to compare against
 * @returns {boolean}
 */
export function compare(value, operator, threshold) {
  const op = OPERATORS[operator];
  return op ? op(value, threshold) : false;
}