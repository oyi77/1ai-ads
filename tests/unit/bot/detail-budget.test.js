import { describe, it, expect, vi, beforeEach } from 'vitest';

// Uji detail budget/toggle/spend/ROAS: skala naik-turun, lantai FB,
// skip budget 0, ROAS agregat, kegagalan per-campaign.

const mockGetAdAccounts = vi.fn();
const mockGetCampaigns = vi.fn();
const mockGetAccountInsights = vi.fn();
const mockUpdateCampaign = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: {
    withToken: vi.fn(() => ({
      getAdAccounts: mockGetAdAccounts,
      getCampaigns: mockGetCampaigns,
      getAccountInsights: mockGetAccountInsights,
      updateCampaign: mockUpdateCampaign,
    })),
  },
}));

const {
  handleAdsBudgetScale, handleAdsToggle, handleAdsReport,
  MIN_DAILY_BUDGET_IDR,
} = await import('../../../server/bot/commands/ads.js');

function makeCtx(userId = 'u1') {
  const replies = [];
  return {
    userId,
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    answerCbQuery: vi.fn(async () => {}),
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');

function makeDeps() {
  return {
    repos: {
      platformAccountsRepo: {
        findAllActiveByUserAndPlatform: vi.fn(() => [
          { id: 'c1', user_id: 'u1', platform: 'meta', access_token: 'TOK', is_active: 1 },
        ]),
      },
      campaignsRepo: { findByCampaignId: vi.fn(() => null) },
    },
  };
}

describe('DETAIL budget scale — naik turun lantai', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetCampaigns.mockReset();
    mockUpdateCampaign.mockReset();
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'Toko A' }]);
  });

  it('+20%: 50000 → 60000 (semua aktif diskala)', async () => {
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'A', status: 'active', dailyBudget: 50000 },
      { id: 'c2', name: 'B', status: 'active', dailyBudget: 100000 },
    ]);
    const ctx = makeCtx();
    await handleAdsBudgetScale(makeDeps())(ctx, 'meta', 'act_1', 'pct', '1.2');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', { dailyBudget: 60000 });
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c2', { dailyBudget: 120000 });
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('2 campaign aktif');
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('+20%');
  });

  it('-20% (0.8): 50000 → 40000', async () => {
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'A', status: 'active', dailyBudget: 50000 },
    ]);
    const ctx = makeCtx();
    await handleAdsBudgetScale(makeDeps())(ctx, 'meta', 'act_1', 'pct', '0.8');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', { dailyBudget: 40000 });
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('-20%');
  });

  it('lantai FB: 18000 -20% → 17500 (bukan 14400)', async () => {
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'A', status: 'active', dailyBudget: 18000 },
    ]);
    const ctx = makeCtx();
    await handleAdsBudgetScale(makeDeps())(ctx, 'meta', 'act_1', 'pct', '0.8');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', { dailyBudget: MIN_DAILY_BUDGET_IDR });
  });

  it('campaign paused TIDAK ikut diskala', async () => {
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'A', status: 'active', dailyBudget: 50000 },
      { id: 'c2', name: 'B', status: 'paused', dailyBudget: 50000 },
    ]);
    const ctx = makeCtx();
    await handleAdsBudgetScale(makeDeps())(ctx, 'meta', 'act_1', 'pct', '1.2');
    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1);
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', { dailyBudget: 60000 });
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('1 campaign aktif');
  });

  it('budget 0 dilewati (bukan diskala jadi 0)', async () => {
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'A', status: 'active', dailyBudget: 0 },
      { id: 'c2', name: 'B', status: 'active', dailyBudget: 50000 },
    ]);
    const ctx = makeCtx();
    await handleAdsBudgetScale(makeDeps())(ctx, 'meta', 'act_1', 'pct', '1.2');
    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1);
  });

  it('mult ngawur (0.1 / 10 / abc): ditolak tanpa panggil Meta', async () => {
    for (const bad of ['0.1', '10', 'abc', '']) {
      const ctx = makeCtx();
      await handleAdsBudgetScale(makeDeps())(ctx, 'meta', 'act_1', 'pct', bad);
      expect(txt(ctx._replies[0])).toContain('nggak valid');
    }
    expect(mockUpdateCampaign).not.toHaveBeenCalled();
    expect(mockGetCampaigns).not.toHaveBeenCalled();
  });

  it('satu campaign gagal: yang lain tetap jalan, hasil sebut yang sukses', async () => {
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'A', status: 'active', dailyBudget: 50000 },
      { id: 'c2', name: 'B', status: 'active', dailyBudget: 50000 },
    ]);
    mockUpdateCampaign.mockImplementation(async (id) => {
      if (id === 'c1') throw new Error('Meta 400');
      return { success: true };
    });
    const ctx = makeCtx();
    await handleAdsBudgetScale(makeDeps())(ctx, 'meta', 'act_1', 'pct', '1.2');
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('1 campaign aktif');
  });
});

