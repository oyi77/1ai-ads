import { describe, it, expect, vi } from 'vitest';
import { handleMonitor, handleMonitorCallback } from '../../../server/bot/commands/monitor.js';

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

  it('template:apply applies a template', async () => {
    const ctx = makeCtx('u1', 'template:roasGuard');
    await handleMonitorCallback(makeDeps())(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('ROAS Guard');
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

  it('view:all renders raw action names under HTML parse mode (no entity crash)', async () => {
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
    expect(msg).toContain('increase_budget');
    expect(msg).not.toContain('increase\\_budget');
  });
});
