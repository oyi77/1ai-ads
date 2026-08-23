import { describe, it, expect, vi } from 'vitest';
import { DraftService } from '../../../../server/services/draft-service.js';

function makeDraftsRepo(approvalRequired, createImpl) {
  const settingsRepo = { getApprovalRequired: vi.fn(() => approvalRequired) };
  const draftsRepo = {
    settingsRepo,
    create: createImpl || vi.fn(async () => ({ id: 'd1' })),
  };
  return draftsRepo;
}

describe('DraftService.guardAutonomousChange regression (1ai-ads #adforge)', () => {
  it('returns false (allow) when draftsRepo has no settingsRepo', async () => {
    const draftsRepo = { create: vi.fn(async () => ({ id: 'd1' })) };
    const svc = new DraftService(draftsRepo);
    const res = await svc.guardAutonomousChange({ type: 'x', summary: 's', details: {}, campaignId: '123' });
    expect(res).toBe(false);
    expect(draftsRepo.create).not.toHaveBeenCalled();
  });

  it('returns false (allow) when approval_required OFF', async () => {
    const draftsRepo = makeDraftsRepo(false);
    const svc = new DraftService(draftsRepo);
    const res = await svc.guardAutonomousChange({ type: 'x', summary: 's', details: {}, campaignId: '123' });
    expect(res).toBe(false);
    expect(draftsRepo.create).not.toHaveBeenCalled();
  });

  it('returns the created draft (block) when approval_required ON', async () => {
    const draftsRepo = makeDraftsRepo(true);
    const svc = new DraftService(draftsRepo);
    const res = await svc.guardAutonomousChange({
      type: 'autonomous_action',
      summary: 'scale up',
      details: { action: 'scale_up' },
      proposedBy: 'rule',
      campaignId: '123',
    });
    expect(res).toMatchObject({ id: 'd1' });
    expect(draftsRepo.settingsRepo.getApprovalRequired).toHaveBeenCalled();
    expect(draftsRepo.create).toHaveBeenCalledTimes(1);
    expect(draftsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'autonomous_action',
      summary: 'scale up',
      proposedBy: 'rule',
      campaignId: '123',
      approvalRequestId: expect.stringMatching(/^apr_/),
    }));
  });

  it('propagates error when draft creation throws (current: no fail-open wrapper)', async () => {
    const draftsRepo = makeDraftsRepo(true, vi.fn(async () => { throw new Error('db insert failed'); }));
    const svc = new DraftService(draftsRepo);
    await expect(
      svc.guardAutonomousChange({ type: 'x', summary: 's', details: {}, campaignId: '123' })
    ).rejects.toThrow('db insert failed');
  });
});
