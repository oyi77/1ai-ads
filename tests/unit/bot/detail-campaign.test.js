import { describe, it, expect, vi } from 'vitest';

// Uji detail create-campaign: budget floor, nama validasi, audience parse
// edge cases, targeting yang diteruskan ke createAdSet, confirm screen.


vi.mock('../../../server/services/meta/index.js', () => ({
  MetaAdsAPI: { withToken: vi.fn(() => ({})) },
}));

const {
  parseAudienceText,
  MIN_DAILY_BUDGET_IDR,
  createCampaignScene,
} = await import('../../../server/bot/scenes/create-campaign.js');

function wizCtx(text = '', state = {}) {
  const replies = [];
  return {
    message: { text },
    wizard: {
      state: { data: {}, ...state },
      next: vi.fn(async () => {}),
      selectStep: vi.fn(() => {}),
    },
    scene: { leave: vi.fn() },
    reply: async (msg, opts) => { replies.push({ msg, opts }); return { message: msg }; },
    answerCbQuery: vi.fn(async () => {}),
    _replies: replies,
  };
}
const txt = (r) => (typeof r === 'string' ? r : r?.msg || '');
const lastMsg = (ctx) => txt(ctx._replies[ctx._replies.length - 1]);

describe('DETAIL budget — lantai dan format', () => {
  const budgetStep = createCampaignScene.steps[5];

  it('terima 17714 (di atas konstanta 17500, di bawah estimasi FB — margin sadar)', async () => {
    const ctx = wizCtx('17714');
    await budgetStep(ctx);
    expect(ctx.wizard.state.data.dailyBudget).toBe(17714);
    expect(ctx.wizard.next).toHaveBeenCalled();
  });

  it('tolak 17499 (1 rupiah di bawah konstanta)', async () => {
    const ctx = wizCtx('17499');
    await budgetStep(ctx);
    expect(lastMsg(ctx)).toContain('17.500');
    expect(ctx.wizard.state.data.dailyBudget).toBeUndefined();
  });


  it('terima 17500 pas (batas bawah)', async () => {
    const ctx = wizCtx('17500');
    await budgetStep(ctx);
    expect(ctx.wizard.state.data.dailyBudget).toBe(17500);
    expect(ctx.wizard.next).toHaveBeenCalled();
  });

  it('parse format Rp 50.000 dan 50rb-ish', async () => {
    const ctx = wizCtx('Rp 50.000');
    await budgetStep(ctx);
    expect(ctx.wizard.state.data.dailyBudget).toBe(50000);
  });

  it('tolak teks kosong / huruf saja', async () => {
    const ctx = wizCtx('lima puluh ribu');
    await budgetStep(ctx);
    expect(lastMsg(ctx)).toContain('17.500');
    expect(ctx.wizard.next).not.toHaveBeenCalled();
  });
});

describe('DETAIL nama — validasi', () => {
  const nameStep = createCampaignScene.steps[4];

  it('tolak nama kosong', async () => {
    const ctx = wizCtx('');
    await nameStep(ctx);
    expect(lastMsg(ctx)).toContain('1-80 karakter');
  });

  it('tolak nama 81 karakter', async () => {
    const ctx = wizCtx('x'.repeat(81));
    await nameStep(ctx);
    expect(lastMsg(ctx)).toContain('1-80 karakter');
  });

  it('terima nama 80 karakter pas', async () => {
    const ctx = wizCtx('x'.repeat(80));
    await nameStep(ctx);
    expect(ctx.wizard.state.data.name).toHaveLength(80);
    expect(ctx.wizard.next).toHaveBeenCalled();
  });
});

