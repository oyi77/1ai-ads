import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {} }),
}));

import { handleSettings } from '../../../../server/bot/commands/settings.js';

function createCtx(accounts) {
  const replies = [];
  const deps = { repos: { platformAccountsRepo: { findByUserId: vi.fn(() => accounts) } } };
  const ctx = {
    userId: 'user-1',
    reply: vi.fn((_text, opts) => replies.push(opts)),
  };
  return { ctx, deps, replies };
}

async function renderSettings(accounts) {
  const { ctx, deps, replies } = createCtx(accounts);
  await handleSettings(deps)(ctx);
  return replies[0].reply_markup.inline_keyboard.flat().map(b => b.text);
}

describe('/settings — labeled connect buttons (UX polish)', () => {
  it('labels each non-meta button with its platform name, not generic "Connect"', async () => {
    const texts = await renderSettings([]);
    expect(texts).toContain('🔑 Hubungkan Meta via Token');
    expect(texts).toContain('🔗 Google Ads');
    expect(texts).toContain('🔗 TikTok Ads');
    expect(texts).toContain('🔗 Pinterest Ads');
    expect(texts.some(t => t === '🔗 Connect')).toBe(false);
  });

  it('marks connected platforms with ✅ and shows the Meta account name', async () => {
    const texts = await renderSettings([
      { platform: 'meta', is_active: 1, account_name: 'Selow' },
      { platform: 'google', is_active: 1, account_name: 'G-Ads' },
    ]);
    expect(texts).toContain('🔑 Meta Token — Selow');
    expect(texts).toContain('✅ Google Ads');
    expect(texts).toContain('🔗 TikTok Ads'); // unconnected stays 🔗
  });

  it('keeps deep links per-platform for web connection flow', async () => {
    const { ctx, deps } = createCtx([]);
    await handleSettings(deps)(ctx);
    const kb = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
    const googleBtn = kb.flat().find(b => b.text.includes('Google Ads'));
    expect(googleBtn.url).toBe('https://adforge.aitradepulse.com/platforms?platform=google');
  });
});
