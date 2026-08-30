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
  it('shows main monitor menu with Add Rule, My Rules, Templates, Sync', async () => {
    const ctx = makeCtx('u1', 'start');
    await handleMonitor(makeDeps())(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('Add Rule');
    expect(msg).toContain('My Rules');
    expect(msg).toContain('Templates');
    expect(msg).toContain('Sync');
  });

  it('shows account picker when user has Meta accounts', async () => {
    const deps = makeDeps({
      repos: {
        platformAccountsRepo: {
          findByUserId: vi.fn(() => [{ id: 'acc1', account_name: 'Acc One', platform: 'meta' }]),
        },
      },
    });
    const ctx = makeCtx('u1', 'start');
    await handleMonitor(deps)(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('Account Rules');
  });

  it('callback acknowledges sync', async () => {
    const ctx = makeCtx('u1', 'sync');
    await handleMonitorCallback(makeDeps())(ctx);
    expect(ctx._replies[0].msg).toContain('Campaign sync triggered');
  });

  it('templates action shows template list', async () => {
    const ctx = makeCtx('u1', 'templates');
    await handleMonitorCallback(makeDeps())(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('Templates');
  });

  it('add rule shows metric categories', async () => {
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
