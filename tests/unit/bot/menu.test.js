import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMenuButton } from '../../../server/bot/commands/menu.js';

function makeDeps(overrides = {}) {
  return {
    services: {
      draftService: {
        guardAutonomousChange: vi.fn(async () => ({ id: 'd1', status: 'pending' })),
        ...(overrides.services?.draftService ?? {}),
      },
      ...(overrides.services?.llmClient ? { llmClient: overrides.services.llmClient } : {}),
    },
    repos: {
      campaignsRepo: {
        // findAll is SYNC — returns { data, total } directly.
        findAll: vi.fn(() => ({ data: [], total: 0 })),
        ...(overrides.repos?.campaignsRepo ?? {}),
      },
    },
    ...overrides,
  };
}

function makeCtx(userId = 'u1', match = ['menu:optimize', 'optimize']) {
  const replies = [];
  return {
    userId,
    match,
    reply: async (msg, opts) => {
      replies.push({ msg, opts });
      return { message: msg };
    },
    answerCbQuery: vi.fn(async () => {}),
    _replies: replies,
  };
}

function metaCampaign(id, { roas, spend = 0, revenue = 0, name, status = 'ACTIVE', platform = 'meta' } = {}) {
  return { id, platform, status, name: name || `Campaign ${id}`, spend, revenue, roas };
}

