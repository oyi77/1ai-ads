import { describe, it, expect, vi } from 'vitest';
import { loadingIndicator } from '../../../server/lib/bot-loading.js';

const makeCtx = () => ({
  callbackQuery: { id: 'q1', data: 'menu:status' },
  answerCbQuery: vi.fn().mockResolvedValue(undefined),
  sendChatAction: vi.fn().mockResolvedValue(undefined),
});

// Run middleware, then return the (possibly wrapped) answerCbQuery plus the
// original spy so tests assert on what Telegram actually receives.
const run = async (ctx) => {
  const original = ctx.answerCbQuery;
  await loadingIndicator()(ctx, async () => undefined);
  return { wrapped: ctx.answerCbQuery, original };
};

describe('loadingIndicator', () => {
  it('bare answerCbQuery() becomes a loading toast, not a silent dismiss', async () => {
    const ctx = makeCtx();
    const { wrapped, original } = await run(ctx);
    await wrapped();
    expect(original.mock.calls[0][0]).toBe('⏳ Memproses…');
  });

  it('explicit answerCbQuery text passes through untouched', async () => {
    const ctx = makeCtx();
    const { wrapped, original } = await run(ctx);
    await wrapped('Selesai ✅');
    expect(original.mock.calls[0][0]).toBe('Selesai ✅');
  });

  it('sends typing when the handler runs slow, never on fast paths', async () => {
    vi.useFakeTimers();
    try {
      const slow = makeCtx();
      const p = loadingIndicator()(slow, async () => {
        await new Promise((r) => setTimeout(r, 1500));
      });
      await vi.advanceTimersByTimeAsync(1500);
      await p;
      expect(slow.sendChatAction).toHaveBeenCalledWith('typing');

      const fast = makeCtx();
      await loadingIndicator()(fast, async () => undefined);
      expect(fast.sendChatAction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failing chat action never breaks the handler', async () => {
    const ctx = makeCtx();
    ctx.sendChatAction = vi.fn().mockRejectedValue(new Error('network down'));
    const next = vi.fn().mockResolvedValue('ok');
    const out = await loadingIndicator()(ctx, next);
    expect(out).toBe('ok');
    expect(next).toHaveBeenCalled();
  });
});
