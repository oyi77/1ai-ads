import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../server/lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-123'),
}));

vi.mock('fs', () => ({
  default: { readFileSync: vi.fn(() => Buffer.from('fake-video')) },
}));

import { ContentScheduler } from '../../../server/services/content-scheduler.js';

describe('ContentScheduler', () => {
  let scheduler;
  let mockVideoService;
  let mockLlmClient;
  let mockQueueRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockVideoService = {
      uploadVideo: vi.fn().mockResolvedValue({ success: true, videoId: 'vid-1', permalinkUrl: 'https://fb.watch/123' }),
    };

    mockLlmClient = {
      call: vi.fn().mockResolvedValue(JSON.stringify({
        caption: 'Test caption',
        hashtags: ['#test', '#viral'],
        hook: 'Test hook',
        cta: 'Test CTA',
      })),
    };

    mockQueueRepo = {
      insert: vi.fn(),
      findPendingByPage: vi.fn().mockReturnValue([]),
      findPendingAll: vi.fn().mockReturnValue([]),
      updateStatus: vi.fn(),
      updateCompleted: vi.fn(),
      updateFailed: vi.fn(),
      cancelById: vi.fn(),
      findById: vi.fn(),
      findByStatus: vi.fn().mockReturnValue([]),
      getStatusCounts: vi.fn().mockReturnValue({ pending: 0, completed: 0, failed: 0 }),
    };

    scheduler = new ContentScheduler({
      videoService: mockVideoService,
      llmClient: mockLlmClient,
      queueRepo: mockQueueRepo,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    scheduler.stop();
  });

  it('should create instance with dependencies', () => {
    expect(scheduler.videoService).toBe(mockVideoService);
    expect(scheduler.llmClient).toBe(mockLlmClient);
    expect(scheduler.queueRepo).toBe(mockQueueRepo);
  });

  describe('start / stop', () => {
    it('should start interval and call processQueue', () => {
      const spy = vi.spyOn(scheduler, 'processQueue').mockResolvedValue([]);
      scheduler.start(1000);
      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalled();
    });

    it('should stop interval', () => {
      const spy = vi.spyOn(scheduler, 'processQueue').mockResolvedValue([]);
      scheduler.start(1000);
      scheduler.stop();
      vi.advanceTimersByTime(2000);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should be safe to stop when not started', () => {
      expect(() => scheduler.stop()).not.toThrow();
    });
  });

  describe('queueContent', () => {
    it('should insert content into queue', () => {
      const result = scheduler.queueContent({
        pageId: 'page-1', filePath: '/tmp/video.mp4', caption: 'Hello',
      });

      expect(result.success).toBe(true);
      expect(result.queueId).toBe('mock-uuid-123');
      expect(mockQueueRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('should fail without pageId or filePath', () => {
      const result = scheduler.queueContent({ pageId: 'page-1' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should fail without filePath', () => {
      const result = scheduler.queueContent({ filePath: '/tmp/video.mp4' });
      expect(result.success).toBe(false);
    });

    it('should pass optional fields to repo', () => {
      scheduler.queueContent({
        pageId: 'page-1', filePath: '/tmp/video.mp4',
        hashtags: ['#tag'], hook: 'hook', cta: 'cta',
        scheduleAt: 12345, category: 'fashion', style: 'lifestyle',
      });

      const insertArg = mockQueueRepo.insert.mock.calls[0][0];
      expect(insertArg.hashtags).toEqual(['#tag']);
      expect(insertArg.category).toBe('fashion');
    });
  });

  describe('processQueue', () => {
    it('should process pending items', async () => {
      mockQueueRepo.findPendingAll.mockReturnValue([{
        id: 'q1', page_id: 'page-1', file_path: '/tmp/video.mp4',
        caption: 'Test', hashtags: '["#tag"]', category: '', style: '', product_desc: '',
      }]);
      mockVideoService.uploadVideo.mockResolvedValue({ success: true, videoId: 'vid-1' });

      const results = await scheduler.processQueue();
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should skip if already processing', async () => {
      scheduler._processing = true;
      const results = await scheduler.processQueue();
      expect(results).toEqual([]);
    });

    it('should filter by pageId when provided', async () => {
      await scheduler.processQueue({ pageId: 'page-1' });
      expect(mockQueueRepo.findPendingByPage).toHaveBeenCalledWith('page-1', expect.any(Number));
    });

    it('should handle upload failure', async () => {
      mockQueueRepo.findPendingAll.mockReturnValue([{
        id: 'q1', page_id: 'page-1', file_path: '/tmp/video.mp4',
        caption: 'Test', hashtags: '[]',
      }]);
      mockVideoService.uploadVideo.mockResolvedValue({ success: false, error: 'Upload error' });

      const results = await scheduler.processQueue();
      expect(results[0].success).toBe(false);
      expect(mockQueueRepo.updateFailed).toHaveBeenCalled();
    });
  });

  describe('cancelSchedule', () => {
    it('should cancel a pending item', () => {
      mockQueueRepo.findById.mockReturnValue({ id: 'q1', status: 'pending' });
      const result = scheduler.cancelSchedule('q1');
      expect(result.success).toBe(true);
      expect(mockQueueRepo.cancelById).toHaveBeenCalledWith('q1', expect.any(Number), undefined);
    });

    it('should fail if item not found', () => {
      mockQueueRepo.findById.mockReturnValue(null);
      const result = scheduler.cancelSchedule('q1');
      expect(result.success).toBe(false);
    });

    it('should fail if item is not pending', () => {
      mockQueueRepo.findById.mockReturnValue({ id: 'q1', status: 'completed' });
      const result = scheduler.cancelSchedule('q1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot cancel');
    });
  });

  describe('getQueueStatus / getQueue', () => {
    it('should return status counts', () => {
      expect(scheduler.getQueueStatus()).toEqual({ pending: 0, completed: 0, failed: 0 });
    });

    it('should return queue items by status', () => {
      scheduler.getQueue('pending', 10);
      expect(mockQueueRepo.findByStatus).toHaveBeenCalledWith('pending', 10, undefined);
    });
  });

  describe('_generateCaption', () => {
    it('should generate caption via LLM', async () => {
      const result = await scheduler._generateCaption({ category: 'fashion', style: 'lifestyle', productDesc: 'dress' });
      expect(result.caption).toBe('Test caption');
      expect(result.hashtags).toEqual(['#test', '#viral']);
    });

    it('should fallback on LLM failure', async () => {
      mockLlmClient.call.mockRejectedValue(new Error('LLM error'));
      const result = await scheduler._generateCaption({ category: 'fashion', productDesc: 'dress' });
      expect(result.caption).toContain('dress');
    });
  });

  describe('_parseCaptionResponse', () => {
    it('should parse clean JSON', () => {
      const result = scheduler._parseCaptionResponse('{"caption":"test","hashtags":["#t"],"hook":"h","cta":"c"}');
      expect(result.caption).toBe('test');
    });

    it('should strip markdown fencing', () => {
      const result = scheduler._parseCaptionResponse('```json\n{"caption":"test","hashtags":[],"hook":"","cta":""}\n```');
      expect(result.caption).toBe('test');
    });
  });

  describe('_getCaptionFallback', () => {
    it('should return fallback with product description', () => {
      const result = scheduler._getCaptionFallback({ category: 'fashion', productDesc: 'dress' });
      expect(result.caption).toContain('dress');
    });

    it('should return generic fallback without product description', () => {
      const result = scheduler._getCaptionFallback({});
      expect(result.caption).toContain('produk terbaru');
    });
  });
});
