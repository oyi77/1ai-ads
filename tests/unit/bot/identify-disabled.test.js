import { describe, expect, it, vi } from 'vitest';
import { identify } from '../../../../../server/bot/middleware/identify.js';

vi.mock('../../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

function ctxFor(tgId, { callback = false } = {}) {
  const replies = [];
  return {
    from: tgId === null ? undefined : { id: tgId },
    callbackQuery: callback ? {} : undefined,
    async answerCbQuery() {},
    async reply(text) {
      replies.push(text);
    },
    replies,
  };
}

/**
 * Admin deactivation must lock the Telegram bot too — before this gate,
 * is_active was checked nowhere in the bot path, so banning a user locked
 * HTTP while Telegram stayed fully usable (found 2026-09-14).
 */
describe('identify disabled-user gate', () => {
  it('lets an active user through with identity bound', async () => {
    const user = { id: 'u1', username: 'tg_1', is_active: 1 };
    const deps = { repos: { usersRepo: { findByTelegramId: () => user } } };
    const ctx = ctxFor(1);
    let nexted = false;
    await identify(deps)(ctx, async () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    expect(ctx.userId).toBe('u1');
    expect(ctx.replies).toHaveLength(0);
  });

  it('blocks a disabled user explicitly (no next, ban message)', async () => {
    const user = { id: 'u2', username: 'tg_2', is_active: 0 };
    const deps = { repos: { usersRepo: { findByTelegramId: () => user } } };
    const ctx = ctxFor(2, { callback: true });
    let nexted = false;
    await identify(deps)(ctx, async () => {
      nexted = true;
    });
    expect(nexted).toBe(false);
    expect(ctx.replies).toHaveLength(1);
    expect(ctx.replies[0]).toMatch(/dinonaktifkan/);
  });

  it('auto-created users are active and pass through', async () => {
    const created = { id: 'u3', username: 'tg_3', is_active: 1 };
    const deps = {
      repos: {
        usersRepo: {
          findByTelegramId: () => null,
          create: () => 'u3',
          findById: () => created,
        },
      },
    };
    const ctx = ctxFor(3);
    let nexted = false;
    await identify(deps)(ctx, async () => {
      nexted = true;
    });
    expect(nexted).toBe(true);
    expect(ctx.userId).toBe('u3');
  });
});
