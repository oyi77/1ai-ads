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
  return replies[0].reply_markup.inline_keyboard;
}

describe('/settings — labeled connect buttons (UX polish)', () => {
  it('labels each button with its platform name, not generic "Connect"', async () => {
    const kb = await renderSettings([]);
    const texts = kb.flat().map((b) => b.text);
    expect(texts).toContain('🔗 Meta (Facebook/Instagram)');
    expect(texts).toContain('🔗 Google Ads');
    expect(texts).toContain('🔗 TikTok Ads');
    expect(texts).toContain('🔗 Pinterest Ads');
    expect(texts.some((t) => t === '🔗 Connect')).toBe(false);
  });

  it('marks connected platforms with ✅ and shows the account name in status', async () => {
    const { ctx, deps } = createCtx([
      { platform: 'meta', is_active: 1, account_name: 'Selow' },
      { platform: 'google', is_active: 1, account_name: 'G-Ads' },
    ]);
    const texts = [];
    const origReply = ctx.reply;
    let body = '';
    ctx.reply = vi.fn((text, opts) => { body = text; return origReply(text, opts); });
    await handleSettings(deps)(ctx);
    void texts;
    expect(body).toContain('✅ Terhubung (Selow)');
    expect(body).toContain('✅ Terhubung (G-Ads)');
    expect(body).toContain('TikTok Ads: — Belum terhubung');
  });

  it('routes every platform into the bot connect flow (no web URL)', async () => {
    const kb = await renderSettings([]);
    for (const btn of kb.flat()) {
      if (!btn.callback_data) continue;
      if (!btn.callback_data.startsWith('connect:')) continue;
      expect(btn.url).toBeUndefined();
    }
    const flat = kb.flat();
    const googleBtn = flat.find((b) => b.text.includes('Google Ads'));
    expect(googleBtn.callback_data).toBe('connect:google');
    const metaBtn = flat.find((b) => b.text.includes('Meta (Facebook/Instagram)'));
    expect(metaBtn.callback_data).toBe('connect:meta');
  });
});
