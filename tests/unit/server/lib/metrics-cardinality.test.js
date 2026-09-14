import { describe, expect, it } from 'vitest';
import { metricsMiddleware, getMetricsText } from '../../../../server/lib/metrics.js';

function reqWith(routePath) {
  return { method: 'GET', route: routePath ? { path: routePath } : undefined, path: '/probe-xyz' };
}

function resWith(status = 200) {
  const handlers = {};
  return {
    statusCode: status,
    on: (ev, fn) => {
      handlers[ev] = fn;
    },
    _finish: () => handlers.finish(),
  };
}

/**
 * Cardinality guard (fixed 2026-09-14): unmatched paths (no req.route)
 * used to become permanent per-URL series labels — attacker-controlled
 * unbounded memory growth (5 random paths -> 15 series). They now
 * collapse to a single `unmatched` label; real routes keep patterns.
 */
describe('metricsMiddleware cardinality guard', () => {
  it('labels matched routes with their pattern', async () => {
    const req = reqWith('/campaigns/:id');
    const res = resWith(200);
    let nexted = false;
    metricsMiddleware(req, res, () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    res._finish();
    const text = getMetricsText();
    expect(text).toMatch(/path="\/campaigns\/:id"/);
  });

  it('collapses unmatched paths to a single label', async () => {
    for (const p of ['/probe-aaa-1', '/probe-bbb-2']) {
      const req = { method: 'GET', route: undefined, path: p };
      const res = resWith(404);
      metricsMiddleware(req, res, () => {});
      res._finish();
    }
    const text = getMetricsText();
    expect(text).not.toMatch(/probe-aaa-1/);
    expect(text).not.toMatch(/probe-bbb-2/);
    expect(text).toMatch(/path="unmatched"/);
  });
});
