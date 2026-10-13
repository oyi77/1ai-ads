import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAdminGrant, handleAdminRevoke, handleAdminAddons } from '../../../server/bot/commands/admin.js';

describe('bot admin addon commands (/admin_grant, /admin_revoke, /admin_addons)', () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = '999,888';
  });

  function makeContext({ fromId = 999, text = '' } = {}) {
    const replies = [];
    return {
      from: { id: fromId },
      message: { text },
      telegram: {
        sendMessage: vi.fn(async () => ({})),
      },
      reply: async (msg, opts) => {
        replies.push({ msg, opts });
        return {};
      },
      _replies: replies,
    };
  }

  function makeDeps({ users = {}, addons = {} } = {}) {
    const grants = [];
    const revokes = [];
    const usersRepo = {
      findById: vi.fn((id) => users[id] || null),
      findByTelegramId: vi.fn((tgId) => Object.values(users).find((u) => String(u.telegram_id) === String(tgId)) || null),
      findByUsername: vi.fn((u) => Object.values(users).find((x) => x.username === u) || null),
      update: vi.fn(),
    };
    const userAddonsRepo = {
      listActive: vi.fn((id) => addons[id] || []),
      grant: vi.fn((id, key) => { grants.push([id, key]); return true; }),
      revoke: vi.fn((id, key) => { revokes.push([id, key]); return true; }),
    };
    return {
      repos: { usersRepo, userAddonsRepo },
      _grants: grants,
      _revokes: revokes,
    };
  }

  it('rejects non-admin caller', async () => {
    const deps = makeDeps();
    const ctx = makeContext({ fromId: 111, text: '/admin_grant 555 lp' });
    await handleAdminGrant(deps)(ctx);
    expect(ctx._replies[0].msg).toContain('cuma buat admin');
    expect(deps._grants).toHaveLength(0);
  });

  it('shows help when arguments are missing', async () => {
    const deps = makeDeps();
    const ctx = makeContext({ text: '/admin_grant' });
    await handleAdminGrant(deps)(ctx);
    expect(ctx._replies[0].msg).toContain('Cara pakai');
    expect(ctx._replies[0].msg).toContain('lp');
    expect(ctx._replies[0].msg).toContain('bridge');
  });

  it('grants add-on by telegram_id and notifies user', async () => {
    const deps = makeDeps({
      users: { 'u-1': { id: 'u-1', username: 'alice', telegram_id: 12345 } },
    });
    const ctx = makeContext({ text: '/admin_grant 12345 lp' });
    await handleAdminGrant(deps)(ctx);

    expect(deps._grants).toEqual([['u-1', 'lp']]);
    expect(ctx._replies[0].msg).toContain('Landing Page diaktifkan');
    expect(ctx.telegram.sendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining('add-on Landing Page sudah aktif'),
      expect.any(Object)
    );
  });

  it('grants bridge add-on by username (@ prefix)', async () => {
    const deps = makeDeps({
      users: { 'u-2': { id: 'u-2', username: 'bob', telegram_id: 67890 } },
    });
    const ctx = makeContext({ text: '/admin_grant @bob bridge' });
    await handleAdminGrant(deps)(ctx);

    expect(deps._grants).toEqual([['u-2', 'bridge']]);
    expect(ctx._replies[0].msg).toContain('Content + Social Bridge diaktifkan');
  });

  it('falls back to plan grant when argument is enterprise', async () => {
    const deps = makeDeps({
      users: { 'u-3': { id: 'u-3', username: 'charlie', telegram_id: 99999 } },
    });
    const ctx = makeContext({ text: '/admin_grant 99999 enterprise' });
    await handleAdminGrant(deps)(ctx);

    expect(deps._grants).toHaveLength(0);
    expect(deps.repos.usersRepo.update).toHaveBeenCalledWith('u-3', {
      plan: 'enterprise',
      plan_expires_at: null,
    });
  });

  it('/admin_revoke revokes an add-on', async () => {
    const deps = makeDeps({
      users: { 'u-1': { id: 'u-1', username: 'alice', telegram_id: 12345 } },
    });
    const ctx = makeContext({ text: '/admin_revoke 12345 lp' });
    await handleAdminRevoke(deps)(ctx);

    expect(deps._revokes).toEqual([['u-1', 'lp']]);
    expect(ctx._replies[0].msg).toContain('Landing Page dicabut');
  });

  it('/admin_addons lists active and locked addons with prices', async () => {
    const deps = makeDeps({
      users: { 'u-1': { id: 'u-1', username: 'alice', telegram_id: 12345 } },
      addons: { 'u-1': ['lp'] },
    });
    const ctx = makeContext({ text: '/admin_addons 12345' });
    await handleAdminAddons(deps)(ctx);

    const reply = ctx._replies[0].msg;
    expect(reply).toContain('✅ Landing Page');
    expect(reply).toContain('🔒 Content + Social Bridge');
  });
});
