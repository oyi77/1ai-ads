import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftService } from '../../../../server/services/draft-service.js';
import { ValidationError, NotFoundError } from '../../../../server/lib/errors.js';

/** Minimal draftsRepo stub. NOTE: DraftService calls this.draftsRepo.create,
 *  NOT createDraft — the stub must expose `create`. */
function makeDraftsRepo(overrides = {}) {
  return {
    settingsRepo: {
      getApprovalRequired: vi.fn(() => true),
    },
    create: vi.fn(async (input) => ({
      id: 'd1',
      type: input.type,
      summary: input.summary,
      details: input.details,
      proposedBy: input.proposedBy,
      userId: input.userId ?? null,
      campaignId: input.campaignId ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
      status: 'pending',
    })),
    findById: vi.fn(async () => null),
    approve: vi.fn(async (id, opts) => ({ id, ...opts })),
    reject: vi.fn(async (id, opts) => ({ id, ...opts })),
    ...overrides,
  };
}

describe('DraftService', () => {
  let draftsRepo;
  let svc;

  beforeEach(() => {
    draftsRepo = makeDraftsRepo();
    svc = new DraftService(draftsRepo, null); // no telegramService → _notify no-ops
  });

  describe('createDraft', () => {
    it('requires type', async () => {
      await expect(svc.createDraft({ summary: 's', details: {} })).rejects.toThrow('type is required');
      expect(draftsRepo.create).not.toHaveBeenCalled();
    });

    it('requires summary', async () => {
      await expect(svc.createDraft({ type: 't', details: {} })).rejects.toThrow('summary is required');
      expect(draftsRepo.create).not.toHaveBeenCalled();
    });

    it('passes userId through to the repository create call', async () => {
      const res = await svc.createDraft({
        type: 'autonomous_action',
        summary: 'scale up',
        details: { action: 'scale_up' },
        proposedBy: 'rule',
        userId: 'u1',
        campaignId: '123',
      });
      expect(draftsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'autonomous_action',
        summary: 'scale up',
        proposedBy: 'rule',
        userId: 'u1',
        campaignId: '123',
      }));
      expect(res).toMatchObject({ id: 'd1', userId: 'u1' });
    });

    it('defaults userId and proposedBy when omitted', async () => {
      await svc.createDraft({ type: 't', summary: 's', details: {} });
      expect(draftsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: null,
        proposedBy: 'ai',
      }));
    });
  });

  describe('guardAutonomousChange', () => {
    it('returns the created draft with the owner userId when approval required', async () => {
      const res = await svc.guardAutonomousChange({
        type: 'autonomous_action',
        summary: 'scale up',
        details: { action: 'scale_up' },
        proposedBy: 'rule',
        userId: 'u1',
        campaignId: '123',
      });
      expect(draftsRepo.create).toHaveBeenCalledTimes(1);
      expect(draftsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'autonomous_action',
        summary: 'scale up',
        proposedBy: 'rule',
        userId: 'u1',
        campaignId: '123',
        approvalRequestId: expect.stringMatching(/^apr_/),
      }));
      expect(res).toMatchObject({ id: 'd1', userId: 'u1' });
    });

    it('returns false and does not create a draft when approval not required', async () => {
      draftsRepo.settingsRepo.getApprovalRequired.mockReturnValue(false);
      const res = await svc.guardAutonomousChange({ type: 't', summary: 's', details: {}, userId: 'u1' });
      expect(res).toBe(false);
      expect(draftsRepo.create).not.toHaveBeenCalled();
    });

    it('returns false when no settingsRepo is present (legacy repos)', async () => {
      const bare = { create: draftsRepo.create };
      const legacy = new DraftService(bare, null);
      const res = await legacy.guardAutonomousChange({ type: 't', summary: 's', details: {} });
      expect(res).toBe(false);
      expect(bare.create).not.toHaveBeenCalled();
    });
  });

  describe('approveDraft', () => {
    it('throws NotFoundError when draft does not exist', async () => {
      await expect(svc.approveDraft('nope', 'u1')).rejects.toThrow('Draft not found');
    });

    it('throws ValidationError when draft is not pending', async () => {
      draftsRepo.findById.mockResolvedValue({ id: 'd1', status: 'approved' });
      await expect(svc.approveDraft('d1', 'u1')).rejects.toThrow('Draft is already approved');
    });

    it('approves a non-replayable draft and records reviewedBy', async () => {
      draftsRepo.findById.mockResolvedValue({ id: 'd1', status: 'pending', details: {} });
      draftsRepo.approve.mockResolvedValue({ id: 'd1', status: 'approved' });
      const res = await svc.approveDraft('d1', 'u1');
      expect(draftsRepo.approve).toHaveBeenCalledWith('d1', { reviewedBy: 'u1' });
      expect(res).toMatchObject({ id: 'd1', status: 'approved' });
    });
  });

  describe('rejectDraft', () => {
    it('throws NotFoundError when draft does not exist', async () => {
      await expect(svc.rejectDraft('nope', 'u1')).rejects.toThrow('Draft not found');
    });

    it('throws ValidationError when draft is not pending', async () => {
      draftsRepo.findById.mockResolvedValue({ id: 'd1', status: 'rejected' });
      await expect(svc.rejectDraft('d1', 'u1')).rejects.toThrow('Draft is already rejected');
    });

    it('rejects and records reviewedBy + rejectionReason', async () => {
      draftsRepo.findById.mockResolvedValue({ id: 'd1', status: 'pending' });
      draftsRepo.reject.mockResolvedValue({ id: 'd1', status: 'rejected' });
      const res = await svc.rejectDraft('d1', 'u1', 'not approved');
      expect(draftsRepo.reject).toHaveBeenCalledWith('d1', { reviewedBy: 'u1', rejectionReason: 'not approved' });
      expect(res).toMatchObject({ id: 'd1', status: 'rejected' });
    });
  });
});
