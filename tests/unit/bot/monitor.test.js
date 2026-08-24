import { describe, it, expect, vi } from 'vitest';
import { handleMonitor, handleMonitorCallback } from '../../../server/bot/commands/monitor.js';

function makeCtx(userId = 'u1', match = ['monitor:view', 'monitor:view']) {
  const replies = [];
  return {
    userId,
    match,
    answerCbQuery: vi.fn(async () => {}),
    reply: async (msg, opts) => {
      replies.push({ msg, opts });
      return { message: msg };
    },
    _replies: replies,
  };
}

function makeDeps(overrides = {}) {
  return {
    repos: {
      rulesRepo: {
        getAll: vi.fn(() => []),
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

describe('monitor — per-account rule scoping', () => {
  it('lists each Meta ads account plus a global option', async () => {
    const deps = makeDeps({
      repos: {
        platformAccountsRepo: {
          findByUserId: vi.fn(() => [{ id: 'acc1', account_name: 'Acc One', platform: 'meta' }]),
        },
      },
    });
    const ctx = makeCtx();
    await handleMonitor(deps)(ctx);
    const kb = ctx._replies[0].opts.reply_markup.inline_keyboard;
    const flat = kb.flat().map((b) => b.callback_data);
    expect(flat).toContain('rule:view:acc1');
    expect(flat).toContain('rule:view:global');
  });

  it('falls back to the static monitor menu when no accounts exist', async () => {
    const ctx = makeCtx();
    await handleMonitor(makeDeps())(ctx);
    const kb = ctx._replies[0].opts.reply_markup.inline_keyboard;
    const flat = kb.flat().map((b) => b.callback_data);
    expect(flat).toContain('rule:view:global');
    expect(flat).toContain('rule:set:spend:global');
    expect(flat).toContain('rule:set:roas:global');
    expect(flat).toContain('monitor:sync');
  });

  it('acknowledges the sync callback', async () => {
    const ctx = makeCtx('u1', ['sync', 'sync']);
    await handleMonitorCallback(makeDeps())(ctx);
    expect(ctx._replies[0].msg).toContain('Campaign sync triggered');
  });

  it('renders only rules matching the selected scope', async () => {
    const deps = makeDeps({
      repos: {
        rulesRepo: {
          getAll: vi.fn(() => [
            { id: 1, name: 'Acc Rule', condition: '{}', action: '{}', priority: 1, enabled: true, account_id: 'acc1' },
            { id: 2, name: 'Other Rule', condition: '{}', action: '{}', priority: 1, enabled: true, account_id: 'other2' },
            { id: 3, name: 'Global Rule', condition: '{}', action: '{}', priority: 1, enabled: true, account_id: null },
          ]),
        },
      },
    });
    const ctx = makeCtx('u1', ['view:acc1', 'view:acc1']);
    await handleMonitorCallback(deps)(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('Acc Rule');
    expect(msg).toContain('Global Rule');
    expect(msg).not.toContain('Other Rule');
  });
});
