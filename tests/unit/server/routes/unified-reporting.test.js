import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {} }),
}));

import { createUnifiedReportingRouter } from '../../../../server/routes/unified-reporting.js';

function createMockReporter() {
  return {
    getUnifiedDashboard: vi.fn(() => ({ ok: true })),
    compareCampaigns: vi.fn(() => [{ campaignId: 'c1', roas: 2.1 }]),
    recommendBudgetAllocation: vi.fn(() => ({ ok: true })),
    getTimeSeries: vi.fn(() => [{ t: '2026-08-01', v: 10 }]),
  };
}

function createApp(reporter) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 'user-1' };
    next();
  });
  app.use('/api/reporting', createUnifiedReportingRouter(reporter));
  return app;
}

describe('unified-reporting router — userId scoping', () => {
  it('GET /compare passes the requesting userId into compareCampaigns', async () => {
    const reporter = createMockReporter();
    const res = await request(createApp(reporter))
      .get('/api/reporting/compare')
      .query({ campaignIds: 'c1,c2', metric: 'roas' });
    expect(res.status).toBe(200);
    expect(reporter.compareCampaigns).toHaveBeenCalledWith(
      ['c1', 'c2'],
      { metric: 'roas' },
      'user-1'
    );
  });

  it('GET /timeseries passes the requesting userId into getTimeSeries', async () => {
    const reporter = createMockReporter();
    const res = await request(createApp(reporter))
      .get('/api/reporting/timeseries')
      .query({ metric: 'spend', granularity: 'daily', days: '7' });
    expect(res.status).toBe(200);
    expect(reporter.getTimeSeries).toHaveBeenCalledWith(
      { metric: 'spend', granularity: 'daily', days: 7 },
      'user-1'
    );
  });

  it('GET /compare returns 400 when campaignIds missing', async () => {
    const reporter = createMockReporter();
    const res = await request(createApp(reporter)).get('/api/reporting/compare');
    expect(res.status).toBe(400);
    expect(reporter.compareCampaigns).not.toHaveBeenCalled();
  });

  it('GET /dashboard passes the requesting userId into getUnifiedDashboard', async () => {
    const reporter = createMockReporter();
    const res = await request(createApp(reporter))
      .get('/api/reporting/dashboard')
      .query({ dateRange: 'last_7d' });
    expect(res.status).toBe(200);
    expect(reporter.getUnifiedDashboard).toHaveBeenCalledWith('user-1', { dateRange: 'last_7d' });
  });
});
