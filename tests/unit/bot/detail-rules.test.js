import { describe, it, expect, vi, beforeEach } from 'vitest';

// Uji detail rules: rantai 5 langkah account-first, tiap langkah bawa scope,
// threshold text-handler, toggle, template scoped, sync fallback.

const mockGetAdAccounts = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: { withToken: vi.fn(() => ({ getAdAccounts: mockGetAdAccounts })) },
}));

const { handleMonitor, handleMonitorCallback, handleMonitorText, liveAdAccountNames } =
  await import('../../../server/bot/commands/monitor.js');

function makeCtx(userId = 'u1', action = 'sync') {
  const replies = [];
  return {
    userId,
    match: [`rule:${action}`, action],
    answerCbQuery: vi.fn(async () => {}),
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    session: {},
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');
const flatCb = (r) => (r?.opts?.reply_markup?.inline_keyboard || []).flat().map((b) => b.callback_data);

const ROW = (over = {}) => ({
  id: 'conn-1', user_id: 'u1', platform: 'meta', account_name: 'Koneksi Toko',
  is_active: 1, credentials: { access_token: 'TOK' }, ...over,
});

function monitorDeps({ stored = [ROW()], rules = [], create = null } = {}) {
  return {
    repos: {
      platformAccountsRepo: { findByUserId: vi.fn(() => stored) },
      rulesRepo: {
        getAll: vi.fn(() => rules),
        getById: vi.fn((id) => rules.find((r) => r.id === id) || null),
        create: create || vi.fn((r) => ({ id: 'new-1', ...r })),
        update: vi.fn(),
      },
      campaignsRepo: { upsert: vi.fn() },
    },
  };
}

describe('DETAIL rules — rantai 5 langkah', () => {
  beforeEach(() => {
    mockGetAdAccounts.mockReset();
    mockGetAdAccounts.mockResolvedValue([
      { id: 'act_A', name: 'Toko A' },
      { id: 'act_B', name: 'Toko B' },
    ]);
  });

  it('langkah 1: dua akun live + Semua + Kembali + Menu', async () => {
    const ctx = makeCtx('u1', 'add:start');
    await handleMonitorCallback(monitorDeps())(ctx);
    const cb = flatCb(ctx._replies[0]).join(' ');
    expect(cb).toContain('rule:add:account:act_A');
    expect(cb).toContain('rule:add:account:act_B');
    expect(cb).toContain('rule:add:account:__all__');
    expect(cb).toContain('menu:monitor');
    expect(cb).toContain('quick:menu');
  });

  it('langkah 1: token sama dua koneksi → akun tidak dobel', async () => {
    const deps = monitorDeps({ stored: [ROW(), ROW({ id: 'conn-2' })] });
    const ctx = makeCtx('u1', 'add:start');
    await handleMonitorCallback(deps)(ctx);
    const cb = flatCb(ctx._replies[0]).join(' ');
    expect(cb.match(/rule:add:account:act_A/g)).toHaveLength(1);
  });

  it('langkah 2: pilih akun → kategori sebut scope akun', async () => {
    const ctx = makeCtx('u1', 'add:account:act_A');
    await handleMonitorCallback(monitorDeps())(ctx);
    expect(txt(ctx._replies[0])).toContain('Toko A');
    expect(ctx.session.ruleBuilder).toEqual({ accountId: 'act_A' });
  });

  it('langkah 2: pilih Semua Akun → scope global', async () => {
    const ctx = makeCtx('u1', 'add:account:__all__');
    await handleMonitorCallback(monitorDeps())(ctx);
    expect(txt(ctx._replies[0])).toContain('Semua Akun');
  });

  it('langkah 3-4: metric → operator simpan tanpa reset accountId', async () => {
    const ctx = makeCtx('u1', 'add:op:roas:lt');
    ctx.session.ruleBuilder = { accountId: 'act_A' };
    await handleMonitorCallback(monitorDeps())(ctx);
    expect(ctx.session.ruleBuilder).toMatchObject({ accountId: 'act_A', metric: 'roas', operator: 'lt' });
    expect(txt(ctx._replies[0])).toContain('Toko A');
  });

  it('langkah 5: threshold sebut scope + contoh', async () => {
    const ctx = makeCtx('u1', 'add:interval:15');
    ctx.session.ruleBuilder = { accountId: 'act_B', metric: 'ctr', operator: 'gt', actionType: 'notify', interval: 15 };
    await handleMonitorCallback(monitorDeps())(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('Toko B');
    expect(t).toContain('Langkah 5/5');
    expect(ctx.session.ruleBuilder.awaitingValue).toBe(true);
  });

  it('threshold text: angka valid → rule dibuat scoped', async () => {
    const create = vi.fn((r) => ({ id: 'new-1', ...r }));
    const deps = monitorDeps({ create });
    const ctx = makeCtx();
    ctx.message = { text: '5' };
    ctx.session.ruleBuilder = {
      accountId: 'act_A', metric: 'ctr', operator: 'gt', actionType: 'notify',
      interval: 15, awaitingValue: true,
    };
    const { handleMonitorText: textHandler } = await import('../../../server/bot/commands/monitor.js');
    await textHandler(deps)(ctx);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', accountId: 'act_A',
    }));
    expect(txt(ctx._replies[ctx._replies.length - 1])).toContain('Toko A');
  });

  it('threshold text: bukan angka → ditolak, tetap menunggu', async () => {
    const create = vi.fn();
    const deps = monitorDeps({ create });
    const ctx = makeCtx();
    ctx.message = { text: 'lima' };
    ctx.session.ruleBuilder = { accountId: 'act_A', metric: 'ctr', operator: 'gt', awaitingValue: true };
    await handleMonitorText(deps)(ctx);
    expect(txt(ctx._replies[0])).toContain('angka yang valid');
    expect(create).not.toHaveBeenCalled();
    expect(ctx.session.ruleBuilder.awaitingValue).toBe(true);
  });

  it('toggle: matikan rule milik sendiri + tombol Menu', async () => {
    const rules = [{ id: 'r1', userId: 'u1', accountId: 'act_A', name: 'roas lt 1', enabled: 1 }];
    const deps = monitorDeps({ rules });
    const ctx = makeCtx('u1', 'toggle:r1');
    await handleMonitorCallback(deps)(ctx);
    expect(deps.repos.rulesRepo.update).toHaveBeenCalledWith('r1', { enabled: false });
    expect(flatCb(ctx._replies[0])).toContain('quick:menu');
  });

  it('toggle: rule orang lain → ditolak', async () => {
    const rules = [{ id: 'r9', userId: 'u9', accountId: 'act_A', name: 'x', enabled: 1 }];
    const deps = monitorDeps({ rules });
    const ctx = makeCtx('u1', 'toggle:r9');
    await handleMonitorCallback(deps)(ctx);
    expect(txt(ctx._replies[0])).toContain('Aturan nggak ketemu');
    expect(deps.repos.rulesRepo.update).not.toHaveBeenCalled();
  });

  it('template: pilih template → pilih akun → apply scoped sebut nama', async () => {
    const create = vi.fn((r) => ({ id: 'new-2', ...r }));
    const deps = monitorDeps({ create });
    // Langkah 1: daftar template → pilih roasGuard → diminta pilih akun
    const ctx1 = makeCtx('u1', 'template:roasGuard');
    await handleMonitorCallback(deps)(ctx1);
    expect(txt(ctx1._replies[0])).toContain('buat akun mana');
    // Langkah 2: pilih Toko A
    const ctx2 = makeCtx('u1', 'template:roasGuard:act_A');
    await handleMonitorCallback(deps)(ctx2);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'act_A', userId: 'u1' }));
    expect(txt(ctx2._replies[0])).toContain('Toko A');
  });

  it('liveAdAccountNames: map dua arah id polos + act_', async () => {
    const names = await liveAdAccountNames(monitorDeps(), 'u1');
    expect(names.get('act_A')).toBe('Toko A');
    expect(names.get('act_B')).toBe('Toko B');
  });
});
