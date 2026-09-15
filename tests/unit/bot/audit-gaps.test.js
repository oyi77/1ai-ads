import { describe, it, expect, vi } from 'vitest';

// Gap audit 2026-09-15: /optimize dieksekusi sebagai /monitor, /platforms
// dieksekusi sebagai /settings, settings:sync stub tanpa sync, budget scale
// bisa turun di bawah lantai FB. Test ini pin kontrak yang disepakati.

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

const { handleMenuButton } =
  await import('../../../server/bot/commands/menu.js');
const { handleSettingsCallback } =
  await import('../../../server/bot/commands/settings.js');
const { MIN_DAILY_BUDGET_IDR } =
  await import('../../../server/bot/commands/ads.js');

function makeCtx(userId = 'u1', match = ['x', 'x']) {
  const replies = [];
  return {
    userId,
    match,
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    answerCbQuery: vi.fn(async () => {}),
    scene: { enter: vi.fn(async () => {}) },
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');

function makeDeps({ stored = [], upsert = null } = {}) {
  return {
    repos: {
      platformAccountsRepo: {
        findByUserId: vi.fn(() => stored),
        findAllActiveByUserAndPlatform: vi.fn((_uid, p) =>
          stored.filter((s) => s.platform === p && s.is_active)),
        getByPlatform: vi.fn(() => null),
      },
      campaignsRepo: {
        findAll: vi.fn(() => ({ data: [], total: 0 })),
        upsert: upsert || vi.fn(),
      },
    },
    services: {},
  };
}

describe('audit gap — kontrak yang disepakati', () => {
  it('lantai budget scale ikut minimal Facebook', () => {
    expect(MIN_DAILY_BUDGET_IDR).toBe(17500);
  });

  it('/optimize tanpa akun: arahkan ke tambah-akun (bukan monitor)', async () => {
    const ctx = makeCtx('u1', ['menu:optimize', 'optimize']);
    await handleMenuButton(makeDeps())(ctx);
    expect(txt(ctx._replies[0])).toContain('➕ Tambah Akun');
  });

  it('/platforms: tampilkan daftar platform (bukan layar settings)', async () => {
    const ctx = makeCtx('u1', ['menu:platforms', 'platforms']);
    await handleMenuButton(makeDeps())(ctx);
    const first = txt(ctx._replies[0]);
    expect(first).toContain('Platform');
    const flat = ctx._replies[0].opts.reply_markup.inline_keyboard.flat()
      .map((b) => b.callback_data).join(' ');
    expect(flat).toContain('platform:meta:connect');
  });

  it('settings:sync narik campaign beneran (bukan stub)', async () => {
    const stored = [{
      id: 'o1', user_id: 'u1', platform: 'meta', is_active: 1,
      account_name: 'K1', credentials: { access_token: 'TOK' },
    }];
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_1', name: 'A1' }]);
    mockGetCampaigns.mockResolvedValue([
      { id: 'c1', name: 'C1', status: 'active', dailyBudget: 50000 },
    ]);
    const upsert = vi.fn();
    const ctx = makeCtx('u1', ['settings:sync', 'sync']);
    await handleSettingsCallback(makeDeps({ stored, upsert }))(ctx);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'meta', campaign_id: 'c1', userId: 'u1',
    }));
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('1 campaign ketarik');
  });
});