describe('menu:optimize — AI Optimization (P3)', () => {
  let deps;
  let ctx;

  beforeEach(() => {
    deps = makeDeps();
    ctx = makeCtx('u1');
  });

  it('creates an owner-scoped approval draft for the lowest-ROAS active Meta campaign with Apply/Dismiss buttons', async () => {
    const good = metaCampaign('c1', { roas: 2.5, name: 'Good Campaign' });
    const bad = metaCampaign('c2', { roas: 0.4, name: 'Bad Campaign' });
    deps.repos.campaignsRepo.findAll.mockReturnValue({ data: [good, bad], total: 2 });

    await handleMenuButton(deps)(ctx);

    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledTimes(1);
    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledWith({
      type: 'ai_optimize',
      summary: expect.stringContaining('Bad Campaign'),
      details: { action: { type: 'pause' }, campaign: bad },
      proposedBy: 'ai',
      userId: 'u1',
      campaignId: 'c2',
    });

    expect(ctx._replies).toHaveLength(1);
    const { opts } = ctx._replies[0];
    expect(opts.reply_markup.inline_keyboard[0]).toEqual([
      { text: '✅ Apply', callback_data: 'approval:approve:d1' },
      { text: '❌ Dismiss', callback_data: 'approval:reject:d1' },
    ]);
  });

  it('falls back to spend-based ROAS when roas is missing and picks the worst performer', async () => {
    const a = metaCampaign('a1', { spend: 100, revenue: 300 }); // roas 3.0
    const b = metaCampaign('b1', { spend: 100, revenue: 40 }); // roas 0.4
    deps.repos.campaignsRepo.findAll.mockReturnValue({ data: [a, b], total: 2 });

    await handleMenuButton(deps)(ctx);

    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'b1', details: { action: { type: 'pause' }, campaign: b } })
    );
  });

  it('replies with a hint (no inline keyboard) when the guard returns no draft (approval disabled)', async () => {
    deps.services.draftService.guardAutonomousChange.mockResolvedValue(false);
    deps.repos.campaignsRepo.findAll.mockReturnValue({ data: [metaCampaign('c1', { roas: 0.5 })], total: 1 });

    await handleMenuButton(deps)(ctx);

    expect(ctx._replies).toHaveLength(1);
    expect(ctx._replies[0].msg).toContain('nonaktif');
    expect(ctx._replies[0].msg).toContain('/app');
    expect(ctx._replies[0].opts.reply_markup).toBeUndefined();
  });

  it('replies with a friendly empty message and does NOT call the guard when there are no active Meta campaigns', async () => {
    deps.repos.campaignsRepo.findAll.mockReturnValue({ data: [], total: 0 });

    await handleMenuButton(deps)(ctx);

    expect(ctx._replies).toHaveLength(1);
    expect(ctx._replies[0].msg).toContain('Tidak ada kampanye Meta aktif');
    expect(deps.services.draftService.guardAutonomousChange).not.toHaveBeenCalled();
  });

  it('filters out non-Meta and non-ACTIVE campaigns', async () => {
    const activeMeta = metaCampaign('c1', { roas: 0.2 });
    const pausedMeta = metaCampaign('c2', { roas: 0.1, status: 'PAUSED' });
    const googleActive = { ...metaCampaign('g1', { roas: 0.05 }), platform: 'google' };
    deps.repos.campaignsRepo.findAll.mockReturnValue({ data: [activeMeta, pausedMeta, googleActive], total: 3 });

    await handleMenuButton(deps)(ctx);

    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledTimes(1);
    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'c1' })
    );
  });

  it('does not throw when deps is empty and replies with the friendly empty message', async () => {
    await expect(handleMenuButton({})(ctx)).resolves.toBeDefined();
    expect(ctx._replies).toHaveLength(1);
    expect(ctx._replies[0].msg).toContain('Tidak ada kampanye Meta aktif');
  });

  it('replies with a generic failure message when the guard throws', async () => {
    deps.services.draftService.guardAutonomousChange.mockRejectedValue(new Error('boom'));
    deps.repos.campaignsRepo.findAll.mockReturnValue({ data: [metaCampaign('c1', { roas: 0.5 })], total: 1 });

    await handleMenuButton(deps)(ctx);

    expect(ctx._replies).toHaveLength(1);
    expect(ctx._replies[0].msg).toContain('Gagal memproses optimasi');
  });
  it('uses the LLM suggestion when the LLM returns valid JSON', async () => {
    deps.services.llmClient = {
      call: vi.fn(async () => '{"campaign_id":"c2","type":"pause","rationale":"ROAS 0.4 terlalu rendah"}'),
    };
    deps.repos.campaignsRepo.findAll.mockReturnValue({
      data: [metaCampaign('c1', { roas: 2.5 }), metaCampaign('c2', { roas: 0.4 })],
      total: 2,
    });

    await handleMenuButton(deps)(ctx);

    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledTimes(1);
    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'c2',
        details: { action: { type: 'pause' }, campaign: expect.objectContaining({ id: 'c2' }) },
        summary: expect.stringContaining('ROAS 0.4 terlalu rendah'),
      })
    );
    expect(ctx._replies).toHaveLength(1);
    expect(ctx._replies[0].msg).toContain('Saran AI');
    expect(ctx._replies[0].opts.reply_markup.inline_keyboard[0]).toEqual([
      { text: '✅ Apply', callback_data: 'approval:approve:d1' },
      { text: '❌ Dismiss', callback_data: 'approval:reject:d1' },
    ]);
  });

  it('falls back to the worst-ROAS campaign when the LLM throws', async () => {
    deps.services.llmClient = {
      call: vi.fn(async () => { throw new Error('boom'); }),
    };
    deps.repos.campaignsRepo.findAll.mockReturnValue({
      data: [metaCampaign('c1', { roas: 2.5 }), metaCampaign('c2', { roas: 0.4 })],
      total: 2,
    });

    await handleMenuButton(deps)(ctx);

    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledTimes(1);
    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'c2',
        details: { action: { type: 'pause' }, campaign: expect.objectContaining({ id: 'c2' }) },
      })
    );
  });

  it('falls back to the worst-ROAS campaign when the LLM returns non-JSON', async () => {
    deps.services.llmClient = {
      call: vi.fn(async () => 'not json'),
    };
    deps.repos.campaignsRepo.findAll.mockReturnValue({
      data: [metaCampaign('c1', { roas: 2.5 }), metaCampaign('c2', { roas: 0.4 })],
      total: 2,
    });

    await handleMenuButton(deps)(ctx);

    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledTimes(1);
    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'c2',
        details: { action: { type: 'pause' }, campaign: expect.objectContaining({ id: 'c2' }) },
      })
    );
  });

  it('maps a scale_up LLM suggestion to an action with amount and a "naikkan budget" label', async () => {
    deps.services.llmClient = {
      call: vi.fn(async () => '{"campaign_id":"c1","type":"scale_up","rationale":"potensi tumbuh"}'),
    };
    deps.repos.campaignsRepo.findAll.mockReturnValue({
      data: [metaCampaign('c1', { roas: 2.5 })],
      total: 1,
    });

    await handleMenuButton(deps)(ctx);

    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledTimes(1);
    expect(deps.services.draftService.guardAutonomousChange).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'c1',
        details: { action: { type: 'scale_up', amount: 1.5 }, campaign: expect.objectContaining({ id: 'c1' }) },
      })
    );
    expect(ctx._replies).toHaveLength(1);
    expect(ctx._replies[0].msg).toContain('naikkan budget');
  });
});
