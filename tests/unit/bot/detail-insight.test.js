import { describe, it, expect, vi } from 'vitest';

// AI insight detail: delta vs kemarin, anomali tampil, tag sumber AI,
// tombol aksi. Tidak ada lagi "&amp;" literal.

const mockGetAdAccounts = vi.fn();
const mockBuildReport = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: { withToken: vi.fn(() => ({ getAdAccounts: mockGetAdAccounts })) },
}));

const { handleAdsAccountReport } =
  await import('../../../server/bot/commands/ads.js');

function makeCtx() {
  const replies = [];
  return {
    userId: 'u1',
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    answerCbQuery: vi.fn(async () => {}),
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');
const flatCb = (r) => (r?.opts?.reply_markup?.inline_keyboard || []).flat().map((b) => b.callback_data);

function makeDeps() {
  return {
    repos: {
      platformAccountsRepo: {
        findAllActiveByUserAndPlatform: vi.fn(() => [{ id: 'c', access_token: 'T' }]),
      },
    },
    services: { accountReportService: { buildReport: mockBuildReport } },
  };
}

const AI = {
  source: 'ai', strengths: 'Kuat', weaknesses: 'Lemah',
  opportunities: 'Peluang', actions: 'Aksi', risk: 'Risiko',
};

function report(over = {}) {
  return {
    accountName: 'Toko A',
    summary: { spend: 100000, impressions: 10000, linkClicks: 500, clicks: 500, ctr: 5, purchases: 4, cpr: 25000, cpc: 200, roas: 3, revenue: 300000 },
    comparison: {
      yesterdayFullDay: { spend: 80000, roas: 2 },
      avg7d: { spend: 90000, roas: 2.5 },
    },
    anomalies: [],
    ai: AI,
    ...over,
  };
}

describe('DETAIL insight — delta anomali aksi', () => {
  it('delta spend +25% dan ROAS +50% tampil', async () => {
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'Toko A' }]);
    mockBuildReport.mockResolvedValue(report());
    const ctx = makeCtx();
    await handleAdsAccountReport(makeDeps())(ctx, 'act_1', 'meta');
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('(+25%)');
    expect(last).toContain('(+50%)');
  });

  it('anomali tampil di seksi PERHATIAN (bukan disembunyikan)', async () => {
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'Toko A' }]);
    mockBuildReport.mockResolvedValue(report({ anomalies: ['Spend hari ini Rp 500.000 — 300% di atas rata-rata.'] }));
    const ctx = makeCtx();
    await handleAdsAccountReport(makeDeps())(ctx, 'act_1', 'meta');
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('PERHATIAN');
    expect(last).toContain('300%');
  });

  it('tanpa anomali: tulis Aman eksplisit', async () => {
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'Toko A' }]);
    mockBuildReport.mockResolvedValue(report({ anomalies: [] }));
    const ctx = makeCtx();
    await handleAdsAccountReport(makeDeps())(ctx, 'act_1', 'meta');
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('nggak ada anomali');
  });

  it('fallback rules: tag jujur bukan AI', async () => {
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'Toko A' }]);
    mockBuildReport.mockResolvedValue(report({ ai: { ...AI, source: 'rules' } }));
    const ctx = makeCtx();
    await handleAdsAccountReport(makeDeps())(ctx, 'act_1', 'meta');
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('Analisis otomatis');
    expect(last).not.toContain('&amp;');
  });

  it('tombol: Refresh + Bikin Aturan + Saran AI + Menu (tanpa web_app)', async () => {
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'Toko A' }]);
    mockBuildReport.mockResolvedValue(report());
    const ctx = makeCtx();
    await handleAdsAccountReport(makeDeps())(ctx, 'act_1', 'meta');
    const cb = flatCb(ctx._replies[ctx._replies.length - 1]).join(' ');
    expect(cb).toContain('ads:repacc:meta:act_1');
    expect(cb).toContain('rule:add:start');
    expect(cb).toContain('menu:optimize');
    expect(cb).toContain('quick:menu');
  });
});
