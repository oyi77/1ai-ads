import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAdAccounts = vi.fn();
const mockGetCampaigns = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: {
    withToken: vi.fn(() => ({
      getAdAccounts: mockGetAdAccounts,
      getCampaigns: mockGetCampaigns,
    })),
  },
}));

const { handleStatus, handleDashboardCallback, BM_NOTE } =
  await import('../../../server/bot/commands/status.js');

function makeCtx(userId = 'u1', match = ['dash:x', 'x']) {
  const replies = [];
  return {
    userId,
    match,
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    answerCbQuery: async () => {},
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');

function makeDeps({ stored = [], draftsTotal = 0, update = null } = {}) {
  return {
    repos: {
      platformAccountsRepo: {
        findByUserId: vi.fn(() => stored),
        findById: vi.fn((id) => stored.find((s) => s.id === id) || null),
        update: update || vi.fn(),
      },
      draftsRepo: {
        findByUser: vi.fn(() => ({ data: [], total: draftsTotal })),
      },
    },
  };
}

const stored = (over = {}) => ({
  id: 'owner-1',
  user_id: 'u1',
  platform: 'meta',
  account_name: 'Koneksi Utama',
  is_active: 1,
  health_status: 'ok',
  access_token: 'TOK',
  credentials: { access_token: 'TOK' },
  ...over,
});

describe('dashboard pemula — live per-ad-account', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetCampaigns.mockReset();
  });

  it('tanpa koneksi: ajak hubungkan + ada catatan BM', async () => {
    const ctx = makeCtx();
    await handleStatus(makeDeps())(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('Belum ada akun iklan yang terhubung');
    expect(t).toContain('Business Manager');
    expect(BM_NOTE).toContain('Business Manager');
  });

  it('satu token dua akun: hitung aktif/nonaktif/hapus per akun + total + draft', async () => {
    mockGetAdAccounts.mockResolvedValue([
      { id: 'act_A', name: 'Toko A' },
      { id: 'act_B', name: 'Toko B' },
    ]);
    mockGetCampaigns.mockImplementation(async (id) =>
      id === 'act_A'
        ? [{ status: 'active' }, { status: 'paused' }, { status: 'deleted' }]
        : [{ status: 'active' }],
    );
    const ctx = makeCtx();
    await handleStatus(makeDeps({ stored: [stored()], draftsTotal: 2 }))(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('Akun iklan terhubung: <b>2</b>');
    expect(t).toContain('🟢 2 aktif');
    expect(t).toContain('⏸️ 1 nonaktif');
    expect(t).toContain('🗑️ 1 dihapus');
    expect(t).toContain('Draft menunggu persetujuan: <b>2</b>');
    expect(t).toContain('Toko A');
    expect(t).toContain('Toko B');
    expect(t).toContain('Business Manager');
  });

  it('koneksi expired tersimpan: dashboard tetap muat + dihitung bermasalah (TDZ regression)', async () => {
    // Proven live 2026-09-25: deadOwnersPre was used before its declaration, so
    // any user with a health_status='expired' row got "Dashboard gagal dimuat".
    const ctx = makeCtx();
    await handleStatus(makeDeps({ stored: [stored({ health_status: 'expired' })] }))(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('Dashboard Iklan');
    expect(t).toContain('bermasalah');
  });

  it('token mati: tandai + flag health_status expired', async () => {
    const err = new Error('Session has expired');
    err.code = 190;
    mockGetAdAccounts.mockRejectedValue(err);
    const update = vi.fn();
    const ctx = makeCtx();
    await handleStatus(makeDeps({ stored: [stored()], update }))(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('bermasalah');
    expect(update).toHaveBeenCalledWith('owner-1', expect.objectContaining({ health_status: 'expired' }));
  });

  it('tombol tambah-akun bawa catatan BM', async () => {
    const ctx = makeCtx('u1', ['dash:add', 'add']);
    await handleDashboardCallback(makeDeps())(ctx);
    expect(txt(ctx._replies[0])).toContain('Business Manager');
  });
});
