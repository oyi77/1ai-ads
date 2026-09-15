import { describe, it, expect, vi, beforeEach } from 'vitest';

// Kontrak yang disepakati 2026-09-15:
// - Laporan: pilih KONEKSI → pilih AKUN (live, nama asli Meta) → pilih PERIODE → laporan.
//   "No insight" generik dilarang: pesan kosong harus sebut akun + periode + campaign aktif.
// - Rules: pilih AKUN dulu (langkah 1/5), tiap langkah sebut scope, konfirmasi sebut akun.

const mockGetAdAccounts = vi.fn();
const mockGetCampaigns = vi.fn();
const mockGetAccountInsights = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: {
    withToken: vi.fn(() => ({
      getAdAccounts: mockGetAdAccounts,
      getCampaigns: mockGetCampaigns,
      getAccountInsights: mockGetAccountInsights,
    })),
  },
}));

const { handleDashboardCallback } =
  await import('../../../server/bot/commands/status.js');
const { handleMonitorCallback } =
  await import('../../../server/bot/commands/monitor.js');

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
const flatText = (r) => (r?.opts?.reply_markup?.inline_keyboard || []).flat().map((b) => b.text).join(' | ');

const OWNER = {
  id: 'owner-1', user_id: 'u1', platform: 'meta', account_name: 'Koneksi Utama',
  is_active: 1, health_status: 'ok', access_token: 'TOK', credentials: { access_token: 'TOK' },
};

function statusDeps() {
  return {
    repos: {
      platformAccountsRepo: {
        findByUserId: vi.fn(() => [OWNER]),
        findById: vi.fn(() => OWNER),
        update: vi.fn(),
      },
      draftsRepo: { findByUser: vi.fn(() => ({ data: [], total: 0 })) },
    },
  };
}

describe('laporan — pilih akun + periode', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetCampaigns.mockReset();
    mockGetAccountInsights.mockReset();
    mockGetAdAccounts.mockResolvedValue([
      { id: 'act_A', name: 'Toko A' },
      { id: 'act_B', name: 'Toko B' },
    ]);
    mockGetCampaigns.mockResolvedValue([]);
    mockGetAccountInsights.mockResolvedValue({ spend: 0, revenue: 0, clicks: 0, impressions: 0 });
  });

  it('dash:account → daftar akun live (nama asli), bukan langsung insights', async () => {
    const ctx = makeCtx('u1', ['dash:account:owner-1', 'account:owner-1']);
    await handleDashboardCallback(statusDeps())(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('2</b> akun iklan');
    expect(t).toContain('Pilih akun');
    const cb = flatCb(ctx._replies[0]).join(' ');
    expect(cb).toContain('dash:pick:owner-1:0');
    expect(cb).toContain('dash:pick:owner-1:1');
  });

  it('dash:pick → tanya periode 7/30/90 + tombol menu', async () => {
    const ctx = makeCtx('u1', ['dash:pick:owner-1:0', 'pick:owner-1:0']);
    await handleDashboardCallback(statusDeps())(ctx);
    expect(txt(ctx._replies[0])).toContain('berapa hari');
    const cb = flatCb(ctx._replies[0]).join(' ');
    expect(cb).toContain('dash:rep:owner-1:0:7d');
    expect(cb).toContain('dash:rep:owner-1:0:30d');
    expect(cb).toContain('dash:rep:owner-1:0:90d');
    expect(cb).toContain('quick:menu');
  });

  it('laporan kosong: sebut nama akun + periode + campaign, bukan "no insight"', async () => {
    mockGetCampaigns.mockResolvedValue([{ id: 'c1', name: 'Promo', status: 'active' }]);
    const ctx = makeCtx('u1', ['dash:rep:owner-1:0:7d', 'rep:owner-1:0:7d']);
    await handleDashboardCallback(statusDeps())(ctx);
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('Toko A');
    expect(last).toContain('7 hari');
    expect(last).not.toContain('No insight data');
    expect(last).toContain('Campaign');
    const cb = flatCb(ctx._replies[ctx._replies.length - 1]).join(' ');
    expect(cb).toContain('quick:menu');
    expect(cb).toContain('dash:account:owner-1');
  });

  it('laporan ada data: tampilkan spend + tombol ganti periode + menu', async () => {
    mockGetAccountInsights.mockResolvedValue({ spend: 50000, revenue: 150000, clicks: 100, impressions: 5000 });
    const ctx = makeCtx('u1', ['dash:rep:owner-1:1:30d', 'rep:owner-1:1:30d']);
    await handleDashboardCallback(statusDeps())(ctx);
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('Toko B');
    expect(last).toContain('50.000');
    const cb = flatCb(ctx._replies[ctx._replies.length - 1]).join(' ');
    expect(cb).toContain('dash:rep:owner-1:1:7d');
    expect(cb).toContain('quick:menu');
  });
});

function monitorDeps({ stored = [OWNER], rules = [] } = {}) {
  return {
    repos: {
      platformAccountsRepo: { findByUserId: vi.fn(() => stored) },
      rulesRepo: {
        getAll: vi.fn(() => rules),
        getById: vi.fn((id) => rules.find((r) => r.id === id) || null),
        create: vi.fn((r) => ({ id: 'new-1', ...r })),
        update: vi.fn(),
      },
      campaignsRepo: { upsert: vi.fn() },
    },
  };
}

describe('rules — akun dulu, bukan diam-diam', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_A', name: 'Toko A' }]);
  });

  it('rule:add:start → pilih akun live + Semua Akun + Menu', async () => {
    const ctx = makeCtx('u1', ['rule:add:start', 'add:start']);
    await handleMonitorCallback(monitorDeps())(ctx);
    expect(txt(ctx._replies[0])).toContain('buat akun iklan mana');
    expect(flatText(ctx._replies[0])).toContain('Toko A');
    const cb = flatCb(ctx._replies[0]).join(' ');
    expect(cb).toContain('rule:add:account:act_A');
    expect(cb).toContain('rule:add:account:__all__');
    expect(cb).toContain('quick:menu');
  });

  it('rule dibuat: pesannya sebut nama akun', async () => {
    const deps = monitorDeps();
    const ctx = makeCtx('u1', ['rule:add:interval:15', 'add:interval:15']);
    ctx.session.ruleBuilder = {
      accountId: 'act_A', metric: 'roas', operator: 'lt', value: '1',
      actionType: 'pause', interval: 15,
    };
    await handleMonitorCallback(deps)(ctx);
    const last = txt(ctx._replies[ctx._replies.length - 1]);
    expect(last).toContain('Toko A');
    expect(deps.repos.rulesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'act_A', userId: 'u1' }),
    );
  });

  it('my rules: grup berlabel nama live + tombol Menu', async () => {
    const deps = monitorDeps({
      rules: [{
        id: 'r1', userId: 'u1', accountId: 'act_A', name: 'roas lt 1',
        enabled: 1, intervalMinutes: 15,
        condition: { type: 'leaf', metric: 'roas', operator: '<', value: 1 },
        action: { type: 'pause' },
      }],
    });
    const ctx = makeCtx('u1', ['rule:view:all', 'view:all']);
    await handleMonitorCallback(deps)(ctx);
    expect(txt(ctx._replies[0])).toContain('Toko A');
    expect(flatCb(ctx._replies[0])).toContain('quick:menu');
  });
});
