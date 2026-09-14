import { describe, expect, it, vi } from 'vitest';
import { handlePlatformAction } from '../../../../../server/bot/commands/menu.js';

vi.mock('../../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

function ctxFor(userId) {
  const replies = [];
  return {
    userId,
    replies,
    async reply(text, extra) {
      replies.push({ text, extra });
    },
    async answerCbQuery() {},
  };
}

function repoWith(rows) {
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  return {
    findById: (id) => byId[id] || null,
    findByUserId: (uid) => rows.filter((r) => r.user_id === uid),
  };
}

const ROW = {
  id: 'acc-1',
  user_id: 'u1',
  platform: 'meta',
  account_name: 'ProofConn',
  is_active: 1,
  health_status: 'ok',
  credentials: { ad_account_id: 'act_123' },
};

describe('handlePlatformAction scope shapes', () => {
  it('2-segment manage scope lists accounts', async () => {
    const ctx = ctxFor('u1');
    const deps = { repos: { platformAccountsRepo: repoWith([ROW]) } };
    await handlePlatformAction(ctx, deps, 'meta:manage');
    expect(ctx.replies).toHaveLength(1);
    expect(ctx.replies[0].text).toMatch(/META Accounts/);
  });

  it('4-segment account scope renders the detail screen for the owner', async () => {
    const ctx = ctxFor('u1');
    const deps = { repos: { platformAccountsRepo: repoWith([ROW]) } };
    await handlePlatformAction(ctx, deps, 'platform:account:meta:acc-1');
    expect(ctx.replies).toHaveLength(1);
    expect(ctx.replies[0].text).toMatch(/ProofConn/);
    expect(ctx.replies[0].text).not.toMatch(/coming soon/);
    const buttons = ctx.replies[0].extra.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    expect(buttons).toContain('ads:disconnect:acc-1');
    expect(buttons).toContain('platform:meta:manage');
  });

  it('4-segment account scope rejects a foreign user', async () => {
    const ctx = ctxFor('intruder');
    const deps = { repos: { platformAccountsRepo: repoWith([ROW]) } };
    await handlePlatformAction(ctx, deps, 'platform:account:meta:acc-1');
    expect(ctx.replies).toHaveLength(1);
    expect(ctx.replies[0].text).toMatch(/not found/);
  });

  it('2-segment connect scope enters the connect scene', async () => {
    const entered = [];
    const ctx = { ...ctxFor('u1'), scene: { enter: (s, st) => entered.push([s, st]) } };
    await handlePlatformAction(ctx, { repos: {} }, 'meta:connect');
    expect(entered).toEqual([['connect-account', { platform: 'meta' }]]);
  });
});
