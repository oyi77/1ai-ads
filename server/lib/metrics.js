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
    const path = req.route?.path || req.path || 'unknown';
    recordHttpRequest(req.method, path, res.statusCode, duration);
  });
  next();
}

/** Prometheus text format output. */
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

  return lines.join('\n') + '\n';
}
