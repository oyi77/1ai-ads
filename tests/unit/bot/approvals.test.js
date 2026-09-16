import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleApprovalApprove, handleApprovalReject } from '../../../server/bot/commands/approvals.js';
import { ValidationError } from '../../../server/lib/errors.js';

function makeDeps(overrides = {}) {
  return {
    services: {
      draftService: {
        draftsRepo: { findById: vi.fn(async () => null) },
        approveDraft: vi.fn(async () => ({ id: 'd1', status: 'approved' })),
        rejectDraft: vi.fn(async () => ({ id: 'd1', status: 'rejected' })),
        ...(overrides.services?.draftService ?? {}),
      },
    },
    ...overrides,
  };
}

function makeCtx(userId = 'u1') {
  const replies = [];
  return {
    userId,
    reply: async (msg) => {
      replies.push(msg);
      return { message: msg };
    },
    _replies: replies,
  };
}

describe('approval:approve / approval:reject callbacks', () => {
  let deps;
  let ctx;

  beforeEach(() => {
    deps = makeDeps();
    ctx = makeCtx('u1');
  });

  it('approves with campaign name + action + Menu buttons', async () => {
    deps.services.draftService.draftsRepo.findById.mockResolvedValue({ id: 'd1', user_id: 'u1', status: 'pending' });
    deps.services.draftService.approveDraft.mockResolvedValue({
      id: 'd1', status: 'approved', summary: 'Aturan X',
      details_json: JSON.stringify({ action: { type: 'pause' }, campaign: { name: 'Promo Lebaran' } }),
      execution_result: 'paused ok',
    });
    await handleApprovalApprove(deps)(ctx, 'd1');
    expect(deps.services.draftService.approveDraft).toHaveBeenCalledWith('d1', 'u1');
    expect(ctx._replies[0]).toContain('Promo Lebaran');
    expect(ctx._replies[0]).toContain('dimatiin');
    expect(ctx._replies[0]).toContain('paused ok');
  });

  it('rejects a draft owned by another user without calling approveDraft', async () => {
    deps.services.draftService.draftsRepo.findById.mockResolvedValue({ id: 'd1', user_id: 'u2', status: 'pending' });
    await handleApprovalApprove(deps)(ctx, 'd1');
    expect(ctx._replies).toContain('Ini bukan draft kamu');
    expect(deps.services.draftService.approveDraft).not.toHaveBeenCalled();
  });

  it('rejects an ownerless draft (user_id null) — fail closed, no approval possible', async () => {
    deps.services.draftService.draftsRepo.findById.mockResolvedValue({ id: 'd1', user_id: null, status: 'pending' });
    await handleApprovalApprove(deps)(ctx, 'd1');
    expect(ctx._replies).toContain('Ini bukan draft kamu');
    expect(deps.services.draftService.approveDraft).not.toHaveBeenCalled();
  });

  it('replies "Draft tidak ditemukan" when the draft does not exist', async () => {
    await handleApprovalApprove(deps)(ctx, 'missing');
    expect(ctx._replies).toContain('Draft tidak ditemukan');
    expect(deps.services.draftService.approveDraft).not.toHaveBeenCalled();
  });

  it('rejects with campaign name + reassurance', async () => {
    deps.services.draftService.draftsRepo.findById.mockResolvedValue({
      id: 'd1', user_id: 'u1', status: 'pending', summary: 'Aturan X',
      details_json: JSON.stringify({ action: { type: 'pause' }, campaign: { name: 'Promo' } }),
    });
    await handleApprovalReject(deps)(ctx, 'd1');
    expect(deps.services.draftService.rejectDraft).toHaveBeenCalledWith('d1', 'u1');
    expect(ctx._replies[0]).toContain('Dibatalkan');
    expect(ctx._replies[0]).toContain('Promo');
    expect(ctx._replies[0]).toContain('Nggak ada yang berubah');
  });

  it('surfaces ValidationError messages (e.g. draft already actioned)', async () => {
    deps.services.draftService.draftsRepo.findById.mockResolvedValue({ id: 'd1', user_id: 'u1', status: 'approved' });
    deps.services.draftService.approveDraft.mockRejectedValue(new ValidationError('Draft is already approved'));
    await handleApprovalApprove(deps)(ctx, 'd1');
    expect(ctx._replies).toContain('Draft is already approved');
  });
});
