import { describe, it, expect, vi, beforeEach } from 'vitest';

// Uji detail A-Z: tiap handler dipanggil dengan data realistis, tiap angka,
// label, dan tombol diverifikasi satu per satu. Mock Meta penuh.

const mockGetAdAccounts = vi.fn();
const mockGetCampaigns = vi.fn();
const mockGetAccountInsights = vi.fn();
const mockGetMultiCampaignInsights = vi.fn();
const mockUpdateCampaign = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: {
    withToken: vi.fn(() => ({
      getAdAccounts: mockGetAdAccounts,
      getCampaigns: mockGetCampaigns,
      getAccountInsights: mockGetAccountInsights,
      getMultiCampaignInsights: mockGetMultiCampaignInsights,
      updateCampaign: mockUpdateCampaign,
    })),
  },
}));

const { handleStatus, handleDashboardCallback } =
  await import('../../../server/bot/commands/status.js');

function makeCtx(userId = 'u1', match = ['dash:x', 'x']) {
  const replies = [];
  return {
    userId,
    match,
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    answerCbQuery: vi.fn(async () => {}),
    session: {},
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');
const flatCb = (r) => (r?.opts?.reply_markup?.inline_keyboard || []).flat().map((b) => b.callback_data);
const flatText = (r) => (r?.opts?.reply_markup?.inline_keyboard || []).flat().map((b) => b.text);

const OWNER = (over = {}) => ({
  id: 'owner-1', user_id: 'u1', platform: 'meta', account_name: 'Koneksi Toko',
  is_active: 1, health_status: 'ok', access_token: 'TOK', credentials: { access_token: 'TOK' },
  ...over,
});

function statusDeps({ stored = [OWNER()], draftsTotal = 0 } = {}) {
  return {
    repos: {
      platformAccountsRepo: {
        findByUserId: vi.fn(() => stored),
        findById: vi.fn((id) => stored.find((s) => s.id === id) || null),
        update: vi.fn(),
      },
      draftsRepo: { findByUser: vi.fn(() => ({ data: [], total: draftsTotal })) },
    },
  };
}

describe('DETAIL dashboard — angka per akun', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetCampaigns.mockReset();
  });

  it('hitung aktif/nonaktif/hapus per akun dengan benar (2 akun, 5 campaign)', async () => {
    mockGetAdAccounts.mockResolvedValue([
      { id: 'act_A', name: 'Toko A' },
      { id: 'act_B', name: 'Toko B' },
    ]);
    mockGetCampaigns.mockImplementation(async (id) =>
      id === 'act_A'
        ? [
          { id: 'c1', name: 'Promo', status: 'active' },
          { id: 'c2', name: 'Katalog', status: 'active' },
          { id: 'c3', name: 'Retarget', status: 'paused' },
          { id: 'c4', name: 'Lama', status: 'deleted' },
        ]
        : [{ id: 'c5', name: 'Brand', status: 'active' }],
    );
    const ctx = makeCtx();
    await handleStatus(statusDeps({ draftsTotal: 3 }))(ctx);
    const t = txt(ctx._replies[0]);
    // Total: 5 campaign, 3 aktif, 1 nonaktif, 1 hapus
    expect(t).toContain('Akun iklan terhubung: <b>2</b>');
    expect(t).toContain('Campaign total: <b>5</b>');
    expect(t).toContain('🟢 3 aktif');
    expect(t).toContain('⏸️ 1 nonaktif');
    expect(t).toContain('🗑️ 1 dihapus');
    expect(t).toContain('Draft menunggu persetujuan: <b>3</b>');
    // Per akun: A = 2/1/1, B = 1/0/0
    expect(t).toContain('Toko A — 🟢 2 aktif • ⏸️ 1 nonaktif • 🗑️ 1 hapus (total 4)');
    expect(t).toContain('Toko B — 🟢 1 aktif • ⏸️ 0 nonaktif • 🗑️ 0 hapus (total 1)');
    expect(t).toContain('Business Manager');
  });

  it('dua koneksi token berbeda: hitung koneksi token dengan benar', async () => {
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_X', name: 'Akun X' }]);
    mockGetCampaigns.mockResolvedValue([{ id: 'c1', status: 'active' }]);
    const stored = [OWNER(), OWNER({ id: 'owner-2', account_name: 'Koneksi 2', access_token: 'TOK2', credentials: { access_token: 'TOK2' } })];
    const ctx = makeCtx();
    await handleStatus(statusDeps({ stored }))(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('(dari 2 koneksi token)');
    // Tombol per koneksi dengan jumlah akun
    const texts = flatText(ctx._replies[0]).join(' ');
    expect(texts).toContain('Koneksi Toko');
    expect(texts).toContain('Koneksi 2');
  });

  it('token sama di dua koneksi: dedup jadi 1 sapuan', async () => {
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_X', name: 'X' }]);
    mockGetCampaigns.mockResolvedValue([]);
    const stored = [OWNER(), OWNER({ id: 'owner-2', account_name: 'Duplikat' })];
    const ctx = makeCtx();
    await handleStatus(statusDeps({ stored }))(ctx);
    expect(mockGetAdAccounts).toHaveBeenCalledTimes(1);
    expect(txt(ctx._replies[0])).toContain('(dari 1 koneksi token)');
  });

  it('token mati: tandai + flag expired + tetap tampil akun lain', async () => {
    const err = new Error('Session has expired');
    err.code = 190;
    mockGetAdAccounts.mockRejectedValue(err);
    const update = vi.fn();
    const deps = statusDeps();
    deps.repos.platformAccountsRepo.update = update;
    const ctx = makeCtx();
    await handleStatus(deps)(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('1 koneksi token bermasalah');
    expect(t).toContain('Akun iklan terhubung: <b>0</b>');
    expect(update).toHaveBeenCalledWith('owner-1', expect.objectContaining({ health_status: 'expired' }));
  });
});

describe('DETAIL laporan — periode dan isi', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetCampaigns.mockReset();
    mockGetAccountInsights.mockReset();
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_A', name: 'Toko A' }]);
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'Promo Lebaran', status: 'active' },
      { id: 'c2', name: 'Katalog', status: 'paused' },
    ]);
  });

  it('periode 7d teruskan datePreset last_7d ke Meta', async () => {
    mockGetAccountInsights.mockResolvedValue({ spend: 100000, revenue: 300000, clicks: 100, impressions: 1000 });
    const ctx = makeCtx('u1', ['dash:rep:owner-1:0:7d', 'rep:owner-1:0:7d']);
    await handleDashboardCallback(statusDeps())(ctx);
    expect(mockGetAccountInsights).toHaveBeenCalledWith('act_A', { datePreset: 'last_7d' });
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('(7 hari)');
    expect(last).toContain('Rp 100.000');
    expect(last).toContain('ROAS: 3.00x');
  });

  it('periode 90d teruskan last_90d + tombol ganti ke 7/30', async () => {
    mockGetAccountInsights.mockResolvedValue({ spend: 1000000, revenue: 2000000, clicks: 500, impressions: 5000 });
    const ctx = makeCtx('u1', ['dash:rep:owner-1:0:90d', 'rep:owner-1:0:90d']);
    await handleDashboardCallback(statusDeps())(ctx);
    expect(mockGetAccountInsights).toHaveBeenCalledWith('act_A', { datePreset: 'last_90d' });
    const cb = flatCb(ctx._replies[ctx._replies.length - 1]).join(' ');
    expect(cb).toContain('dash:rep:owner-1:0:7d');
    expect(cb).toContain('dash:rep:owner-1:0:30d');
    expect(cb).not.toContain('dash:rep:owner-1:0:90d');
  });

  it('spend 0 tapi impresi ada: tetap tampil (bukan pesan kosong)', async () => {
    mockGetAccountInsights.mockResolvedValue({ spend: 0, revenue: 0, clicks: 0, impressions: 500 });
    const ctx = makeCtx('u1', ['dash:rep:owner-1:0:30d', 'rep:owner-1:0:30d']);
    await handleDashboardCallback(statusDeps())(ctx);
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('500');
    expect(last).not.toContain('Belum ada belanja');
  });

  it('insights null + campaign aktif: sarankan periode panjang + list campaign', async () => {
    mockGetAccountInsights.mockResolvedValue(null);
    const ctx = makeCtx('u1', ['dash:rep:owner-1:0:7d', 'rep:owner-1:0:7d']);
    await handleDashboardCallback(statusDeps())(ctx);
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('Toko A');
    expect(last).toContain('7 hari');
    expect(last).toContain('90 hari');
    expect(last).toContain('Promo Lebaran');
  });

  it('insights null + nol campaign: ajak bikin campaign', async () => {
    mockGetAccountInsights.mockResolvedValue(null);
    mockGetCampaigns.mockResolvedValue([]);
    const ctx = makeCtx('u1', ['dash:rep:owner-1:0:7d', 'rep:owner-1:0:7d']);
    await handleDashboardCallback(statusDeps())(ctx);
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('Buat Campaign');
  });
});
