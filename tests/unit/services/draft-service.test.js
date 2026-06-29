import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DraftService } from '../../../server/services/draft-service.js';
import { ValidationError, NotFoundError } from '../../../server/lib/errors.js';

describe('DraftService', () => {
  let service;
  let mockDraftsRepo;
  let mockTelegram;

  const sampleDraft = {
    id: 'draft-1', type: 'budget_increase', summary: 'Increase budget by 20%',
    details: 'Reason: high ROAS', status: 'pending', proposedBy: 'ai',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockDraftsRepo = {
      findAll: vi.fn().mockResolvedValue({ data: [sampleDraft], total: 1, page: 1, limit: 50 }),

      findById: vi.fn().mockReturnValue(sampleDraft),
      create: vi.fn().mockReturnValue(sampleDraft),
      approve: vi.fn().mockReturnValue({ ...sampleDraft, status: 'approved' }),
      reject: vi.fn().mockReturnValue({ ...sampleDraft, status: 'rejected' }),
    };

    mockTelegram = {
      sendMessage: vi.fn().mockResolvedValue({}),
    };

    service = new DraftService(mockDraftsRepo, mockTelegram);
  });

  it('should create instance with dependencies', () => {
    expect(service.draftsRepo).toBe(mockDraftsRepo);
    expect(service.telegramService).toBe(mockTelegram);
  });

  it('should allow null telegram service', () => {
    const svc = new DraftService(mockDraftsRepo);
    expect(svc.telegramService).toBeNull();
  });

  describe('listDrafts', () => {
    it('should list drafts with default status', async () => {
      const result = await service.listDrafts();
      expect(mockDraftsRepo.findAll).toHaveBeenCalledWith({ status: 'pending', page: 1, limit: 50 });
      expect(result.data).toHaveLength(1);
    });

    it('should list drafts with custom status', async () => {
      await service.listDrafts('approved');
      expect(mockDraftsRepo.findAll).toHaveBeenCalledWith({ status: 'approved', page: 1, limit: 50 });
    });
  });


  describe('createDraft', () => {
    it('should create a draft and notify', async () => {
      const result = await service.createDraft({ type: 'budget_increase', summary: 'Increase budget' });
      expect(mockDraftsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'budget_increase', summary: 'Increase budget', proposedBy: 'ai',
      }));
      // Wait for async notification
      await vi.waitFor(() => expect(mockTelegram.sendMessage).toHaveBeenCalled());
    });

    it('should throw ValidationError without type', async () => {
      await expect(service.createDraft({ summary: 'test' })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError without summary', async () => {
      await expect(service.createDraft({ type: 'test' })).rejects.toThrow(ValidationError);
    });

    it('should handle notification failure gracefully', async () => {
      mockTelegram.sendMessage.mockRejectedValue(new Error('Telegram down'));
      const result = await service.createDraft({ type: 'test', summary: 'test' });
      expect(result).toBeDefined();
      // Should not throw even if notification fails
    });
  });

  describe('approveDraft', () => {
    it('should approve a pending draft', async () => {
      const result = await service.approveDraft('draft-1', 'user-1');
      expect(mockDraftsRepo.approve).toHaveBeenCalledWith('draft-1', expect.objectContaining({
        reviewedBy: 'user-1',
      }));
      await vi.waitFor(() => expect(mockTelegram.sendMessage).toHaveBeenCalled());
    });

    it('should throw NotFoundError if draft missing', async () => {
      mockDraftsRepo.findById.mockReturnValue(null);
      await expect(service.approveDraft('nonexistent', 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if already approved', async () => {
      mockDraftsRepo.findById.mockReturnValue({ ...sampleDraft, status: 'approved' });
      await expect(service.approveDraft('draft-1', 'user-1')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if already rejected', async () => {
      mockDraftsRepo.findById.mockReturnValue({ ...sampleDraft, status: 'rejected' });
      await expect(service.approveDraft('draft-1', 'user-1')).rejects.toThrow(ValidationError);
    });

    it('should pass executionResult', async () => {
      await service.approveDraft('draft-1', 'user-1', { spend: 100 });
      expect(mockDraftsRepo.approve).toHaveBeenCalledWith('draft-1', expect.objectContaining({
        executionResult: { spend: 100 },
      }));
    });
  });

  describe('rejectDraft', () => {
    it('should reject a pending draft', async () => {
      const result = await service.rejectDraft('draft-1', 'user-1', 'Not needed');
      expect(mockDraftsRepo.reject).toHaveBeenCalledWith('draft-1', expect.objectContaining({
        reviewedBy: 'user-1', rejectionReason: 'Not needed',
      }));
    });

    it('should throw NotFoundError if draft missing', async () => {
      mockDraftsRepo.findById.mockReturnValue(null);
      await expect(service.rejectDraft('nonexistent', 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError if not pending', async () => {
      mockDraftsRepo.findById.mockReturnValue({ ...sampleDraft, status: 'completed' });
      await expect(service.rejectDraft('draft-1', 'user-1')).rejects.toThrow(ValidationError);
    });
  });

  describe('_notify', () => {
    it('should send telegram with correct emoji for each action', async () => {
      await service._notify(sampleDraft, 'created');
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(expect.stringContaining('📝'));

      await service._notify(sampleDraft, 'approved');
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(expect.stringContaining('✅'));

      await service._notify(sampleDraft, 'rejected');
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(expect.stringContaining('❌'));
    });

    it('should skip notification if no telegram service', async () => {
      const svc = new DraftService(mockDraftsRepo, null);
      await svc._notify(sampleDraft, 'created');
      // Should not throw
    });
  });
});
