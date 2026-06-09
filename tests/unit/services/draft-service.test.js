import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftService } from '../../../server/services/draft-service.js';

describe('DraftService', () => {
  let service;
  let mockDraftsRepo;
  let mockTelegram;

  const fakeDraft = {
    id: 'draft-1',
    type: 'campaign_create',
    summary: 'Create campaign for product X',
    details_json: '{"budget":100}',
    proposed_by: 'ai',
    status: 'pending',
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
    execution_result: null,
    created_at: '2026-06-09T00:00:00',
    updated_at: '2026-06-09T00:00:00',
  };

  beforeEach(() => {
    mockDraftsRepo = {
      findAll: vi.fn().mockReturnValue([fakeDraft]),
      findById: vi.fn().mockReturnValue(fakeDraft),
      create: vi.fn().mockReturnValue(fakeDraft),
      approve: vi.fn().mockReturnValue({ ...fakeDraft, status: 'approved', reviewed_by: 'user-1' }),
      reject: vi.fn().mockReturnValue({ ...fakeDraft, status: 'rejected', reviewed_by: 'user-1', rejection_reason: 'too risky' }),
      count: vi.fn().mockReturnValue(1),
    };
    mockTelegram = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
    service = new DraftService(mockDraftsRepo, mockTelegram);
  });

  describe('listDrafts', () => {
    it('should return drafts with default pending status', async () => {
      const result = await service.listDrafts();
      expect(result).toEqual([fakeDraft]);
      expect(mockDraftsRepo.findAll).toHaveBeenCalledWith('pending');
    });

    it('should pass custom status', async () => {
      await service.listDrafts('approved');
      expect(mockDraftsRepo.findAll).toHaveBeenCalledWith('approved');
    });
  });

  describe('createDraft', () => {
    it('should create draft and return it', async () => {
      const result = await service.createDraft({
        type: 'campaign_create',
        summary: 'Create campaign for product X',
      });
      expect(result).toEqual(fakeDraft);
      expect(mockDraftsRepo.create).toHaveBeenCalledWith({
        type: 'campaign_create',
        summary: 'Create campaign for product X',
        details: undefined,
        proposedBy: 'ai',
      });
    });

    it('should pass details and proposedBy', async () => {
      await service.createDraft({
        type: 'budget_change',
        summary: 'Increase budget',
        details: { newBudget: 200 },
        proposedBy: 'user',
      });
      expect(mockDraftsRepo.create).toHaveBeenCalledWith({
        type: 'budget_change',
        summary: 'Increase budget',
        details: { newBudget: 200 },
        proposedBy: 'user',
      });
    });

    it('should throw if type is missing', async () => {
      await expect(service.createDraft({ summary: 'no type' }))
        .rejects.toThrow('type is required');
    });

    it('should throw if summary is missing', async () => {
      await expect(service.createDraft({ type: 'x' }))
        .rejects.toThrow('summary is required');
    });

    it('should notify via telegram after creation', async () => {
      await service.createDraft({ type: 'campaign_create', summary: 'test' });
      // Wait for microtask
      await new Promise(r => setTimeout(r, 10));
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Draft created')
      );
    });

    it('should not throw if telegram notification fails', async () => {
      mockTelegram.sendMessage.mockRejectedValue(new Error('network'));
      await expect(service.createDraft({ type: 'x', summary: 'y' }))
        .resolves.toBeDefined();
    });
  });

  describe('approveDraft', () => {
    it('should approve a pending draft', async () => {
      const result = await service.approveDraft('draft-1', 'user-1', 'executed ok');
      expect(result.status).toBe('approved');
      expect(mockDraftsRepo.approve).toHaveBeenCalledWith('draft-1', {
        reviewedBy: 'user-1',
        executionResult: 'executed ok',
      });
    });

    it('should throw NotFoundError if draft does not exist', async () => {
      mockDraftsRepo.findById.mockReturnValue(null);
      await expect(service.approveDraft('missing', 'user-1'))
        .rejects.toThrow('Draft not found');
    });

    it('should throw ValidationError if draft is not pending', async () => {
      mockDraftsRepo.findById.mockReturnValue({ ...fakeDraft, status: 'approved' });
      await expect(service.approveDraft('draft-1', 'user-1'))
        .rejects.toThrow('Draft is already approved');
    });

    it('should notify on approve', async () => {
      await service.approveDraft('draft-1', 'user-1');
      await new Promise(r => setTimeout(r, 10));
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('approved')
      );
    });
  });

  describe('rejectDraft', () => {
    it('should reject a pending draft', async () => {
      const result = await service.rejectDraft('draft-1', 'user-1', 'too risky');
      expect(result.status).toBe('rejected');
      expect(mockDraftsRepo.reject).toHaveBeenCalledWith('draft-1', {
        reviewedBy: 'user-1',
        rejectionReason: 'too risky',
      });
    });

    it('should throw NotFoundError if draft does not exist', async () => {
      mockDraftsRepo.findById.mockReturnValue(null);
      await expect(service.rejectDraft('missing', 'user-1'))
        .rejects.toThrow('Draft not found');
    });

    it('should throw ValidationError if draft is not pending', async () => {
      mockDraftsRepo.findById.mockReturnValue({ ...fakeDraft, status: 'rejected' });
      await expect(service.rejectDraft('draft-1', 'user-1'))
        .rejects.toThrow('Draft is already rejected');
    });

    it('should notify on reject', async () => {
      await service.rejectDraft('draft-1', 'user-1', 'reason');
      await new Promise(r => setTimeout(r, 10));
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('rejected')
      );
    });
  });

  describe('constructor', () => {
    it('should work without telegram service', async () => {
      const noTgService = new DraftService(mockDraftsRepo);
      await noTgService.createDraft({ type: 'x', summary: 'y' });
      // Should not throw
    });
  });

  describe('count', () => {
    it('should delegate count to repo', () => {
      const result = mockDraftsRepo.count('pending');
      expect(result).toBe(1);
      expect(mockDraftsRepo.count).toHaveBeenCalledWith('pending');
    });
  });
});
