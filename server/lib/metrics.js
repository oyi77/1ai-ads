/**
 * Prometheus Metrics — Lightweight counters/histograms without prom-client dependency.
 *
 * Exposes /metrics in Prometheus text format.
 * Use prom-client if installed, otherwise fall back to manual counters.
 */

const counters = {
  http_requests_total: {},
  http_request_duration_seconds_sum: {},
  http_request_duration_seconds_count: {},
  db_query_duration_seconds_sum: 0,
  db_query_duration_seconds_count: 0,
  active_connections: 0,
};

function labelsKey(method, path, status) {
  return `method="${method}",path="${path}",status="${status}"`;
}

/** Record an HTTP request. */
export function recordHttpRequest(method, path, status, durationMs) {
  const key = labelsKey(method, path, status);
  counters.http_requests_total[key] = (counters.http_requests_total[key] || 0) + 1;
  counters.http_request_duration_seconds_sum[key] = (counters.http_request_duration_seconds_sum[key] || 0) + (durationMs / 1000);
  counters.http_request_duration_seconds_count[key] = (counters.http_request_duration_seconds_count[key] || 0) + 1;
}

/** Record a DB query duration. */
export function recordDbQuery(durationMs) {
  counters.db_query_duration_seconds_sum += durationMs / 1000;
  counters.db_query_duration_seconds_count += 1;
}

/** Track active connections. */
export function setActiveConnections(n) {
  counters.active_connections = n;
}

/** Express middleware that records request metrics. */
export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    // Cardinality guard: 404s have no req.route, so the raw path (attacker-
    // controlled, unbounded: /probe-xyz...) would create one permanent series
    // per unique path (proven 2026-09-14: 5 random paths -> 15 series that
    // never expire). Collapse all unmatched paths to a single label.
    const path = req.route?.path || 'unmatched';
    recordHttpRequest(req.method, path, res.statusCode, duration);
  });
  next();
}

/** Prometheus text format output. Sync — cardinality-guard tests call without await. */
export function getMetricsText() {
  const lines = [];

  // http_requests_total
  lines.push('# HELP http_requests_total Total HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  for (const [labels, value] of Object.entries(counters.http_requests_total)) {
    lines.push(`http_requests_total{${labels}} ${value}`);
  }

  // http_request_duration_seconds
  lines.push('# HELP http_request_duration_seconds HTTP request duration');
  lines.push('# TYPE http_request_duration_seconds summary');
  for (const [labels, sum] of Object.entries(counters.http_request_duration_seconds_sum)) {
    const count = counters.http_request_duration_seconds_count[labels] || 0;
    lines.push(`http_request_duration_seconds_sum{${labels}} ${sum.toFixed(6)}`);
    lines.push(`http_request_duration_seconds_count{${labels}} ${count}`);
  }

  // db_query_duration_seconds
  lines.push('# HELP db_query_duration_seconds DB query duration');
  lines.push('# TYPE db_query_duration_seconds summary');
  lines.push(`db_query_duration_seconds_sum ${counters.db_query_duration_seconds_sum.toFixed(6)}`);
  lines.push(`db_query_duration_seconds_count ${counters.db_query_duration_seconds_count}`);

  // active_connections
  lines.push('# HELP active_connections Current active connections');
  lines.push('# TYPE active_connections gauge');
  lines.push(`active_connections ${counters.active_connections}`);

  // Business metrics use prom-client v15's async Registry.metrics() API.
  // They are appended by the async /metrics route; keep this legacy helper
  // synchronous for existing cardinality tests and library callers.
  return lines.join('\n') + '\n';
}

// ────────────────────────────────────────────────────────────────────────────
// DEF-14 Business Metrics (prom-client)
// Domain-level counters/gauges exposed alongside the HTTP/DB metrics above.
// All .inc()/.set() call sites must wrap in try/catch — a metrics failure
// must never propagate into the business logic it instruments.
// ────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import pc from 'prom-client';

const businessRegistry = new pc.Registry();
const { Counter, Gauge } = pc;

/** sha256-truncated (first 8 hex chars) — never emit a raw user_id. */
export function hashUserId(userId) {
  if (userId === undefined || userId === null) return 'unknown';
  return crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 8);
}

export const campaignSpendTotal = new Counter({
  name: 'adforge_campaign_spend_total',
  help: 'Total campaign spend recorded, in account currency.',
  labelNames: ['platform', 'user_id_hash'],
  registers: [businessRegistry],
});

export const revenueTotal = new Counter({
  name: 'adforge_revenue_total',
  help: 'Total campaign revenue recorded, in account currency.',
  labelNames: ['platform', 'user_id_hash'],
  registers: [businessRegistry],
});

export const ruleFiresTotal = new Counter({
  name: 'adforge_rule_fires_total',
  help: 'Total rule actions fired, by action_type and platform.',
  labelNames: ['action_type', 'platform'],
  registers: [businessRegistry],
});

export const webhookDlqDepth = new Gauge({
  name: 'adforge_webhook_dlq_depth',
  help: 'Webhook events sitting in dead-letter (processed=2) after the latest batch.',
  registers: [businessRegistry],
});

export const autonomousActionsTotal = new Counter({
  name: 'adforge_autonomous_actions_total',
  help: 'Autonomous rule actions by result: executed / blocked_allowlist / blocked_live_flag / error.',
  labelNames: ['result'],
  registers: [businessRegistry],
});

/** Render the business metrics in Prometheus text format. */
export async function getBusinessMetricsText() {
  return await businessRegistry.metrics();
}

/** Safe-increment helper — never lets a metrics failure break the caller. */
function safeInc(metric, labels, value = 1) {
  try {
    metric.inc(labels, value);
  } catch { /* observability must not break business */ }
}

export { safeInc };
