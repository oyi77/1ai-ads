import { describe, it, expect, vi } from 'vitest';

const mockGetAdAccounts = vi.fn();
const mockGetAdRulesLibrary = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: {
    withToken: vi.fn(() => ({
      getAdAccounts: mockGetAdAccounts,
      getAdRulesLibrary: mockGetAdRulesLibrary,
    })),
  },
}));

const { handleMonitor, handleMonitorCallback } =
  await import('../../../server/bot/commands/monitor.js');
function makeCtx(userId = 'u1', action = 'sync') {
  const replies = [];
  return {
    userId,
    match: [`rule:${action}`, action],
    answerCbQuery: vi.fn(async () => {}),
    reply: async (msg, opts) => {
      replies.push({ msg, opts });
      return { message: msg };
    },
    session: {},
    _replies: replies,
  };
}

function makeDeps(overrides = {}) {
  return {
    repos: {
      rulesRepo: {
        getAll: vi.fn(() => []),
        getAllEnabled: vi.fn(() => []),
        create: vi.fn(),
        delete: vi.fn(),
        ...(overrides.repos?.rulesRepo ?? {}),
      },
      platformAccountsRepo: {
        findByUserId: vi.fn(() => []),
        ...(overrides.repos?.platformAccountsRepo ?? {}),
      },
    },
  };
}

describe('monitor — enhanced rule system', () => {
  it('shows main monitor menu with correct buttons', async () => {
    const ctx = makeCtx('u1', 'start');
    await handleMonitor(makeDeps())(ctx);
    const kb = ctx._replies[0].opts.reply_markup.inline_keyboard;
    const flat = kb.flat().map((b) => b.callback_data);
    expect(flat).toContain('rule:add:start');
    expect(flat).toContain('rule:view:all');
    expect(flat).toContain('rule:templates');
    expect(flat).toContain('monitor:sync');
    expect(flat).toContain('quick:menu');
  });

  it('shows account picker when user has Meta accounts', async () => {
    const deps = makeDeps({
      repos: {
        platformAccountsRepo: {
          findByUserId: vi.fn(() => [{ id: 'acc1', account_name: 'Acc One', platform: 'meta' }]),
        },
      },
    });
    const ctx = makeCtx('u1', 'account_picker');
    await handleMonitorCallback(deps)(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('Pilih akun iklan');
  });

  it('callback acknowledges sync', async () => {
    const ctx = makeCtx('u1', 'sync');
    await handleMonitorCallback(makeDeps())(ctx);
    expect(ctx._replies[0].msg).toContain('campaign ketarik');
  });

  it('template: asks which account first (no silent global template)', async () => {
    const deps = makeDeps({
      repos: {
        platformAccountsRepo: {
          findByUserId: vi.fn(() => [{ id: 'acc1', account_name: 'Acc One', platform: 'meta', credentials: {} }]),
        },
      },
    });
    const ctx = makeCtx('u1', 'template:roasGuard');
    await handleMonitorCallback(deps)(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('ROAS Guard');
    expect(msg).toContain('buat akun mana');
    const flat = ctx._replies[0].opts.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    expect(flat).toContain('rule:template:roasGuard:__all__');
    expect(flat).toContain('quick:menu');
  });

  it('template: with account applies scoped + names the account', async () => {
    const create = vi.fn();
    const deps = makeDeps({
      repos: {
        platformAccountsRepo: {
          findByUserId: vi.fn(() => [{ id: 'acc1', account_name: 'Acc One', platform: 'meta', credentials: {} }]),
        },
        rulesRepo: { getAll: vi.fn(() => []), create },
      },
    });
    const ctx = makeCtx('u1', 'template:roasGuard:__all__');
    await handleMonitorCallback(deps)(ctx);
    expect(ctx._replies[0].msg).toContain('Semua Akun');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', accountId: null }));
  });

  it('add:start asks which ad account first (no silent global rule)', async () => {
    const deps = makeDeps({
      repos: {
        platformAccountsRepo: {
          findByUserId: vi.fn(() => [{ id: 'acc1', account_name: 'Acc One', platform: 'meta', credentials: {} }]),
        },
      },
    });
    const ctx = makeCtx('u1', 'add:start');
    await handleMonitorCallback(deps)(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('buat akun iklan mana');
    const flat = ctx._replies[0].opts.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    expect(flat).toContain('rule:add:account:__all__');
    expect(flat).toContain('quick:menu');
  });

  it('add:start without accounts tells user to connect first', async () => {
    const ctx = makeCtx('u1', 'add:start');
    await handleMonitorCallback(makeDeps())(ctx);
    expect(ctx._replies[0].msg).toContain('Hubungkan akun Meta dulu');
  });

  it('view:all renders kalimat jelas (bukan kode mentah)', async () => {
    // Live 2026-09-14: rule action `increase_budget` in legacy-Markdown left
    // a bare `_` at byte offset 109 → 400 "can't parse entities". The bot
    // migrated to HTML, so raw underscores are safe and must NOT be escaped.
    const deps = makeDeps({
      repos: {
        rulesRepo: {
          getAll: () => [{
            id: 'r1', name: 'Auto Increase Budget', enabled: 1,
            condition: { type: 'group', logic: 'and', children: [
              { type: 'leaf', metric: 'roas', operator: '>', value: 2 },
            ]},
            action: { type: 'increase_budget' },
            intervalMinutes: 15,
          }],
        },
      },
    });
    const ctx = makeCtx('u1', 'view:all');
    await handleMonitorCallback(deps)(ctx);
    const msg = ctx._replies[0].msg;
    expect(ctx._replies[0].opts.parse_mode).toBe('HTML');
    expect(msg).toContain('ROAS lebih dari 2x');
    expect(msg).toContain('budget dinaikin');
    expect(msg).toContain('bukan di dashboard Facebook');
    expect(msg).not.toContain('increase\\_budget');
  });

  it('view:all tampilkan aturan Facebook + peringatan tabrakan', async () => {
    mockGetAdAccounts.mockResolvedValue([{ id: 'act_A', name: 'Toko A' }]);
    mockGetAdRulesLibrary.mockResolvedValue([{
      id: 'fb-1', name: 'FB Roas Rule', status: 'ACTIVE',
      evaluationSpec: { filters: [{ field: 'spend', operator: 'GREATER_THAN', value: 100000 }] },
      executionSpec: { execution_type: 'PAUSE' },
    }]);
    const deps = makeDeps({
      repos: {
        platformAccountsRepo: {
          findByUserId: vi.fn(() => [{ id: 'c1', platform: 'meta', is_active: 1, credentials: { access_token: 'T' } }]),
        },
        rulesRepo: {
          getAll: () => [{
            id: 'r1', userId: 'u1', accountId: 'act_A', name: 'Belanja lebih dari Rp 50000',
            enabled: 1, intervalMinutes: 15,
            condition: { type: 'leaf', metric: 'spend', operator: '>', value: 50000 },
            action: { type: 'notify' },
          }],
        },
      },
    });
    const ctx = makeCtx('u1', 'view:all');
    await handleMonitorCallback(deps)(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('aturan Facebook');
    expect(msg).toContain('Belanja lebih dari Rp 100.000');
    expect(msg).toContain('dimatiin');
    expect(msg).toContain('tabrakan');
  });
});
