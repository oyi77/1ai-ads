import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

vi.mock('../../../server/platforms/index.js', () => ({
  getPlatformSync: vi.fn((platform) => {
    return class MockPlatform {
      constructor() {}
      setActiveAccount() {}
    };
  }),
  listPlatformKeys: vi.fn(() => ['meta', 'google', 'tiktok']),
}));

import { AccountReportService, deterministicRecommendations } from '../../../server/services/account-report-service.js';

describe('AccountReportService', () => {
  const summary = { spend: 100000, impressions: 50000, reach: 30000, linkClicks: 800, clicks: 1200, ctr: 1.8, cpc: 125, purchases: 4, cpr: 25000, revenue: 350000, roas: 3.5 };
  const comparison = {
    yesterdayFullDay: { ...summary, spend: 120000, roas: 2.0, revenue: 240000 },
    avg7d: { spend: 90000, purchases: 3, cpr: 30000, roas: 2.5 },
  };

  it('buildReport fetches today/yesterday/7d windows and derives metrics', async () => {
    const metaApi = {
      getAccountInsights: vi.fn(async (_id, { datePreset }) => {
        if (datePreset === 'today') return { spend: 100000, impressions: 50000, clicks: 1200, linkClicks: 800, ctr: 1.8, cpc: 125, conversions: 4, revenue: 350000 };
        if (datePreset === 'yesterday') return { spend: 120000, conversions: 4, revenue: 240000 };
        return { spend: 630000, conversions: 21, revenue: 1575000 };
      }),
    };
    const svc = new AccountReportService({ llmClient: null });
    const report = await svc.buildReport(metaApi, '12345', 'Selow');

    expect(metaApi.getAccountInsights).toHaveBeenCalledTimes(3);
    expect(report.accountId).toBe('12345');
    expect(report.summary.roas).toBeCloseTo(3.5);
    expect(report.comparison.avg7d.spend).toBeCloseTo(90000); // 630k / 7
    expect(report.ai.source).toBe('rules');
    for (const k of ['strengths', 'weaknesses', 'opportunities', 'actions', 'risk']) {
      expect(String(report.ai[k]).length).toBeGreaterThan(0);
    }
  });

  it('uses the LLM when available and falls back to rules on garbage output', async () => {
    // garbage LLM -> fallback
    const bad = new AccountReportService({ llmClient: { call: vi.fn(async () => 'no json here') } });
    const r1 = await bad.generateRecommendations({ accountName: 'X', summary, comparison });
    expect(r1.source).toBe('rules');

    // valid JSON -> ai source with parsed fields
    const good = new AccountReportService({
      llmClient: { call: vi.fn(async () => '{"strengths":"ROAS kuat","weaknesses":"CTR rendah","opportunities":"scale up","actions":"naikkan budget","risk":"data parsial"}') },
    });
    const r2 = await good.generateRecommendations({ accountName: 'X', summary, comparison });
    expect(r2.source).toBe('ai');
    expect(r2.actions).toContain('budget');
  });

  it('deterministic analyst flags burn without purchases and healthy ROAS scaling', () => {
    const burning = deterministicRecommendations(
      { ...summary, purchases: 0, roas: 0.4, revenue: 40000 },
      comparison,
    );
    expect(burning.weaknesses).toContain('ROAS hanya 0.40x');
    expect(burning.risk).toContain('Belum ada purchase');

    const winning = deterministicRecommendations(summary, comparison);
    expect(winning.actions).toMatch(/Naikkan budget/i);
  });
  it('returns unsupported report when platform lacks getAccountInsights', async () => {
    const api = {
      // No getAccountInsights method - simulates Google/TikTok/LinkedIn/etc.
      getCampaigns: vi.fn().mockResolvedValue([]),
    };
    const svc = new AccountReportService({ llmClient: null });
    const report = await svc.buildReport(api, '12345', 'Test Account', { platform: 'google' });

    expect(report.accountId).toBe('12345');
    expect(report.platform).toBe('google');
    expect(report.supported).toBe(false);
    expect(report.reason).toBe('getAccountInsights not implemented');
    expect(report.summary.spend).toBe(0);
    expect(report.anomalies).toEqual([]);
    expect(report.ai).toBeNull();
  });

  it('buildReport works with non-meta platform that implements getAccountInsights', async () => {
    const api = {
      getAccountInsights: vi.fn(async (_id, { datePreset }) => {
        if (datePreset === 'today') return { spend: 50000, impressions: 20000, clicks: 500, linkClicks: 300, ctr: 2.0, cpc: 100, conversions: 2, revenue: 100000 };
        if (datePreset === 'yesterday') return { spend: 40000, conversions: 2, revenue: 80000 };
        return { spend: 300000, conversions: 10, revenue: 500000 };
      }),
    };
    const svc = new AccountReportService({ llmClient: null });
    const report = await svc.buildReport(api, '67890', 'TikTok Account', { platform: 'tiktok' });

    expect(report.accountId).toBe('67890');
    expect(report.platform).toBe('tiktok');
    expect(report.supported).toBeUndefined(); // supported only set to false for unsupported
    expect(report.summary.spend).toBe(50000);
    expect(report.summary.roas).toBeCloseTo(2.0);
  });
});
