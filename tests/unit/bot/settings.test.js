import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSettings, handleSettingsCallback } from '../../../server/bot/commands/settings.js';
import { PLATFORM_NAMES } from '../../../server/bot/scenes/connect-account.js';

function makeDeps(overrides = {}) {
  return {
    repos: {
      // findByUserId is SYNC — returns rows directly.
      platformAccountsRepo: { findByUserId: vi.fn(() => []) },
      ...(overrides.repos ?? {}),
    },
    ...overrides,
  };
}

function makeCtx(userId = 'u1', match = ['settings:connect_meta', 'connect_meta']) {
  const replies = [];
  return {
    userId,
    match,
    reply: async (msg, opts) => {
      replies.push({ msg, opts });
      return { message: msg };
    },
    answerCbQuery: vi.fn(async () => {}),
    scene: { enter: vi.fn(async () => {}) },
    _replies: replies,
  };
}

const URL_BASE = 'https://adforge.aitradepulse.com/platforms?platform=';

describe('settings — per-platform Connect rows (P4)', () => {
  let deps;
  let ctx;

  beforeEach(() => {
    deps = makeDeps();
    ctx = makeCtx();
  });

  it('lists all 8 platform labels with Belum terhubung when no accounts', async () => {
    await handleSettings(deps)(ctx);
    const msg = ctx._replies[0].msg;
    for (const [, label] of Object.entries(PLATFORM_NAMES)) {
      expect(msg).toContain(`• ${label}: — Belum terhubung`);
    }
    expect(msg).toContain('Pilih platform untuk terhubung lewat web, atau kelola akun:');
  });

  it('renders 8 platform rows + sync + accounts rows (10 total) with url buttons for non-meta', async () => {
    await handleSettings(deps)(ctx);
    const kb = ctx._replies[0].opts.reply_markup.inline_keyboard;
    expect(kb).toHaveLength(10);
    const platformKeys = Object.keys(PLATFORM_NAMES);
    platformKeys.forEach((key, i) => {
      expect(kb[i]).toHaveLength(1);
      if (key === 'meta') {
        expect(kb[i][0]).toEqual({ text: '🔑 Hubungkan via Token', callback_data: 'settings:connect_meta' });
        expect(kb[i][0].url).toBeUndefined();
      } else {
        expect(kb[i][0].url).toBe(`${URL_BASE}${key}`);
        expect(kb[i][0].callback_data).toBeUndefined();
      }
    });
    expect(kb[8]).toEqual([{ text: '🔄 Sync Campaigns', callback_data: 'settings:sync' }]);
    expect(kb[9]).toEqual([{ text: '📊 View Accounts', callback_data: 'settings:accounts' }]);
  });

  it('shows ✅ Connected (account_name) for active platform only', async () => {
    deps.repos.platformAccountsRepo.findByUserId.mockReturnValue([
      { platform: 'google', account_name: 'My Ads', is_active: 1, id: 'g1' },
      { platform: 'tiktok', account_name: 'TK Acct', is_active: 0, id: 't1' },
    ]);
    await handleSettings(deps)(ctx);
    const msg = ctx._replies[0].msg;
    expect(msg).toContain('• Google Ads: ✅ Connected (My Ads)');
    expect(msg).toContain('• TikTok Ads: — Belum terhubung');
    expect(msg).toContain('• Meta (Facebook/Instagram): — Belum terhubung');
  });

  it('uses ctx.userId (internal UUID) for the account lookup', async () => {
    await handleSettings(deps)(makeCtx('internal-uuid-abc'));
    expect(deps.repos.platformAccountsRepo.findByUserId).toHaveBeenCalledWith('internal-uuid-abc');
  });

  it('does not throw when platformAccountsRepo is absent', async () => {
    deps = makeDeps({ repos: {} });
    await expect(handleSettings(deps)(ctx)).resolves.not.toThrow();
    const msg = ctx._replies[0].msg;
    for (const label of Object.values(PLATFORM_NAMES)) {
      expect(msg).toContain(`• ${label}: — Belum terhubung`);
    }
  });

  it('uses Markdown parse mode and inline_keyboard reply_markup', async () => {
    await handleSettings(deps)(ctx);
    const opts = ctx._replies[0].opts;
    expect(opts.parse_mode).toBe('Markdown');
    expect(opts.reply_markup.inline_keyboard).toBeDefined();
  });

  it('callback connect_meta enters connect-account scene with platform meta', async () => {
    const cbCtx = makeCtx('u1', ['settings:connect_meta', 'connect_meta']);
    await handleSettingsCallback(deps)(cbCtx);
    expect(cbCtx.scene.enter).toHaveBeenCalledWith('connect-account', { platform: 'meta' });
    expect(cbCtx.answerCbQuery).toHaveBeenCalled();
  });

  it('callback accounts lists connected rows; empty case hints /settings', async () => {
    const cbCtx = makeCtx('u1', ['settings:accounts', 'accounts']);
    await handleSettingsCallback(deps)(cbCtx);
    expect(cbCtx._replies[0].msg).toContain('No accounts connected. Use /settings to connect.');

    deps.repos.platformAccountsRepo.findByUserId.mockReturnValue([
      { platform: 'meta', account_name: 'My Page', is_active: 1, id: 'm1' },
      { platform: 'google', account_name: 'Ads Acct', is_active: 0, id: 'g1' },
    ]);
    const cbCtx2 = makeCtx('u1', ['settings:accounts', 'accounts']);
    await handleSettingsCallback(deps)(cbCtx2);
    expect(cbCtx2._replies[0].msg).toContain('• My Page (meta) ✅');
    expect(cbCtx2._replies[0].msg).toContain('• Ads Acct (google) ⏸');
  });

  it('callback unknown action replies Unknown settings action', async () => {
    const cbCtx = makeCtx('u1', ['settings:bogus', 'bogus']);
    await handleSettingsCallback(deps)(cbCtx);
    expect(cbCtx._replies[0].msg).toBe('Unknown settings action.');
  });
});