describe('DETAIL audience — parse edge cases', () => {
  it('default semua: "semua umur semua"', () => {
    const got = parseAudienceText('semua');
    expect(got.countries).toEqual(['ID']);
    expect(got.ageMin).toBe(18);
    expect(got.ageMax).toBe(55);
    expect(got.gender).toBe(0);
    expect(got.interests).toEqual([]);
  });

  it('umur satu angka: "umur 25" → 25-25', () => {
    const got = parseAudienceText('umur 25');
    expect(got.ageMin).toBe(25);
    expect(got.ageMax).toBe(25);
  });

  it('umur kebalik "40-20" → max dikunci ke min', () => {
    const got = parseAudienceText('umur 40-20');
    expect(got.ageMax).toBeGreaterThanOrEqual(got.ageMin);
  });

  it('umur ekstrem diklem 13-65', () => {
    const got = parseAudienceText('umur 5-90');
    expect(got.ageMin).toBe(13);
    expect(got.ageMax).toBe(65);
  });

  it('negara Malaysia + minat koma', () => {
    const got = parseAudienceText('Malaysia, umur 30-45, pria, minat kuliner, travel, otomotif');
    expect(got.countries).toEqual(['MY']);
    expect(got.gender).toBe(1);
    expect(got.interests).toEqual(['kuliner', 'travel', 'otomotif']);
  });

  it('minat "suka ... dan ..." dipecah', () => {
    const got = parseAudienceText('suka fashion dan skincare dan kuliner');
    expect(got.interests).toContain('fashion');
    expect(got.interests).toContain('skincare');
  });

  it('maksimal 8 minat', () => {
    const got = parseAudienceText('suka a1, b2, c3, d4, e5, f6, g7, h8, i9, j10');
    expect(got.interests).toHaveLength(8);
  });

  it('step /skip → default ID 18-55 semua', async () => {
    const audienceStep = createCampaignScene.steps[6];
    const ctx = wizCtx('/skip');
    await audienceStep(ctx);
    expect(ctx.wizard.state.data.targeting).toEqual({
      countries: ['ID'], ageMin: 18, ageMax: 55, gender: 0, interests: [],
    });
  });
});

describe('DETAIL confirm — ringkasan lengkap', () => {
  it('tampilkan semua field + tombol Menu', async () => {
    const creativeStep = createCampaignScene.steps[7];
    const ctx = wizCtx('', {
      data: {
        accountId: 'act_1', objective: 'OUTCOME_TRAFFIC', name: 'Promo',
        dailyBudget: 50000,
        targeting: { countries: ['ID'], ageMin: 20, ageMax: 35, gender: 2, interests: ['fashion'] },
      },
      accounts: [{ id: 'act_1', name: 'Toko A' }],
      creativeSource: 'skip',
      confirmShown: false,
    });
    // step 7 tanpa source lengkap → confirmShown via skip flow
    ctx.wizard.state.creativeSource = 'skip';
    await creativeStep(ctx);
    const t = lastMsg(ctx);
    expect(t).toContain('Toko A');
    expect(t).toContain('Promo');
    expect(t).toContain('50.000');
    expect(t).toContain('20-35');
    expect(t).toContain('Cewek');
    expect(t).toContain('fashion');
    expect(t).toContain('PAUSED');
  });

  it('edit budget dari confirm: angka baru tampil + kembali ke confirm', async () => {
    const creativeStep = createCampaignScene.steps[7];
    const ctx = wizCtx('75000', {
      data: { accountId: 'act_1', objective: 'OUTCOME_TRAFFIC', name: 'Promo', dailyBudget: 50000, targeting: {} },
      accounts: [{ id: 'act_1', name: 'Toko A' }],
      creativeSource: 'skip',
      editingBudget: true,
      confirmShown: false,
    });
    await creativeStep(ctx);
    expect(ctx.wizard.state.data.dailyBudget).toBe(75000);
    expect(ctx.wizard.state.editingBudget).toBe(false);
    expect(lastMsg(ctx)).toContain('75.000');
  });

  it('edit budget di bawah lantai: ditolak, tetap mode edit', async () => {
    const creativeStep = createCampaignScene.steps[7];
    const ctx = wizCtx('5000', {
      data: { dailyBudget: 50000 },
      editingBudget: true,
    });
    await creativeStep(ctx);
    expect(ctx.wizard.state.data.dailyBudget).toBe(50000);
    expect(ctx.wizard.state.editingBudget).toBe(true);
    expect(lastMsg(ctx)).toContain('17.500');
  });

  it('MIN konsisten dengan ads.js (satu lantai)', async () => {
    const { MIN_DAILY_BUDGET_IDR: adsMin } =
      await import('../../../server/bot/commands/ads.js');
    expect(adsMin).toBe(MIN_DAILY_BUDGET_IDR);
  });
});
