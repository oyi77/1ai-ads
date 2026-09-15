import { describe, it, expect, vi } from 'vitest';

// Menu ramping 2026-09-15: utama 4 tombol (Dashboard, Buat Campaign,
// Kelola Iklan, Bantuan) + Mini App. Advanced masuk menu:manage.
// Mode demo: user tanpa token bisa jalan-jalan aman.

const { mainMenuKeyboard, manageMenuKeyboard, handleMenuButton } =
  await import('../../../server/bot/commands/menu.js');

function makeCtx(match = ['menu:manage', 'manage']) {
  const replies = [];
  return {
    userId: 'u1',
    match,
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    answerCbQuery: vi.fn(async () => {}),
    scene: { enter: vi.fn(async () => {}) },
    _replies: replies,
  };
}
const flatCb = (r) => (r?.opts?.reply_markup?.inline_keyboard || []).flat().map((b) => b.callback_data);
const flatText = (r) => (r?.opts?.reply_markup?.inline_keyboard || []).flat().map((b) => b.text).join(' | ');

describe('menu ramping — 4 tombol utama', () => {
  it('utama: Dashboard + Buat Campaign + Kelola + Bantuan, tanpa Browser ganda', () => {
    const kb = mainMenuKeyboard().inline_keyboard;
    const text = kb.flat().map((b) => b.text).join(' | ');
    expect(text).toContain('📊 Dashboard');
    expect(text).toContain('🎯 Buat Campaign');
    expect(text).toContain('🛠️ Kelola Iklan');
    expect(text).toContain('❓ Bantuan');
    expect(text).not.toContain('Buka di Browser');
    expect(text).not.toContain('Aturan Otomatis');
    const cb = kb.flat().map((b) => b.callback_data || (b.web_app ? 'web_app' : '')).join(' ');
    expect(cb).toContain('menu:manage');
  });

  it('menu:manage tampilkan sub-menu advanced + Kembali', async () => {
    const ctx = makeCtx();
    await handleMenuButton({})(ctx);
    const t = flatText(ctx._replies[0]);
    expect(t).toContain('Aturan Otomatis');
    expect(t).toContain('Saran AI');
    expect(t).toContain('Ads Manager');
    expect(t).toContain('Pengaturan');
    const cb = flatCb(ctx._replies[0]).join(' ');
    expect(cb).toContain('menu:monitor');
    expect(cb).toContain('menu:optimize');
    expect(cb).toContain('quick:menu');
  });

  it('manageMenuKeyboard mandiri: 6 advanced + Kembali', () => {
    const cb = manageMenuKeyboard().inline_keyboard.flat().map((b) => b.callback_data).join(' ');
    for (const c of ['menu:monitor', 'menu:optimize', 'menu:ads', 'menu:platforms', 'menu:settings', 'menu:pricing', 'quick:menu']) {
      expect(cb).toContain(c);
    }
  });
});

const mockGetAdAccounts = vi.fn();

vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: { withToken: vi.fn(() => ({ getAdAccounts: mockGetAdAccounts })) },
}));

const { handleStatus, handleDashboardCallback } =
  await import('../../../server/bot/commands/status.js');

function dashCtx(match) {
  const replies = [];
  return {
    userId: 'u1',
    match,
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    answerCbQuery: vi.fn(async () => {}),
    session: {},
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');

function emptyDeps() {
  return {
    repos: {
      platformAccountsRepo: { findByUserId: vi.fn(() => []), findById: vi.fn(() => null) },
      draftsRepo: { findByUser: vi.fn(() => ({ data: [], total: 0 })) },
    },
  };
}

describe('mode demo — aman buat pemula', () => {
  it('dashboard kosong tawarkan demo', async () => {
    const ctx = dashCtx(['menu:status', 'status']);
    await handleStatus(emptyDeps())(ctx);
    expect(flatCb(ctx._replies[0])).toContain('dash:demo');
  });

  it('dash:demo tampilkan 2 akun contoh + keluar + menu', async () => {
    const ctx = dashCtx(['dash:demo', 'demo']);
    await handleDashboardCallback(emptyDeps())(ctx);
    const t = txt(ctx._replies[0]);
    expect(t).toContain('Mode Demo');
    expect(t).toContain('Toko Contoh A');
    const cb = flatCb(ctx._replies[0]).join(' ');
    expect(cb).toContain('dash:demo:pick:0');
    expect(cb).toContain('dash:demoexit');
    expect(cb).toContain('quick:menu');
  });

  it('laporan demo: angka contoh + ganti periode + menu', async () => {
    const ctx = dashCtx(['dash:demo:rep:0:7d', 'demo:rep:0:7d']);
    await handleDashboardCallback(emptyDeps())(ctx);
    const t = txt(ctx._replies[ctx._replies.length - 1]);
    expect(t).toContain('CONTOH');
    expect(t).toContain('7 hari');
    const cb = flatCb(ctx._replies[ctx._replies.length - 1]).join(' ');
    expect(cb).toContain('dash:demo:rep:0:30d');
    expect(cb).toContain('quick:menu');
  });
});
