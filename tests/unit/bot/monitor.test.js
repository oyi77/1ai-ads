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
    expect(msg).toContain('Account');
  });

  it('callback acknowledges sync', async () => {
    const ctx = makeCtx('u1', 'sync');
    await handleMonitorCallback(makeDeps())(ctx);
    expect(ctx._replies[0].msg).toContain('Campaign sync selesai');
  });

  it('template:apply applies a template', async () => {
    const ctx = makeCtx('u1', 'template:roasGuard');
    await handleMonitorCallback(makeDeps())(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('ROAS Guard');
  });

  it('add:start shows metric categories', async () => {
    const ctx = makeCtx('u1', 'add:start');
    await handleMonitorCallback(makeDeps())(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('Category');
  });

  it('view:all shows rules list', async () => {
    const ctx = makeCtx('u1', 'view:all');
    await handleMonitorCallback(makeDeps())(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toBeDefined();
  });
});
