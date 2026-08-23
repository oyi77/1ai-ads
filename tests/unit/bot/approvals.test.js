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

  it('approves when the draft belongs to the caller', async () => {
    deps.services.draftService.draftsRepo.findById.mockResolvedValue({ id: 'd1', user_id: 'u1', status: 'pending' });
    await handleApprovalApprove(deps)(ctx, 'd1');
    expect(deps.services.draftService.approveDraft).toHaveBeenCalledWith('d1', 'u1');
    expect(ctx._replies).toContain('✅ Approved');
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

  it('rejects when the draft belongs to the caller', async () => {
    deps.services.draftService.draftsRepo.findById.mockResolvedValue({ id: 'd1', user_id: 'u1', status: 'pending' });
    await handleApprovalReject(deps)(ctx, 'd1');
    expect(deps.services.draftService.rejectDraft).toHaveBeenCalledWith('d1', 'u1');
    expect(ctx._replies).toContain('❌ Rejected');
  });

  it('surfaces ValidationError messages (e.g. draft already actioned)', async () => {
    deps.services.draftService.draftsRepo.findById.mockResolvedValue({ id: 'd1', user_id: 'u1', status: 'approved' });
    deps.services.draftService.approveDraft.mockRejectedValue(new ValidationError('Draft is already approved'));
    await handleApprovalApprove(deps)(ctx, 'd1');
    expect(ctx._replies).toContain('Draft is already approved');
  });
});