describe('DETAIL toggle — pause resume', () => {
  beforeEach(() => {
    mockUpdateCampaign.mockReset();
    mockUpdateCampaign.mockResolvedValue({ success: true });
  });

  it('pause kirim PAUSED + pesan dimatiin', async () => {
    const ctx = makeCtx();
    await handleAdsToggle(makeDeps())(ctx, 'meta', 'c1', 'pause');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', { status: 'PAUSED' });
    expect(txt(ctx._replies[1])).toContain('dimatiin');
  });

  it('resume kirim ACTIVE + pesan dinyalain', async () => {
    const ctx = makeCtx();
    await handleAdsToggle(makeDeps())(ctx, 'meta', 'c1', 'resume');
    expect(mockUpdateCampaign).toHaveBeenCalledWith('c1', { status: 'ACTIVE' });
    expect(txt(ctx._replies[1])).toContain('dinyalain');
  });

  it('token mati (190): pesan hubungkan ulang, bukan error mentah', async () => {
    const err = new Error('OAuthException');
    err.code = 190;
    mockUpdateCampaign.mockRejectedValue(err);
    const ctx = makeCtx();
    await handleAdsToggle(makeDeps())(ctx, 'meta', 'c1', 'pause');
    expect(txt(ctx._replies[1])).toContain('kedaluwarsa');
    expect(txt(ctx._replies[1])).not.toContain('OAuthException');
  });
});

describe('DETAIL spend ROAS — agregat laporan', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetAccountInsights.mockReset();
    mockGetAdAccounts.mockResolvedValue([
      { id: 'act_A', name: 'Toko A' },
      { id: 'act_B', name: 'Toko B' },
    ]);
  });

  it('jumlahkan 2 akun: spend 300rb, omzet 900rb, ROAS 3.00x', async () => {
    mockGetAccountInsights.mockImplementation(async (id) =>
      id === 'act_A'
        ? { spend: 100000, revenue: 400000, clicks: 100, impressions: 1000 }
        : { spend: 200000, revenue: 500000, clicks: 200, impressions: 2000 },
    );
    const ctx = makeCtx();
    await handleAdsReport(makeDeps())(ctx, 'meta', undefined);
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('300.000');
    expect(last).toContain('900.000');
    expect(last).toContain('ROAS: 3.00x');
    expect(last).toContain('300');
    expect(last).toContain('3.000');
    expect(last).toContain('Toko A');
    expect(last).toContain('Toko B');
  });

  it('satu akun insights null: diskip, total dari yang ada', async () => {
    mockGetAccountInsights.mockImplementation(async (id) =>
      id === 'act_A' ? null : { spend: 200000, revenue: 500000, clicks: 200, impressions: 2000 },
    );
    const ctx = makeCtx();
    await handleAdsReport(makeDeps())(ctx, 'meta', undefined);
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('200.000');
  });

  it('spend 0 semua: ROAS 0.00x tanpa NaN', async () => {
    mockGetAccountInsights.mockResolvedValue({ spend: 0, revenue: 0, clicks: 0, impressions: 0 });
    const ctx = makeCtx();
    await handleAdsReport(makeDeps())(ctx, 'meta', undefined);
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('ROAS: 0.00x');
    expect(last).not.toContain('NaN');
  });
});
